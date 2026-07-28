import { app, BrowserWindow, protocol, net, session, shell } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'
import { configDir, ensureDirs } from './core/paths'
import { DEFAULT_DATA_DIR, updateSettings, writeDataDirMarker } from './core/settings'
import { comfyManager } from './comfyui/manager'
import { llmManager } from './llm/manager'
import { setWorkflowsDir } from './comfyui/graphs'
import { isMediaPathAllowed } from './core/mediaAccess'
import { cancelAllExports } from './media/exporter'

// last-resort safety net: a stray exception in main must be logged, not
// crash the whole app (jobs, downloads and engines keep running)
function logCrash(kind: string, err: unknown): void {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
    appendFileSync(join(dir, 'main-crash.log'), `[${new Date().toISOString()}] ${kind}: ${msg}\n`)
  } catch {
    /* logging must never throw */
  }
}
process.on('uncaughtException', (err) => logCrash('uncaughtException', err))
process.on('unhandledRejection', (reason) => logCrash('unhandledRejection', reason))

// mcs:// serves local media (library videos, thumbnails, picked files) to the renderer
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mcs',
    privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

// GitHub 公開準備として有効化(electron-builder.yml の publish が指す
// utausnskareshi/movie-creator-studio の GitHub Releases を参照する)。
// リポジトリ/リリースが未公開の間はチェックが失敗するだけで、下の catch が
// 握りつぶすため起動やUIには影響しない。
const AUTO_UPDATE_ENABLED = true

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f19',
    title: 'Movie Creator Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const load = process.env['ELECTRON_RENDERER_URL']
    ? mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    : mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  load.catch((err) => console.error('failed to load renderer:', err))
}

// A second instance would run its own job queue and library cache against the
// same files: the last writer wins and silently drops the other's records.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  // Windows のトースト通知(電子アップデーターの「更新準備完了」)には
  // AppUserModelID の設定が必須。electron-builder が作るスタートメニューの
  // ショートカット側 AUMID(= appId)と一致させることで、通知が正しく
  // 表示・帰属される。appId は electron-builder.yml と対。
  app.setAppUserModelId('com.utausnskareshi.movie-creator-studio')

  // The app must still start when the configured data folder is gone (an
  // unplugged external drive, a deleted folder): ensureDirs() throwing here
  // used to abort whenReady BEFORE registerIpc()/createWindow(), leaving a
  // process with no window and no way to fix the setting. Fall back to the
  // default location and let the user re-point it in the UI.
  try {
    ensureDirs()
  } catch (err) {
    logCrash('ensureDirs', err)
    try {
      updateSettings({ dataDir: DEFAULT_DATA_DIR })
      ensureDirs()
    } catch (err2) {
      // even the fallback failed — carry on so the window (and its error
      // surface) still appears rather than dying headless
      logCrash('ensureDirs:fallback', err2)
    }
  }
  setWorkflowsDir(
    app.isPackaged
      ? join(process.resourcesPath, 'workflows')
      : join(app.getAppPath(), 'resources', 'workflows')
  )

  // mcs://media/<encodeURIComponent(absolute path)>
  protocol.handle('mcs', (request) => {
    // hostile/malformed URLs (bad %-escapes, no host) must 404, not throw
    let u: URL
    let filePath: string
    try {
      u = new URL(request.url)
      if (u.host !== 'media') return new Response('not found', { status: 404 })
      filePath = decodeURIComponent(u.pathname.replace(/^\//, ''))
    } catch {
      return new Response('not found', { status: 404 })
    }
    // only serve simple absolute Windows paths, and only files the app owns
    // (under its data/config roots) or that the user explicitly picked
    if (!/^[A-Za-z]:[\\/]/.test(filePath) || filePath.includes('..')) {
      return new Response('forbidden', { status: 403 })
    }
    if (!isMediaPathAllowed(filePath)) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  // no renderer feature needs device permissions (mic recording was removed)
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => {
    cb(false)
  })

  registerIpc()
  createWindow()
  // keep the uninstaller's data-location marker current from first launch
  writeDataDirMarker()

  // Auto-update via GitHub Releases(packaged builds のみ)。新しいリリースが
  // あればバックグラウンドでダウンロードし、通知を表示、アプリ終了時に適用。
  // 更新経路のアンインストール(${isUpdated})はデータ・ユーザーファイルを
  // 温存する(build/installer.nsh の customUnInstall / customRemoveFiles)。
  if (app.isPackaged && AUTO_UPDATE_ENABLED) {
    void import('electron-updater')
      .then(({ autoUpdater }) => {
        // 'error' は必ず購読する: electron-updater は失敗時に emit("error") を
        // 無条件で発火し(AppUpdater.js)、リスナーの無い EventEmitter の
        // 'error' は例外になる。リリース未公開・オフラインでは失敗が正常系
        // なので、クラッシュログではなく logs/updater.log に1行記録するだけに
        // とどめる(公開後のフィード不備の調査にも使える)。
        const ulog = (line: string): void => {
          try {
            const dir = join(configDir(), 'logs')
            mkdirSync(dir, { recursive: true })
            appendFileSync(join(dir, 'updater.log'), `${new Date().toISOString()} ${line}\n`)
          } catch {
            // ログ書き込みの失敗が起動に影響してはならない
          }
        }
        autoUpdater.on('error', (e) => ulog(`error: ${e instanceof Error ? e.message : String(e)}`))
        autoUpdater.on('update-available', (info) => ulog(`update-available: ${info.version}`))
        autoUpdater.on('update-downloaded', (info) => ulog(`update-downloaded: ${info.version}`))
        // 通知は日本語で({version}/{appName} は electron-updater が置換)
        return autoUpdater.checkForUpdatesAndNotify({
          title: 'Movie Creator Studio の更新',
          body: '新しいバージョン {version} をダウンロードしました。アプリの終了時に自動的に適用されます。'
        })
      })
      .catch(() => undefined)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  cancelAllExports()
  llmManager.stop()
  void comfyManager.stop().finally(() => app.quit())
})

app.on('before-quit', () => {
  // an encoding ffmpeg.exe is a detached-looking grandchild: without this it
  // keeps running (and holding the output file) after the app is gone
  cancelAllExports()
  llmManager.stop()
  void comfyManager.stop()
})
