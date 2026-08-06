import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { ExportProgress, ExportRequest, VideoRecord } from '@shared/types'
import { library } from '../library/store'
import { exportsDir } from '../core/paths'
import { getSettings } from '../core/settings'
import { findPreset } from './presets'
import { buildExportArgs } from './exportPlan'
import { hasNvenc, probe, runFfmpeg } from './ffmpeg'

type ProgressCb = (p: ExportProgress) => void

const activeExports = new Map<string, AbortController>()

export function cancelExport(exportId: string): void {
  activeExports.get(exportId)?.abort()
}

/** stop every running export — called on app quit so no ffmpeg.exe is orphaned */
export function cancelAllExports(): void {
  for (const c of activeExports.values()) c.abort()
  activeExports.clear()
}

/** true while any export is encoding OR still being prepared */
export function hasActiveExport(): boolean {
  return activeExports.size > 0 || pendingExports > 0
}

// probing every clip and detecting NVENC takes seconds on a multi-clip project.
// Until activeExports gets its entry an export is invisible, so quit-to-update
// would pass its guard, quit, and run cancelAllExports() over an empty map —
// orphaning the ffmpeg.exe spawned moments later.
let pendingExports = 0

const FONT_CANDIDATES = [
  'C:/Windows/Fonts/meiryo.ttc',
  'C:/Windows/Fonts/YuGothM.ttc',
  'C:/Windows/Fonts/msgothic.ttc',
  'C:/Windows/Fonts/BIZ-UDGothicR.ttc'
]

function findFont(): string | null {
  return FONT_CANDIDATES.find((f) => existsSync(f)) ?? null
}

export async function startExport(req: ExportRequest, cb: ProgressCb): Promise<string> {
  pendingExports += 1
  try {
    return await doStartExport(req, cb)
  } finally {
    pendingExports -= 1
  }
}

async function doStartExport(req: ExportRequest, cb: ProgressCb): Promise<string> {
  const exportId = randomUUID().slice(0, 8)
  const records = new Map<string, VideoRecord>()
  for (const c of req.project.clips) {
    const rec = library.get(c.videoId)
    if (!rec) throw new Error(`ライブラリに動画が見つかりません: ${c.videoId}`)
    records.set(c.videoId, rec)
  }
  const clipHasAudio: boolean[] = []
  for (const c of req.project.clips) {
    const rec = records.get(c.videoId)!
    const m = await probe(rec.filePath).catch(() => null)
    clipHasAudio.push(m?.hasAudio ?? false)
  }
  const useNvenc = getSettings().useNvenc && (await hasNvenc())
  const preset = findPreset(req.presetId)
  const safeName = req.outputName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'export'
  const outputPath = join(exportsDir(), `${safeName}_${preset.id}_${exportId}.mp4`)
  const built = buildExportArgs(req, records, clipHasAudio, useNvenc, outputPath, findFont())
  mkdirSync(exportsDir(), { recursive: true })

  const controller = new AbortController()
  activeExports.set(exportId, controller)
  cb({ exportId, phase: 'encoding', progress: 0 })

  void (async () => {
    try {
      const r = await runFfmpeg(built.args, {
        signal: controller.signal,
        onStderr: (line) => {
          const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
          if (m) {
            const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
            cb({
              exportId,
              phase: 'encoding',
              progress: Math.min(0.999, sec / Math.max(0.1, built.totalDurationSec))
            })
          }
        }
      })
      if (controller.signal.aborted) {
        cb({ exportId, phase: 'cancelled', progress: 0 })
      } else if (r.code === 0) {
        cb({ exportId, phase: 'done', progress: 1, outputPath: built.outputPath })
      } else {
        cb({
          exportId,
          phase: 'error',
          progress: 0,
          message: `ffmpeg exit ${r.code}: ${r.stderr.slice(-600)}`
        })
      }
    } catch (err) {
      cb({
        exportId,
        phase: 'error',
        progress: 0,
        message: err instanceof Error ? err.message : String(err)
      })
    } finally {
      activeExports.delete(exportId)
    }
  })()

  return exportId
}
