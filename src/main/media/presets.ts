import type { ExportPreset } from '@shared/types'

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'youtube_1080p',
    label: 'YouTube (16:9 1080p)',
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: 'h264',
    crf: 19,
    audioBitrateK: 384,
    note: 'H.264 / AAC 384k / -14 LUFS 推奨'
  },
  {
    id: 'youtube_4k',
    label: 'YouTube (16:9 4K)',
    width: 3840,
    height: 2160,
    fps: 30,
    videoCodec: 'hevc',
    crf: 22,
    audioBitrateK: 384,
    note: 'H.265 / 4K。アップスケール品質に注意'
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts (9:16)',
    width: 1080,
    height: 1920,
    fps: 30,
    videoCodec: 'h264',
    crf: 19,
    audioBitrateK: 256,
    maxDurationSec: 180,
    note: '最大3分'
  },
  {
    id: 'tiktok',
    label: 'TikTok (9:16)',
    width: 1080,
    height: 1920,
    fps: 30,
    videoCodec: 'h264',
    crf: 19,
    audioBitrateK: 256,
    maxDurationSec: 600,
    note: '縦型フル画面'
  },
  {
    id: 'reels',
    label: 'Instagram リール (9:16)',
    width: 1080,
    height: 1920,
    fps: 30,
    videoCodec: 'h264',
    crf: 19,
    audioBitrateK: 256,
    maxDurationSec: 90,
    note: '最大90秒推奨'
  },
  {
    id: 'ig_feed',
    label: 'Instagram フィード (4:5)',
    width: 1080,
    height: 1350,
    fps: 30,
    videoCodec: 'h264',
    crf: 19,
    audioBitrateK: 256,
    note: 'フィード向け 4:5'
  },
  {
    id: 'ig_square',
    label: 'Instagram (1:1)',
    width: 1080,
    height: 1080,
    fps: 30,
    videoCodec: 'h264',
    crf: 19,
    audioBitrateK: 256,
    note: '正方形'
  },
  {
    id: 'x_720p',
    label: 'X / Twitter (16:9 720p)',
    width: 1280,
    height: 720,
    fps: 30,
    videoCodec: 'h264',
    videoBitrateK: 5000,
    audioBitrateK: 192,
    maxDurationSec: 140,
    note: '2分20秒以内'
  },
  {
    id: 'source_smooth',
    label: '元解像度のまま (60fps化)',
    width: 0,
    height: 0,
    fps: 60,
    videoCodec: 'h264',
    crf: 18,
    audioBitrateK: 256,
    note: '解像度そのまま・フレーム補間のみ'
  }
]

export function findPreset(id: string): ExportPreset {
  const p = EXPORT_PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`unknown export preset: ${id}`)
  return p
}
