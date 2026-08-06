import { app, BrowserWindow, Notification } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'
// STATIC import — the bundler turns this into require() in the CJS main
// bundle. The previous code used dynamic import('electron-updater'), whose
// ESM namespace does NOT contain `autoUpdater`: the package defines it as a
// lazy Object.defineProperty getter on module.exports, which Node's CJS
// named-export scan (cjs-module-lexer) cannot detect. `{ autoUpdater }` came
// back undefined, `.on()` threw, and the trailing .catch(() => undefined)
// silently disabled the whole update path — no log, no notification
// (v1.0.0/v1.1.0 で実機再現・検証済み)。
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { UpdaterState } from '@shared/types'
import { IPC } from '@shared/types'
import { configDir } from './core/paths'
import { comfyManager } from './comfyui/manager'
import { llmManager } from './llm/manager'

// electron-builder.yml の publish が指す utausnskareshi/movie-creator-studio
// の GitHub Releases をフィードとして参照する(resources/app-update.yml)。
const AUTO_UPDATE_ENABLED = true

const state: UpdaterState = {
  supported: false,
  currentVersion: '',
  status: 'idle'
}
let notifiedVersion: string | null = null
let initialized = false
// true from the moment the user confirms "restart now" until the app exits:
// the queue refuses new generations so nothing can spawn an engine that would
// outlive the process (see installUpdateNow).
let applyingUpdate = false
export function isApplyingUpdate(): boolean {
  return applyingUpdate
}

/** logs/updater.log — the only place update activity is recorded, so every
 *  event writes here (a silent failure must never happen again). */
function ulog(line: string): void {
  try {
    const dir = join(configDir(), 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'updater.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    // logging must never break the app
  }
}

function push(patch: Partial<UpdaterState>): void {
  Object.assign(state, patch)
  const snapshot = { ...state }
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) win.webContents.send(IPC.evUpdaterState, snapshot)
    } catch {
      // a window can be mid-destroy while an event fires
    }
  }
}

export function getUpdaterState(): UpdaterState {
  return { ...state }
}

/**
 * Kick off a check. Events drive the state/UI from here on; the returned
 * snapshot only reflects the moment right after the check started.
 * No-ops while a check/download is in flight or an update is already staged.
 */
export async function checkForUpdatesNow(origin: 'startup' | 'manual'): Promise<UpdaterState> {
  if (!state.supported) return getUpdaterState()
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'downloaded') {
    return getUpdaterState()
  }
  ulog(`check (${origin}) from v${state.currentVersion}`)
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // the 'error' listener has already logged and pushed the failure state
  }
  // A settled check that emitted no terminal event would leave status stuck
  // on 'checking' — which this function itself treats as "busy", permanently
  // disabling the manual button. Release it. (Read through getUpdaterState:
  // the event handlers mutate `state` during the await above, which the
  // guard's narrowing at the top of this function does not account for.)
  if (getUpdaterState().status === 'checking') push({ status: 'idle' })
  return getUpdaterState()
}

/**
 * Quit, run the staged NSIS update silently, then relaunch the app.
 *
 * The engine MUST be stopped and awaited first. quitAndInstall() spawns the
 * installer and then calls app.quit(); the app's 'before-quit' handler only
 * *starts* comfyManager.stop() without awaiting it, so the process would exit
 * with python.exe still alive — and that child's cwd is the engine folder,
 * which then can't be deleted (実測: ロック中のCWDは rmSync を EPERM にする)。
 * That orphan is exactly what makes a later「エンジンを更新」fail.
 */
export async function installUpdateNow(): Promise<void> {
  if (!state.supported || state.status !== 'downloaded') return
  if (applyingUpdate) return // re-entry (double click) — one shutdown is enough
  // Raise the gate BEFORE the first await: stopping the engine takes seconds,
  // and a generation started in that window would spawn a fresh python.exe
  // moments before the app exits — re-creating the very orphan this function
  // exists to avoid. Set synchronously so no enqueue can slip through.
  applyingUpdate = true
  ulog('stopping engines before quitAndInstall')
  llmManager.stop()
  await comfyManager.stop().catch(() => undefined)
  ulog('quitAndInstall (user requested restart)')
  autoUpdater.quitAndInstall(true, true)
  // quitAndInstall returns without quitting when the staged installer can't
  // be launched (it neither throws nor reports). If we are still alive after
  // that, release the gate — otherwise generation stays blocked for the rest
  // of the session. The update itself is still staged and applies on quit.
  setTimeout(() => {
    if (!applyingUpdate) return
    applyingUpdate = false
    ulog('still running after quitAndInstall — update not applied now (stays staged for quit)')
  }, 10_000).unref?.()
}

export function initUpdater(): void {
  if (initialized) return
  initialized = true
  state.currentVersion = app.getVersion()
  state.supported = app.isPackaged && AUTO_UPDATE_ENABLED
  if (!state.supported) return

  // defaults, pinned explicitly: download in the background, install on quit
  // (the NSIS updater then runs with --updated /S; installer.nsh preserves
  // data and user files on that path)
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => push({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    ulog(`update-available: ${info.version}`)
    push({ status: 'downloading', latestVersion: info.version, percent: 0, error: undefined })
  })
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    ulog(`up to date (feed latest: ${info.version})`)
    push({
      status: 'not-available',
      latestVersion: info.version,
      checkedAt: Date.now(),
      error: undefined
    })
  })
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    push({ status: 'downloading', percent: Math.max(0, Math.min(100, Math.round(p.percent))) })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    ulog(`update-downloaded: ${info.version}`)
    push({
      status: 'downloaded',
      latestVersion: info.version,
      percent: 100,
      checkedAt: Date.now(),
      error: undefined
    })
    if (notifiedVersion !== info.version && Notification.isSupported()) {
      notifiedVersion = info.version
      new Notification({
        title: 'Movie Creator Studio の更新',
        body: `新しいバージョン ${info.version} をダウンロードしました。アプリの終了時に自動的に適用されます。`
      }).show()
    }
  })
  autoUpdater.on('error', (e) => {
    const msg = e instanceof Error ? e.message : String(e)
    ulog(`error: ${msg}`)
    push({ status: 'error', error: msg.slice(0, 300), checkedAt: Date.now() })
  })

  void checkForUpdatesNow('startup')
}
