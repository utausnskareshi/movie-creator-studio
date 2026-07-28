import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { basename } from 'path'

/** API-format workflow: nodeId -> { class_type, inputs } */
export type WorkflowGraph = Record<
  string,
  { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
>

export interface PromptQueued {
  promptId: string
}

export interface HistoryOutputFile {
  filename: string
  subfolder: string
  type: string
}

export interface ProgressEvent {
  kind: 'progress'
  value: number
  max: number
  node: string | null
  /** null on engine builds whose progress frames omit prompt_id */
  promptId: string | null
}
export interface ExecutingEvent {
  kind: 'executing'
  node: string | null
  promptId: string | null
}
export interface ExecErrorEvent {
  kind: 'error'
  message: string
  nodeType?: string
  /** null on engine builds whose error frames omit prompt_id */
  promptId: string | null
}
export interface PreviewEvent {
  kind: 'preview'
  mime: 'image/jpeg' | 'image/png'
  data: Buffer
}
export interface SuccessEvent {
  kind: 'success'
  promptId: string
}
export type ComfyEvent = ProgressEvent | ExecutingEvent | ExecErrorEvent | PreviewEvent | SuccessEvent

export class ComfyClient {
  readonly clientId = randomUUID()
  private ws: WebSocket | null = null
  /** true once closeWs() was called on purpose — suppresses the reconnect */
  private wsClosed = false
  private wsRetry: NodeJS.Timeout | null = null
  private listeners = new Set<(ev: ComfyEvent) => void>()

  constructor(private readonly port: number) {}

  base(): string {
    return `http://127.0.0.1:${this.port}`
  }

  onEvent(cb: (ev: ComfyEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(ev: ComfyEvent): void {
    for (const l of this.listeners) l(ev)
  }

  async systemStats(): Promise<{
    comfyuiVersion?: string
    vramTotalMB?: number
    vramFreeMB?: number
  } | null> {
    try {
      const res = await fetch(`${this.base()}/system_stats`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return null
      const j = (await res.json()) as {
        system?: { comfyui_version?: string }
        devices?: Array<{ vram_total?: number; vram_free?: number }>
      }
      const dev = j.devices?.[0]
      return {
        comfyuiVersion: j.system?.comfyui_version,
        vramTotalMB: dev?.vram_total ? Math.round(dev.vram_total / 1024 / 1024) : undefined,
        vramFreeMB: dev?.vram_free ? Math.round(dev.vram_free / 1024 / 1024) : undefined
      }
    } catch {
      return null
    }
  }

  async objectInfoClasses(): Promise<Set<string>> {
    const res = await fetch(`${this.base()}/object_info`)
    if (!res.ok) throw new Error(`object_info HTTP ${res.status}`)
    const j = (await res.json()) as Record<string, unknown>
    return new Set(Object.keys(j))
  }

  connectWs(): void {
    if (this.ws) return
    // an explicit connect supersedes a scheduled retry — without this a
    // pending timer could stack a second (harmless but pointless) attempt
    if (this.wsRetry) {
      clearTimeout(this.wsRetry)
      this.wsRetry = null
    }
    this.wsClosed = false
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws?clientId=${this.clientId}`)
    ws.binaryType = 'arraybuffer'
    ws.addEventListener('message', (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data) as { type: string; data: Record<string, unknown> }
          this.handleJson(msg)
        } catch {
          /* ignore malformed frames */
        }
      } else if (ev.data instanceof ArrayBuffer) {
        this.handleBinary(Buffer.from(ev.data))
      }
    })
    ws.addEventListener('close', () => {
      this.ws = null
      // One dropped socket used to kill progress, live previews and the
      // completion event for the rest of the engine's life (the /history
      // watchdog still finished jobs, but blind). Reconnect unless we closed
      // it on purpose.
      if (!this.wsClosed) {
        this.wsRetry = setTimeout(() => {
          this.wsRetry = null
          if (!this.wsClosed) this.connectWs()
        }, 2000)
      }
    })
    ws.addEventListener('error', () => {
      /* close event follows */
    })
    this.ws = ws
  }

  closeWs(): void {
    this.wsClosed = true
    if (this.wsRetry) {
      clearTimeout(this.wsRetry)
      this.wsRetry = null
    }
    this.ws?.close()
    this.ws = null
  }

  private handleJson(msg: { type: string; data: Record<string, unknown> }): void {
    const d = msg.data ?? {}
    switch (msg.type) {
      case 'progress':
        this.emit({
          kind: 'progress',
          value: Number(d.value ?? 0),
          max: Number(d.max ?? 1),
          node: (d.node as string) ?? null,
          promptId: (d.prompt_id as string) ?? null
        })
        break
      case 'executing':
        this.emit({
          kind: 'executing',
          node: (d.node as string | null) ?? null,
          promptId: (d.prompt_id as string) ?? null
        })
        break
      case 'execution_success':
        this.emit({ kind: 'success', promptId: String(d.prompt_id ?? '') })
        break
      case 'execution_error': {
        const message = [d.node_type, d.exception_type, d.exception_message]
          .filter(Boolean)
          .join(' — ')
        this.emit({
          kind: 'error',
          message: message || 'execution_error',
          nodeType: d.node_type as string,
          promptId: (d.prompt_id as string) ?? null
        })
        break
      }
      default:
        break
    }
  }

  /** Binary WS frame: 4-byte BE event type (1 = preview image), 4-byte BE format (1=jpeg, 2=png), then bytes. */
  private handleBinary(buf: Buffer): void {
    if (buf.length < 8) return
    const event = buf.readUInt32BE(0)
    if (event !== 1) return
    const format = buf.readUInt32BE(4)
    this.emit({
      kind: 'preview',
      mime: format === 2 ? 'image/png' : 'image/jpeg',
      data: buf.subarray(8)
    })
  }

  async queuePrompt(graph: WorkflowGraph): Promise<PromptQueued> {
    // bounded: a wedged engine must fail the job, not hang it forever
    // (an eternally-"running" job would also freeze all navigation)
    let res: Response
    try {
      res = await fetch(`${this.base()}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: graph, client_id: this.clientId }),
        signal: AbortSignal.timeout(60_000)
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        throw new Error('エンジンへの送信がタイムアウトしました(60秒応答なし)。設定画面からエンジンを再起動してください')
      }
      throw e
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { error?: { message?: string } | string; node_errors?: unknown }
        detail =
          typeof j.error === 'string'
            ? j.error
            : (j.error?.message ?? detail) +
              (j.node_errors ? ` ${JSON.stringify(j.node_errors).slice(0, 500)}` : '')
      } catch {
        /* keep status text */
      }
      throw new Error(`ComfyUI rejected the workflow: ${detail}`)
    }
    const j = (await res.json()) as { prompt_id: string }
    return { promptId: j.prompt_id }
  }

  async interrupt(): Promise<void> {
    await fetch(`${this.base()}/interrupt`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000)
    }).catch(() => undefined)
  }

  /**
   * Remove a prompt from the engine's pending queue. /interrupt only stops the
   * RUNNING prompt — a cancel that lands while the prompt is still queued
   * engine-side would otherwise let the whole generation run as a zombie.
   */
  async deleteQueued(promptId: string): Promise<void> {
    await fetch(`${this.base()}/queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delete: [promptId] }),
      signal: AbortSignal.timeout(10_000)
    }).catch(() => undefined)
  }

  async freeMemory(): Promise<void> {
    await fetch(`${this.base()}/free`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(10_000)
    }).catch(() => undefined)
  }

  /**
   * Completion state of a prompt from /history — the reliable fallback when a
   * WS event is missed or the socket drops. 'unknown' = not in history yet.
   */
  async historyState(promptId: string): Promise<'completed' | 'error' | 'running' | 'unknown'> {
    let res: Response
    try {
      res = await fetch(`${this.base()}/history/${promptId}`, { signal: AbortSignal.timeout(5000) })
    } catch {
      return 'unknown'
    }
    if (!res.ok) return 'unknown'
    const j = (await res.json()) as Record<string, { status?: { status_str?: string; completed?: boolean } }>
    const entry = j[promptId]
    if (!entry) return 'unknown'
    if (entry.status?.status_str === 'error') return 'error'
    if (entry.status?.completed) return 'completed'
    return 'running'
  }

  /** Files produced by the given prompt, from /history. */
  async historyOutputs(promptId: string): Promise<HistoryOutputFile[]> {
    const res = await fetch(`${this.base()}/history/${promptId}`, {
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) throw new Error(`history HTTP ${res.status}`)
    const j = (await res.json()) as Record<
      string,
      { outputs?: Record<string, Record<string, unknown>> }
    >
    const entry = j[promptId]
    const files: HistoryOutputFile[] = []
    if (!entry?.outputs) return files
    for (const nodeOut of Object.values(entry.outputs)) {
      for (const val of Object.values(nodeOut)) {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object' && 'filename' in item) {
              const f = item as Record<string, string>
              files.push({
                filename: f.filename,
                subfolder: f.subfolder ?? '',
                type: f.type ?? 'output'
              })
            }
          }
        }
      }
    }
    return files
  }

  /** Upload an input image; returns the server-side filename to reference in LoadImage. */
  async uploadImage(absPath: string): Promise<string> {
    return this.uploadInputFile(absPath)
  }

  /**
   * Upload any input file (image/audio/video) to ComfyUI's input dir via
   * /upload/image (it stores the file regardless of type). Returns the
   * server-side name to reference in LoadImage/LoadAudio/LoadVideo.
   */
  async uploadInputFile(absPath: string): Promise<string> {
    const data = readFileSync(absPath)
    const name = `${Date.now()}_${basename(absPath).replace(/[^\w.-]+/g, '_')}`
    const form = new FormData()
    form.append('image', new Blob([new Uint8Array(data)]), name)
    form.append('overwrite', 'true')
    const res = await fetch(`${this.base()}/upload/image`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(300_000)
    })
    if (!res.ok) throw new Error(`upload HTTP ${res.status}`)
    const j = (await res.json()) as { name: string; subfolder?: string }
    return j.subfolder ? `${j.subfolder}/${j.name}` : j.name
  }
}
