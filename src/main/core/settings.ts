import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'fs'
import type { AppSettings } from '@shared/types'

/** startup fallback when the configured data folder is unusable */
export const DEFAULT_DATA_DIR = 'C:\\MCS-Data'

const DEFAULTS: AppSettings = {
  language: 'ja',
  dataDir: DEFAULT_DATA_DIR,
  hfMirror: null,
  useNvenc: true,
  vramLimitEnabled: true
}

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (cached) return cached
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    cached = { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached!
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  // atomic write, and the in-memory cache is committed only AFTER it lands:
  // committing first left a failed write running the session on a dataDir
  // that neither settings.json nor the uninstaller marker records
  const tmp = settingsPath() + '.tmp'
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8')
  renameSync(tmp, settingsPath())
  cached = next
  writeDataDirMarker()
  return next
}

/**
 * Plain-text marker with the current dataDir, kept next to settings.json.
 * The NSIS uninstaller reads THIS (no JSON parsing in NSIS) to know where
 * models/videos live so "complete removal" can delete them too.
 * Encoding: UTF-16LE WITH BOM — NSIS (Unicode) FileRead only decodes
 * BOM-marked files correctly; a BOM-less UTF-8 file is read as ANSI and
 * a Japanese dataDir path would come out garbled (= never deleted).
 */
export function writeDataDirMarker(): void {
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    // String.fromCharCode(0xfeff) = BOM(ソース中に不可視文字を置かない)
    writeFileSync(
      join(dir, 'datadir.txt'),
      String.fromCharCode(0xfeff) + getSettings().dataDir,
      'utf16le'
    )
  } catch {
    // marker is best-effort; uninstaller falls back to the default location
  }
}

export function settingsFileExists(): boolean {
  return existsSync(settingsPath())
}
