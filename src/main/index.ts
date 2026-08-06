import { app, BrowserWindow, protocol, net, session, shell } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'
import { pathToFileURL } from 'url'
import { registerIpc } from './ipc'
import { initUpdater } from './updater'
import { sweepOldEngineDirs } from './setup/installer'
import { ensureDirs } from './core/paths'
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

  // Auto-update via GitHub Releases(packaged builds のみ)。起動時に1回
  // チェックし、セットアップ画面の「今すぐ更新を確認」からも実行できる。
  // 新しいリリースはバックグラウンドでダウンロード → 通知 → 終了時に適用
  // (更新経路のアンインストール ${isUpdated} はデータ・ユーザーファイルを
  // 温存する — build/installer.nsh)。旧実装の動的 import が named export を
  // 取れず更新機能が黙って無効化されていた経緯は src/main/updater.ts 参照。
  initUpdater()

  // 前回のエンジン更新が削除しきれなかった退避フォルダ(engine.__old-*)の
  // 掃除。起動処理をブロックしないよう遅延起動・非同期で行う
  setTimeout(() => {
    void sweepOldEngineDirs()
  }, 5000)

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
