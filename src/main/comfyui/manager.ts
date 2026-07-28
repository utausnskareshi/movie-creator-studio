import { spawn, type ChildProcess } from 'child_process'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createServer } from 'net'
import type { EngineStatus } from '@shared/types'
import { comfyMain, comfyPython, comfyRoot, configDir, engineInputDir, engineOutputDir } from '../core/paths'
import { extraModelPathsFile, writeExtraModelPaths } from '../setup/installer'
import { ComfyClient } from './client'

type StatusCb = (s: EngineStatus) => void

const READY_TIMEOUT_MS = 120_000
const HEALTH_INTERVAL_MS = 15_000

export class ComfyManager {
  private proc: ChildProcess | null = null
  private clientInstance: ComfyClient | null = null
  private status: EngineStatus = { state: 'stopped', port: null, pid: null }
  private listeners = new Set<StatusCb>()
  private healthTimer: NodeJS.Timeout | null = null
  private restartAttempts = 0
  private everReady = false
  private stopping = false
  private startPromise: Promise<EngineStatus> | null = null

  onStatus(cb: StatusCb): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getStatus(): EngineStatus {
    return this.status
  }

  client(): ComfyClient {
    if (!this.clientInstance) throw new Error('engine is not running')
    return this.clientInstance
  }

  isRunning(): boolean {
    return this.status.state === 'running'
  }

  private setStatus(patch: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...patch }
    for (const l of this.listeners) l(this.status)
  }

  async ensureRunning(): Promise<EngineStatus> {
    if (this.status.state === 'running') return this.status
    if (this.status.state === 'starting') {
      await this.waitForState(['running', 'error', 'stopped'])
      const now = this.getStatus()
      if (now.state !== 'running') throw new Error(now.lastError ?? 'engine failed to start')
      return now
    }
    return this.start()
  }

  async start(opts?: { fromCrashRestart?: boolean }): Promise<EngineStatus> {
    // any start that is NOT the automatic crash-restart (user pressed 起動, or
    // a job needs the engine) clears the crash budget
    if (!opts?.fromCrashRestart) this.restartAttempts = 0
    // only treat an existing child as "already started" while it is actually
    // usable; a proc that outlived a stop() must not short-circuit a restart
    if (this.proc && (this.status.state === 'running' || this.status.state === 'starting')) {
      return this.status
    }
    // dedupe concurrent starts: ensureRunning() and the crash-restart timer can
    // both call start(); without this the freePort() await window lets two
    // ComfyUI processes spawn on different ports
    if (this.startPromise) return this.startPromise
    this.startPromise = this.doStart()
      .catch((e: unknown) => {
        // never leave the manager parked in 'starting': ensureRunning() waits
        // on a state change and would otherwise hang for the whole session
        if (this.status.state === 'starting') {
          this.setStatus({
            state: 'error',
            pid: null,
            lastError: e instanceof Error ? e.message : String(e)
          })
        }
        throw e
      })
      .finally(() => {
        this.startPromise = null
      })
    return this.startPromise
  }

  private async doStart(): Promise<EngineStatus> {
    if (this.proc && (this.status.state === 'running' || this.status.state === 'starting')) {
      return this.status
    }
    if (!existsSync(comfyMain()) || !existsSync(comfyPython())) {
      throw new Error('ComfyUI is not installed — run setup first')
    }
    this.stopping = false
    // regenerate on every start: keeps existing installs in sync when an app
    // update introduces model folders the install-time yaml didn't know about
    writeExtraModelPaths()
    const port = await freePort()
    // a stop()/quit that landed while freePort() was awaited must not be
    // undone by spawning a fresh engine here
    if (this.stopping) throw new Error('起動をキャンセルしました')
    this.setStatus({ state: 'starting', port, pid: null, lastError: undefined })

    const args = [
      '-s',
      comfyMain(),
      '--windows-standalone-build',
      '--disable-auto-launch',
      '--listen',
      '127.0.0.1',
      '--port',
      String(port),
      '--extra-model-paths-config',
      extraModelPathsFile(),
      '--output-directory',
      engineOutputDir(),
      '--input-directory',
      engineInputDir(),
      '--preview-method',
      'auto',
      '--reserve-vram',
      '1.0'
    ]

    const logDir = join(configDir(), 'logs')
    mkdirSync(logDir, { recursive: true })
    const log = createWriteStream(join(logDir, 'comfyui.log'), { flags: 'a' })
    log.on('error', () => undefined) // disk-full etc. must not crash the app
    log.write(`\n===== ComfyUI start ${new Date().toISOString()} port=${port} =====\n`)

    const proc = spawn(comfyPython(), args, {
      cwd: comfyRoot(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.proc = proc
    // without a listener, a spawn failure (ENOENT/EACCES) is an uncaught
    // 'error' event and would take the whole main process down
    proc.on('error', (e) => {
      try {
        log.write(`===== ComfyUI spawn error: ${e.message} =====\n`)
      } catch {
        /* ignore */
      }
      this.proc = null
      this.setStatus({ state: 'error', pid: null, lastError: `起動に失敗しました: ${e.message}` })
    })
    proc.stdout?.on('data', (d) => log.write(d))
    proc.stderr?.on('data', (d) => log.write(d))
    proc.on('exit', (code) => {
      log.write(`===== ComfyUI exited code=${code} =====\n`)
      // release the log file: a new stream is opened on every start, so
      // without this each start/crash-restart cycle leaked a file handle
      log.end()
      this.proc = null
      this.clientInstance?.closeWs()
      this.clientInstance = null
      this.stopHealthTimer()
      const wasRunning = this.status.state === 'running'
      // keep an explicit 'error' surface (ready-timeout, unresponsive engine):
      // downgrading it to 'stopped' here hid the message the user needs
      if (this.status.state !== 'error') this.setStatus({ state: 'stopped', pid: null })
      else this.setStatus({ pid: null })
      if (!this.stopping && wasRunning && this.everReady && this.restartAttempts < 3) {
        // crash after a successful start: exponential-backoff restart
        const delay = 2000 * 2 ** this.restartAttempts
        this.restartAttempts += 1
        setTimeout(() => {
          if (!this.proc && !this.stopping) {
            void this.start({ fromCrashRestart: true }).catch(() => undefined)
          }
        }, delay)
      }
    })

    this.setStatus({ pid: proc.pid ?? null })

    const client = new ComfyClient(port)
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (!this.proc) {
        // prefer the specific spawn-error message when we captured one
        throw new Error(this.status.lastError ?? 'ComfyUI process exited during startup — check logs/comfyui.log')
      }
      const stats = await client.systemStats()
      if (stats) {
        this.clientInstance = client
        client.connectWs()
        this.everReady = true
        // NOTE: restartAttempts is deliberately NOT reset here. Resetting on
        // every successful readiness check defeated the `< 3` crash-loop cap,
        // because a crash loop reaches 'ready' on each attempt. It is reset
        // only by an explicit user start (see start()).
        this.setStatus({
          state: 'running',
          comfyuiVersion: stats.comfyuiVersion,
          vramTotalMB: stats.vramTotalMB,
          vramFreeMB: stats.vramFreeMB
        })
        this.startHealthTimer()
        return this.status
      }
      await sleep(1000)
    }
    // startup timeout: kill and report, do NOT auto-restart (avoids crash loops on broken installs)
    this.stopping = true
    proc.kill()
    this.setStatus({ state: 'error', lastError: 'ComfyUI did not become ready in time' })
    throw new Error('ComfyUI did not become ready in time — check logs/comfyui.log')
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.stopHealthTimer()
    this.clientInstance?.closeWs()
    this.clientInstance = null
    const proc = this.proc
    if (proc) {
      const exited = new Promise<void>((resolve) => {
        if (!this.proc) return resolve()
        proc.once('exit', () => resolve())
      })
      proc.kill()
      // give it a moment, then force-kill the tree
      await sleep(1500)
      if (this.proc) {
        try {
          const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
            windowsHide: true
          })
          // an un-listened 'error' event here would take down the main process
          killer.on('error', () => undefined)
        } catch {
          /* already gone */
        }
        // WAIT for the exit event. Returning while this.proc is still set made
        // the next start() take its `if (this.proc) return this.status` early
        // exit and silently do nothing, so every later job failed with
        // "engine is not running" until the app was restarted.
        await Promise.race([exited, sleep(5000)])
      }
      this.proc = null
    }
    this.setStatus({ state: 'stopped', pid: null })
  }

  /** Free VRAM; if it stays low, restart the engine transparently. */
  async freeVram(): Promise<void> {
    if (!this.clientInstance) return
    await this.clientInstance.freeMemory()
  }

  private startHealthTimer(): void {
    this.stopHealthTimer()
    let consecutiveFailures = 0
    this.healthTimer = setInterval(async () => {
      if (!this.clientInstance) return
      const stats = await this.clientInstance.systemStats()
      if (stats) {
        consecutiveFailures = 0
        this.setStatus({ vramFreeMB: stats.vramFreeMB, vramTotalMB: stats.vramTotalMB })
        return
      }
      // A process that is alive but no longer answering used to be reported as
      // 'running' forever, so a job waited on it indefinitely and the queue
      // wedged. Surface it after 3 consecutive misses — and KILL the wedged
      // process: left resident, the next start() would spawn a second engine
      // beside it (two pythons, VRAM held twice over).
      consecutiveFailures += 1
      if (consecutiveFailures >= 3 && this.status.state === 'running') {
        this.stopHealthTimer()
        void this.stop().finally(() => {
          this.setStatus({
            state: 'error',
            lastError: 'エンジンが応答しません(logs/comfyui.log を確認してください)'
          })
        })
      }
    }, HEALTH_INTERVAL_MS)
  }

  private stopHealthTimer(): void {
    if (this.healthTimer) clearInterval(this.healthTimer)
    this.healthTimer = null
  }

  private async waitForState(states: EngineStatus['state'][]): Promise<void> {
    if (states.includes(this.status.state)) return
    await new Promise<void>((resolve) => {
      const off = this.onStatus((s) => {
        if (states.includes(s.state)) {
          off()
          resolve()
        }
      })
    })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('could not allocate port')))
      }
    })
    srv.on('error', reject)
  })
}

export const comfyManager = new ComfyManager()
