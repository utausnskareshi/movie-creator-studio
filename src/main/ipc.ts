import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  AppSettings,
  DownloadProgress,
  ExportRequest,
  GenerationRequest,
  SetupComponent,
  VideoRecord
} from '@shared/types'
import { IPC } from '@shared/types'
import { getSettings, updateSettings } from './core/settings'
import { sanitizeDataDir } from './core/datadir'
import { configDir, ensureDirs, libraryDir, modelsDir } from './core/paths'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { allowPickedPath, isOpenPathAllowed } from './core/mediaAccess'
import { getEnvInfo } from './core/env'
import {
  beginEngineInstallGate,
  downloadModelFile,
  endEngineInstallGate,
  getSetupStatus,
  installComfyUI,
  installCustomNode,
  installFfmpeg,
  installLlm,
  isEngineInstallActive
} from './setup/installer'
import { llmManager } from './llm/manager'
import { cancelDownload, DownloadCancelledError, hasActiveDownload, isDownloadActive } from './core/downloader'
import { MODEL_PACKS, allModelFiles } from './models/registry'
import { comfyManager } from './comfyui/manager'
import { checkForUpdatesNow, getUpdaterState, installUpdateNow, isApplyingUpdate } from './updater'
import { jobQueue } from './jobs/queue'
import { library } from './library/store'
import { EXPORT_PRESETS } from './media/presets'
import { cancelExport, hasActiveExport, startExport } from './media/exporter'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    // a window can be mid-destroy while a progress event fires — never throw
    try {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    } catch {
      /* ignore */
    }
  }
}

export function registerIpc(): void {
  // --- env / settings -------------------------------------------------------
  ipcMain.handle(IPC.getEnv, () => getEnvInfo(getSettings().dataDir))
  ipcMain.handle(IPC.getSettings, () => getSettings())
  ipcMain.handle(IPC.setSettings, async (_e, patch: Partial<AppSettings>) => {
    // accept only known keys with the right types (renderer input is untrusted;
    // lastDirs is main-managed via the pickers and deliberately not settable here)
    const clean: Partial<AppSettings> = {}
    if (patch?.language === 'ja' || patch?.language === 'en') clean.language = patch.language
    const dataDir = sanitizeDataDir(patch?.dataDir)
    if (dataDir) clean.dataDir = dataDir
    // https only: a plaintext mirror would let a network attacker replace the
    // model weights (and, before the hfPathInfo ordering fix, the checksum too)
    if (patch?.hfMirror === null) clean.hfMirror = null
    else if (typeof patch?.hfMirror === 'string' && /^https:\/\/\S+$/.test(patch.hfMirror.trim())) {
      clean.hfMirror = patch.hfMirror.trim()
    }
    if (typeof patch?.useNvenc === 'boolean') clean.useNvenc = patch.useNvenc
    if (typeof patch?.vramLimitEnabled === 'boolean') clean.vramLimitEnabled = patch.vramLimitEnabled
    // a dataDir move invalidates every path the running engines were started
    // with (output dir, models yaml, llm binary) — stop them so the next use
    // relaunches against the new location
    if (clean.dataDir && clean.dataDir !== getSettings().dataDir) {
      // PROVE the folder is usable BEFORE persisting it. Storing an
      // unwritable path (C:\Program Files, a disconnected drive) used to
      // succeed here and then fail in ensureDirs() — the setting was already
      // on disk, so the next launch died in app.whenReady() with no window.
      try {
        mkdirSync(join(clean.dataDir, 'engine'), { recursive: true })
      } catch (e) {
        throw new Error(
          `このフォルダは使用できません(書き込み権限がないか、ドライブに接続できません): ${clean.dataDir}\n` +
            (e instanceof Error ? e.message : String(e))
        )
      }
      await comfyManager.stop().catch(() => undefined)
      llmManager.stop()
    }
    const s = updateSettings(clean)
    ensureDirs()
    return s
  })

  // --- setup -----------------------------------------------------------------
  ipcMain.handle(IPC.getSetupStatus, () => getSetupStatus())
  ipcMain.handle(IPC.getModelCatalog, () => MODEL_PACKS)
  ipcMain.handle(IPC.installComponent, async (_e, component: SetupComponent) => {
    // reverse gate: once the app has committed to quitting, a pip/extract child
    // started here would be orphaned mid-write when the process exits
    if (isApplyingUpdate()) {
      throw new Error('アプリの更新を適用中です。再起動後にもう一度お試しください。')
    }
    ensureDirs()
    let last: DownloadProgress | null = null
    const cb = (p: DownloadProgress): void => {
      last = p
      broadcast(IPC.evDownloadProgress, p)
    }
    try {
      // (re)installing over a RUNNING process would hit locked exe/dll files
      // mid-extract — stop the corresponding runtime first
      if (component === 'comfyui') {
        // Raise the gate FIRST: comfyManager.stop() below can take several
        // seconds, and until installComfyUI set its own gate a generation
        // could slip in and boot the engine mid-wipe. Order matters —
        // gate up → then reject if a job is already active (an enqueue that
        // raced past the gate check is caught here by hasActive).
        beginEngineInstallGate()
        try {
          // an engine wipe mid-generation would kill the running render AND
          // fail on locked files — refuse up front with a clear reason
          if (jobQueue.hasActive()) {
            throw new Error(
              '生成の実行中はエンジンのインストール・更新はできません。生成の完了(または中止)後にもう一度お試しください。'
            )
          }
          await comfyManager.stop().catch(() => undefined)
          await installComfyUI(cb)
        } finally {
          endEngineInstallGate()
        }
      } else if (component === 'ffmpeg') await installFfmpeg(cb)
      else if (component === 'llm') {
        llmManager.stop()
        await installLlm(cb)
      } else if (component.startsWith('customnode:')) {
        // A node install writes INTO the engine tree (pip into the embedded
        // site-packages, files into custom_nodes) — the same tree an engine
        // update renames away, and whose processes killProcessesUnder() kills,
        // which would take this pip child with it. The setup screen allows
        // both at once (pack: and install: busy keys are separate), so guard
        // here and hold the gate for the duration.
        if (isEngineInstallActive()) {
          throw new Error(
            'エンジンのインストール・更新の実行中はカスタムノードを追加できません。完了後にもう一度お試しください。'
          )
        }
        beginEngineInstallGate()
        try {
          await installCustomNode(component.slice('customnode:'.length), cb)
        } finally {
          endEngineInstallGate()
        }
        // the engine only scans custom_nodes at startup — without this the
        // freshly installed node is invisible and the first generation fails.
        // Never mid-job though: killing a 20-minute render because a node for
        // a DIFFERENT model was installed is worse than the engine picking
        // the node up on its next (re)start.
        if (comfyManager.isRunning() && !jobQueue.hasActive()) {
          await comfyManager.stop().catch(() => undefined)
        }
      } else throw new Error(`unknown component: ${component}`)
    } catch (e) {
      // A failure after the 'extracting' event emitted no terminal event, so
      // the renderer kept that component "in progress" forever — which also
      // kept the data-folder button disabled for the rest of the session.
      const p: DownloadProgress = last ?? {
        id: component,
        label: component,
        receivedBytes: 0,
        totalBytes: 0,
        bytesPerSec: 0,
        status: 'error'
      }
      broadcast(IPC.evDownloadProgress, {
        ...p,
        bytesPerSec: 0,
        status: 'error',
        error: e instanceof Error ? e.message : String(e)
      })
      throw e
    }
  })
  // latest progress event per file id, shared across pack downloads: a file
  // deduped by join emits only through the pack that STARTED it, so re-emits
  // from the other pack (retry/cancel states) must read a common record —
  // a per-call map would reset such a file's bar to 0
  const lastEvent = new Map<string, DownloadProgress>()
  // Cancel intents, keyed fileId -> the pack cards whose cancel button was
  // pressed. Two jobs: (1) cancels that arrive while a file is only QUEUED
  // (between auto-retry passes, or waiting for a worker slot) have no
  // AbortController to abort yet, so the pack loop honors them before
  // starting the file; (2) the PACK SCOPE decides who stops wholesale. A
  // shared file is joined onto ONE promise, so on cancel every joiner gets
  // the same DownloadCancelledError in the same microtask cascade — a flat
  // per-file set could not tell the cancelling pack from an innocent joiner
  // (the canceller's cleanup hasn't run yet), and both stopped.
  const pendingCancels = new Map<string, Set<string>>()
  const dropCancelIntent = (id: string, scope: string): void => {
    const s = pendingCancels.get(id)
    if (s) {
      s.delete(scope)
      if (s.size === 0) pendingCancels.delete(id)
    }
  }
  // the file set each ACTIVE downloadModelFiles call is responsible for.
  // Used to bound cancel-intent lifetime: an intent only matters to (a) the
  // transfer it aborts and (b) active calls that haven't reached the file
  // yet. Without this, a cancel clicked in a pack card with NO active call
  // (its rows render from the shared progress map) was never consumed, and
  // every FUTURE pack needing that file silently skipped it as
  // foreign-cancelled until the intent's own pack was started once.
  const activeQueues = new Map<string, Set<string>>()
  /** after a cancel is honored, drop scopes no active call will ever consume */
  const pruneUnbackedScopes = (id: string): void => {
    const s = pendingCancels.get(id)
    if (!s) return
    for (const sc of [...s]) {
      const q = activeQueues.get(sc)
      if (!q || !q.has(id)) s.delete(sc)
    }
    if (s.size === 0) pendingCancels.delete(id)
  }

  ipcMain.handle(IPC.downloadModelFiles, async (_e, fileIds: string[], packKey?: string) => {
    if (isApplyingUpdate()) {
      throw new Error('アプリの更新を適用中です。再起動後にもう一度お試しください。')
    }
    ensureDirs()
    // the pack card this call belongs to (cancel intents are scoped to it)
    const scope = typeof packKey === 'string' && packKey ? packKey : fileIds.join('|')
    activeQueues.set(scope, new Set(fileIds))
    // a fresh start/resume overrides any stale cancel intent for these files
    for (const id of fileIds) dropCancelIntent(id, scope)
    const cb = (p: DownloadProgress): void => {
      lastEvent.set(p.id, p)
      broadcast(IPC.evDownloadProgress, p)
    }
    // re-emit a file's state from its last known progress — resetting
    // receivedBytes to 0 would make the bars and the pack % jump backwards
    const emitFromLast = (
      id: string,
      status: DownloadProgress['status'],
      error?: string
    ): void => {
      const last = lastEvent.get(id)
      // never downgrade a completed file: a shared file can finish through
      // the OTHER pack's call while still sitting in this pack's queue — its
      // row must stay done, not flip to キャンセル済み
      if (status === 'cancelled' && last?.status === 'done') return
      const spec = allModelFiles().find((f) => f.id === id)
      cb({
        id,
        label: last?.label ?? spec?.dest.split('/').pop() ?? id,
        receivedBytes: last?.receivedBytes ?? 0,
        totalBytes: last?.totalBytes || spec?.bytes || 0,
        bytesPerSec: 0,
        status,
        ...(error ? { error } : {})
      })
    }
    // 2 files in parallel per pack (each file itself downloads with up to 4
    // range segments). Failed files are retried in up to 3 whole passes
    // (each file also retries per segment internally), so transient network
    // drops complete without the user touching anything. A file shared with
    // another pack whose download is in flight is awaited, not re-downloaded
    // — this is what makes PARALLEL pack downloads safe. A user cancel stops
    // this pack quietly (no error, resume button remains).
    let queue = [...fileIds]
    let cancelled = false
    const MAX_PASSES = 3
    let failures: Array<{ id: string; msg: string }> = []
    const stopQueued = (): void => {
      cancelled = true
      // files still queued would keep their last (possibly synthetic
      // "downloading") state forever — the pack card and the nav lock key
      // off that status, so close them out as cancelled
      for (const rest of queue) emitFromLast(rest, 'cancelled')
      queue = []
    }
    // files whose download was cancelled by ANOTHER pack (shared files are
    // joined, so one AbortController serves every joiner)
    const foreignCancelled = new Set<string>()
    const worker = async (): Promise<void> => {
      for (;;) {
        const id = queue.shift()
        if (id === undefined || cancelled) return
        let scopes = pendingCancels.get(id)
        if (scopes && scopes.size > 0) {
          // a cancel can race the file's completion (clicked in the same
          // instant it finished): once the file is on disk the intent can't
          // apply to anything anymore — honoring it would falsely report a
          // COMPLETE file as foreign-cancelled
          const spec = allModelFiles().find((f) => f.id === id)
          if (spec && existsSync(join(modelsDir(), spec.dest))) {
            pendingCancels.delete(id)
            scopes = undefined
          }
        }
        if (scopes?.has(scope)) {
          // the cancel button was pressed IN THIS PACK'S CARD while the file
          // sat in the queue — honor it now, same semantics as an active cancel
          emitFromLast(id, 'cancelled')
          stopQueued()
          return
        }
        if (scopes && scopes.size > 0) {
          // cancelled from another pack's card — don't resurrect the file,
          // but this pack keeps downloading its remaining files
          emitFromLast(id, 'cancelled')
          foreignCancelled.add(id)
          pruneUnbackedScopes(id)
          continue
        }
        try {
          await downloadModelFile(id, cb)
        } catch (e) {
          if (e instanceof DownloadCancelledError) {
            // Only the pack whose card the cancel came from stops wholesale.
            // A pack that merely JOINED that shared file used to be taken
            // down with it, abandoning all of its own remaining files.
            if (pendingCancels.get(id)?.has(scope)) {
              stopQueued()
              return
            }
            // don't resurrect the download the user just cancelled either —
            // skip this one file and keep going with the rest of this pack
            foreignCancelled.add(id)
            pruneUnbackedScopes(id)
            continue
          }
          failures.push({ id, msg: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    try {
      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        await Promise.all([worker(), worker()])
        if (cancelled) return
        if (failures.length === 0) {
          if (foreignCancelled.size > 0) {
            throw new Error(
              '同じファイルを使う他のパックでダウンロードがキャンセルされたため、一部のファイルが未完了です。「ダウンロード再開」で続きから取得できます。'
            )
          }
          return
        }
        if (pass < MAX_PASSES) {
          queue = failures.map((f) => f.id)
          // the downloader emitted status:'error' for these before throwing;
          // they WILL be retried, so soften the red error in the UI to a
          // "reconnecting" state, keeping the real progress the error event
          // carried (the resume continues from the sidecar, not from zero)
          for (const id of queue) {
            emitFromLast(id, 'downloading', `再接続中… (自動再試行 ${pass + 1}/${MAX_PASSES})`)
          }
          failures = []
          await new Promise((r) => setTimeout(r, 3000))
        }
      }
      throw new Error(
        `一部のファイルのダウンロードに失敗しました(${failures.length}件・自動再試行${MAX_PASSES}回実施済み)。「ダウンロード再開」で失敗分のみ再取得できます。\n` +
          failures.map((f) => `${f.id}: ${f.msg}`).join('\n')
      )
    } finally {
      activeQueues.delete(scope)
      // don't leak this pack's cancel intents into a future resume
      for (const id of fileIds) dropCancelIntent(id, scope)
    }
  })
  ipcMain.handle(IPC.cancelDownload, (_e, id: string, packKey?: string) => {
    // nobody can honor this click: the file is neither transferring nor
    // queued by any active call (e.g. the pack finished in the same instant).
    // Recording it anyway would strand an intent that silently skips the
    // file for every future pack.
    const anyQueued = [...activeQueues.values()].some((q) => q.has(id))
    if (!isDownloadActive(id) && !anyQueued) return
    // record the intent first: if the file is queued rather than actively
    // downloading, abort() finds no controller and would silently no-op.
    // '*' (no pack context) stops no pack wholesale — the file is just skipped
    const scope = typeof packKey === 'string' && packKey ? packKey : '*'
    let s = pendingCancels.get(id)
    if (!s) pendingCancels.set(id, (s = new Set()))
    s.add(scope)
    cancelDownload(id)
  })

  // --- engine ------------------------------------------------------------------
  ipcMain.handle(IPC.getEngineStatus, () => comfyManager.getStatus())
  ipcMain.handle(IPC.startEngine, () => {
    // Mirror of the enqueue/startExport gates. This is the ONLY other path that
    // can spawn the engine, and its child's cwd is inside engineDir() — exactly
    // the orphan that makes the next「エンジンを更新」fail with EPERM. The 設定
    // screen's 起動 button is enabled throughout an engine replacement (the
    // installer stopped the engine, so its state reads 'stopped').
    if (isEngineInstallActive()) {
      throw new Error(
        'エンジンのインストール・更新の実行中は起動できません。完了後にもう一度お試しください。'
      )
    }
    if (isApplyingUpdate()) {
      throw new Error('アプリの更新を適用中です。再起動後にもう一度お試しください。')
    }
    return comfyManager.start()
  })
  ipcMain.handle(IPC.stopEngine, () => comfyManager.stop())
  comfyManager.onStatus((s) => broadcast(IPC.evEngineStatus, s))

  // --- generation ---------------------------------------------------------------
  ipcMain.handle(IPC.queueGeneration, (_e, req: GenerationRequest) => jobQueue.enqueue(req))
  ipcMain.handle(IPC.cancelJob, (_e, jobId: string) => jobQueue.cancel(jobId))
  ipcMain.handle(IPC.listJobs, () => jobQueue.list())
  jobQueue.onUpdate((job) => broadcast(IPC.evJobUpdate, job))

  // --- library ---------------------------------------------------------------
  ipcMain.handle(IPC.listVideos, () => library.list())
  ipcMain.handle(
    IPC.updateVideo,
    (_e, id: string, patch: Partial<Pick<VideoRecord, 'favorite' | 'tags'>>) => {
      // sanitize: the renderer can only ever change favorite/tags — never
      // filePath/id/etc. (IPC erases the TS type, so enforce at runtime)
      const clean: Partial<Pick<VideoRecord, 'favorite' | 'tags'>> = {}
      if (typeof patch?.favorite === 'boolean') clean.favorite = patch.favorite
      if (Array.isArray(patch?.tags)) {
        clean.tags = [
          ...new Set(
            patch.tags
              .filter((t): t is string => typeof t === 'string')
              .map((t) => t.trim().slice(0, 100))
              .filter(Boolean)
          )
        ].slice(0, 50)
      }
      library.update(id, clean)
    }
  )
  ipcMain.handle(IPC.deleteVideo, (_e, id: string, deleteFile: boolean) =>
    library.remove(id, deleteFile)
  )
  ipcMain.handle(IPC.showInFolder, (_e, id: string) => {
    const rec = library.get(id)
    if (rec) shell.showItemInFolder(rec.filePath)
  })
  ipcMain.handle(IPC.openLibraryFolder, () => {
    mkdirSync(libraryDir(), { recursive: true })
    return shell.openPath(libraryDir())
  })
  ipcMain.handle(IPC.openLogsFolder, () => {
    const logs = join(configDir(), 'logs')
    mkdirSync(logs, { recursive: true })
    return shell.openPath(logs)
  })

  // --- export ------------------------------------------------------------------
  ipcMain.handle(IPC.getExportPresets, () => EXPORT_PRESETS)
  ipcMain.handle(IPC.startExport, (_e, req: ExportRequest) => {
    // an export started while the app is quitting to update would be aborted
    // seconds later by cancelAllExports() — refuse instead of losing the work
    if (isApplyingUpdate()) {
      throw new Error('アプリの更新を適用中です。再起動後にもう一度お試しください。')
    }
    return startExport(req, (p) => broadcast(IPC.evExportProgress, p))
  })
  ipcMain.handle(IPC.cancelExport, (_e, id: string) => cancelExport(id))

  // --- prompt conversion (local CPU LLM) -----------------------------------------
  ipcMain.handle(IPC.llmTranslate, (_e, family: Parameters<typeof llmManager.translate>[0], text: string) =>
    llmManager.translate(family, text)
  )

  // --- app update ------------------------------------------------------------------
  ipcMain.handle(IPC.getUpdaterState, () => getUpdaterState())
  ipcMain.handle(IPC.checkForUpdates, () => checkForUpdatesNow('manual'))
  ipcMain.handle(IPC.installUpdate, async () => {
    // quitAndInstall exits the app — anything long-running would be killed
    // mid-flight. All three refusals end with the same reassurance: doing
    // nothing still applies the update, just later.
    const later = '(更新はアプリ終了時にも自動適用されます)'
    if (jobQueue.hasActive()) {
      throw new Error(`生成の実行中は更新の適用はできません。生成の完了(または中止)後にもう一度お試しください。${later}`)
    }
    if (hasActiveExport()) {
      throw new Error(`書き出しの実行中は更新の適用はできません。完了後にもう一度お試しください。${later}`)
    }
    // model packs run for hours over tens of GB; quitting severs every in-flight
    // range request and nothing auto-resumes on relaunch
    if (hasActiveDownload()) {
      throw new Error(`ダウンロードの実行中は更新の適用はできません。完了後にもう一度お試しください。${later}`)
    }
    // quitting mid engine-extract would leave a half-written engine tree
    // (recoverable, but pointlessly so)
    if (isEngineInstallActive()) {
      throw new Error(`エンジンのインストール・更新の実行中は適用できません。完了後にもう一度お試しください。${later}`)
    }
    await installUpdateNow()
  })

  // --- dialogs / shell -------------------------------------------------------------
  // pickers open at the last-used folder (per type), initially the library
  // folder — not whatever OS default (e.g. Downloads) happens to be
  function pickerDefaultPath(kind: 'image' | 'audio' | 'video'): string {
    const last = getSettings().lastDirs?.[kind]
    if (last && existsSync(last)) return last
    mkdirSync(libraryDir(), { recursive: true })
    return libraryDir()
  }
  function rememberPickedDir(kind: 'image' | 'audio' | 'video', p: string | null): void {
    if (!p) return
    updateSettings({ lastDirs: { ...getSettings().lastDirs, [kind]: dirname(p) } })
  }
  ipcMain.handle(IPC.pickImage, async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      defaultPath: pickerDefaultPath('image'),
      filters: [{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    })
    const p = r.canceled ? null : r.filePaths[0]
    allowPickedPath(p) // so mcs:// may preview it
    rememberPickedDir('image', p)
    return p
  })
  ipcMain.handle(IPC.pickAudio, async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      defaultPath: pickerDefaultPath('audio'),
      filters: [{ name: '音声', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'webm'] }]
    })
    const p = r.canceled ? null : r.filePaths[0]
    allowPickedPath(p)
    rememberPickedDir('audio', p)
    return p
  })
  ipcMain.handle(IPC.pickVideo, async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      defaultPath: pickerDefaultPath('video'),
      filters: [{ name: '動画', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif'] }]
    })
    const p = r.canceled ? null : r.filePaths[0]
    allowPickedPath(p)
    rememberPickedDir('video', p)
    return p
  })
  ipcMain.handle(IPC.pickDirectory, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
    return Promise.resolve()
  })
  ipcMain.handle(IPC.openPath, async (_e, p: string) => {
    // only open folders/files the app owns — never an arbitrary renderer path
    // (shell.openPath would execute .exe/.bat/.lnk on Windows)
    if (!isOpenPathAllowed(p)) return
    await shell.openPath(p)
  })
}
