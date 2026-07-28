import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createServer } from 'net'
import type { ModelFamily } from '@shared/types'
import { configDir, llmModelPath, llmServerExe } from '../core/paths'
import { SYSTEM_PROMPTS, cleanLlmOutput } from './prompts'

// ---------------------------------------------------------------------------
// llama.cpp (llama-server) lifecycle. CPU-only: never touches the GPU, so it
// can run alongside video generation. Started on demand, stopped after idle.
// ---------------------------------------------------------------------------

const IDLE_STOP_MS = 10 * 60_000
const READY_TIMEOUT_MS = 60_000

class LlmManager {
  private proc: ChildProcess | null = null
  private port: number | null = null
  /** true only once /health answered — proc/port are set before that */
  private ready = false
  private starting: Promise<void> | null = null
  private idleTimer: NodeJS.Timeout | null = null

  installed(): boolean {
    return existsSync(llmServerExe()) && existsSync(llmModelPath())
  }

  async translate(family: ModelFamily, japaneseText: string): Promise<string> {
    if (!this.installed()) {
      throw new Error('プロンプト変換AIが未導入です — セットアップ画面からインストールしてください')
    }
    const text = japaneseText.trim()
    if (!text) throw new Error('変換するテキストが空です')
    await this.ensureRunning()
    this.touchIdle()

    const res = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[family] },
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        top_p: 0.8,
        max_tokens: 360,
        stream: false
      }),
      signal: AbortSignal.timeout(180_000)
    })
    if (!res.ok) throw new Error(`LLM応答エラー: HTTP ${res.status}`)
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const out = cleanLlmOutput(j.choices?.[0]?.message?.content ?? '')
    if (!out) throw new Error('LLMが空の応答を返しました — もう一度お試しください')
    this.touchIdle()
    return out
  }

  private async ensureRunning(): Promise<void> {
    // `ready` (not just proc/port) — start() assigns those BEFORE the health
    // wait, so a second translate arriving during model load used to skip the
    // wait and fail against a server that was not accepting requests yet
    if (this.proc && this.port && this.ready) return
    if (this.starting) return this.starting
    this.starting = this.start().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async start(): Promise<void> {
    const port = await freePort()
    const logDir = join(configDir(), 'logs')
    mkdirSync(logDir, { recursive: true })
    const log = createWriteStream(join(logDir, 'llm.log'), { flags: 'a' })
    log.write(`\n===== llama-server start ${new Date().toISOString()} port=${port} =====\n`)

    const proc = spawn(
      llmServerExe(),
      [
        '-m',
        llmModelPath(),
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '-c',
        '4096',
        '--jinja'
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    log.on('error', () => undefined) // disk-full etc. must not crash the app
    proc.stdout?.on('data', (d) => log.write(d))
    proc.stderr?.on('data', (d) => log.write(d))
    proc.on('error', (e) => {
      // unhandled 'error' (ENOENT/EACCES) on a child process crashes main
      try {
        log.write(`===== llama-server spawn error: ${e.message} =====\n`)
      } catch {
        /* ignore */
      }
      this.proc = null
      this.port = null
      this.ready = false
      this.clearIdle()
    })
    proc.on('exit', (code) => {
      log.write(`===== llama-server exited code=${code} =====\n`)
      log.end() // one stream per start; leaked a handle without this
      this.proc = null
      this.port = null
      this.ready = false
      this.clearIdle()
    })
    this.proc = proc
    this.port = port

    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (!this.proc) throw new Error('プロンプト変換AIの起動に失敗しました(logs/llm.log 参照)')
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(2000)
        })
        if (res.ok) {
          this.ready = true
          this.touchIdle()
          return
        }
      } catch {
        /* not ready yet */
      }
      await new Promise((r) => setTimeout(r, 800))
    }
    this.stop()
    throw new Error('プロンプト変換AIが時間内に起動しませんでした(logs/llm.log 参照)')
  }

  stop(): void {
    this.clearIdle()
    this.ready = false
    if (this.proc) {
      try {
        this.proc.kill()
      } catch {
        /* already gone */
      }
      this.proc = null
      this.port = null
    }
  }

  private touchIdle(): void {
    this.clearIdle()
    // free the ~4GB of RAM when unused for a while
    this.idleTimer = setTimeout(() => this.stop(), IDLE_STOP_MS)
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const p = addr.port
        srv.close(() => resolve(p))
      } else {
        srv.close(() => reject(new Error('could not allocate port')))
      }
    })
    srv.on('error', reject)
  })
}

export const llmManager = new LlmManager()
