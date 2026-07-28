import type { ExportRequest, VideoRecord } from '@shared/types'
// .ts extension so this module also runs under plain Node type-stripping (e2e scripts)
import { findPreset } from './presets.ts'

/**
 * Escape a value for a filter option inside -filter_complex.
 *
 * ffmpeg unescapes this string TWICE, both passes using av_get_token():
 *   1. the filtergraph description (terminators "[],;")
 *   2. the filter's own option string (key/value "=", pairs ":")
 * Inside '...' av_get_token copies bytes VERBATIM (no backslash processing)
 * and stops at the next "'". So a backslash escape written inside the quotes
 * survives pass 1 and is consumed by pass 2 — which is what makes the
 * backslash-escaped ":" and "\" below correct (critical for "C:/..." font
 * paths).
 *
 * An apostrophe cannot live inside the quotes at all, and the POSIX shell
 * idiom '\'' is WRONG here: pass 1 turns it into a BARE "'", which pass 2
 * then reads as an opening quote and swallows every following option
 * (expansion, fontfile, fontsize, x, y, enable...). The text must instead
 * arrive at pass 2 still escaped, so each "'" is emitted as
 *   ' \ \ \ ' '   (close quote, escaped backslash, escaped quote, reopen)
 * pass 1 -> \'   pass 2 -> '
 */
export function q(s: string): string {
  const inner = s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
  return `'${inner}'`
}

export interface BuiltExport {
  args: string[]
  totalDurationSec: number
  outputPath: string
}

/**
 * Build the complete ffmpeg invocation for an export request.
 * Pure function (no electron/fs) — unit tested.
 */
export function buildExportArgs(
  req: ExportRequest,
  records: Map<string, VideoRecord>,
  clipHasAudio: boolean[],
  useNvenc: boolean,
  outputPath: string,
  fontFile: string | null
): BuiltExport {
  const preset = findPreset(req.presetId)
  const proj = req.project
  if (proj.clips.length === 0) throw new Error('クリップがありません')

  // clamp the trim into the clip and reject an inverted range: an out<=in
  // pair used to emit trim=start=4:end=2, which silently produced an empty
  // segment while its full length still counted toward the duration budget
  // (every telop and fade after it landed on the wrong frame)
  const durs = proj.clips.map((c, i) => {
    const rec = records.get(c.videoId)
    if (!rec) throw new Error(`ライブラリに動画が見つかりません: ${c.videoId}`)
    const inSec = Math.min(Math.max(0, c.inSec), Math.max(0, rec.durationSec - 0.05))
    const end = c.outSec > 0 ? Math.min(c.outSec, rec.durationSec) : rec.durationSec
    if (end - inSec < 0.05) {
      throw new Error(
        `クリップ ${i + 1} の切り出し範囲が不正です(開始 ${c.inSec.toFixed(2)}秒 / 終了 ${
          c.outSec > 0 ? c.outSec.toFixed(2) : '末尾'
        }秒)。終了は開始より後にしてください`
      )
    }
    c.inSec = inSec
    return end - inSec
  })
  const total = durs.reduce((a, b) => a + b, 0)

  const first = records.get(proj.clips[0].videoId)!
  const outW = preset.width || first.width
  const outH = preset.height || first.height

  const args: string[] = []
  const filters: string[] = []

  // ---- inputs ---------------------------------------------------------------
  proj.clips.forEach((c) => {
    const rec = records.get(c.videoId)!
    args.push('-i', rec.filePath)
  })
  const bgmIndex = proj.bgm ? proj.clips.length : -1
  if (proj.bgm) {
    if (proj.bgm.loop) args.push('-stream_loop', '-1')
    args.push('-i', proj.bgm.path)
  }
  const silenceIndex = proj.clips.length + (proj.bgm ? 1 : 0)
  args.push('-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo')

  // ---- video chain -----------------------------------------------------------
  const scaleFlags = req.upscale ? ':flags=lanczos' : ''
  proj.clips.forEach((c, i) => {
    const rec = records.get(c.videoId)!
    const end = c.outSec > 0 ? Math.min(c.outSec, rec.durationSec) : rec.durationSec
    const trim = `trim=start=${c.inSec.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS`
    if (req.aspectMode === 'blurpad') {
      filters.push(
        `[${i}:v]${trim},split=2[bg${i}][fg${i}]`,
        `[bg${i}]scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH},gblur=sigma=24,eq=brightness=-0.08[bgb${i}]`,
        `[fg${i}]scale=${outW}:${outH}:force_original_aspect_ratio=decrease${scaleFlags}[fgs${i}]`,
        `[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v${i}]`
      )
    } else {
      filters.push(
        `[${i}:v]${trim},scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH},setsar=1,format=yuv420p[v${i}]`
      )
    }
  })
  const concatIn = proj.clips.map((_, i) => `[v${i}]`).join('')
  filters.push(`${concatIn}concat=n=${proj.clips.length}:v=1:a=0[vcat]`)

  let vLabel = 'vcat'
  if (req.smoothInterpolation) {
    filters.push(
      `[${vLabel}]minterpolate=fps=${preset.fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1[vfps]`
    )
  } else {
    filters.push(`[${vLabel}]fps=${preset.fps}[vfps]`)
  }
  vLabel = 'vfps'

  // text overlays
  proj.overlays.forEach((ov, i) => {
    // a raw newline inside -filter_complex would split the filter string and
    // break parsing — normalize to spaces (q() handles ' \ : escaping)
    const text = ov.text.replace(/[\r\n]+/g, ' ')
    const fontsize = Math.max(12, Math.round((outH * ov.fontSizePct) / 100))
    const y =
      ov.position === 'top' ? 'h*0.06' : ov.position === 'middle' ? '(h-text_h)/2' : 'h*0.94-text_h'
    const parts = [
      `text=${q(text)}`,
      'expansion=none',
      fontFile ? `fontfile=${q(fontFile)}` : '',
      `fontsize=${fontsize}`,
      `fontcolor=${ov.color.replace('#', '0x')}`,
      `x=(w-text_w)/2`,
      `y=${y}`,
      ov.outline ? `borderw=${Math.max(2, Math.round(fontsize / 12))}:bordercolor=black@0.85` : '',
      `enable='between(t,${ov.startSec.toFixed(2)},${ov.endSec.toFixed(2)})'`
    ].filter(Boolean)
    filters.push(`[${vLabel}]drawtext=${parts.join(':')}[vtx${i}]`)
    vLabel = `vtx${i}`
  })

  // fades
  if (proj.fadeInSec > 0) {
    filters.push(`[${vLabel}]fade=t=in:st=0:d=${proj.fadeInSec.toFixed(2)}[vfi]`)
    vLabel = 'vfi'
  }
  if (proj.fadeOutSec > 0) {
    const st = Math.max(0, total - proj.fadeOutSec)
    filters.push(`[${vLabel}]fade=t=out:st=${st.toFixed(2)}:d=${proj.fadeOutSec.toFixed(2)}[vfo]`)
    vLabel = 'vfo'
  }

  // ---- audio chain -------------------------------------------------------------
  const mixInputs: string[] = []

  // keep original clip audio (e.g. LTX-2.3 generates synced audio natively).
  // Silent clips get a silence segment of the same length so mixed timelines
  // (audio clips + silent clips) stay in sync instead of dropping all audio.
  if (proj.keepClipAudio && clipHasAudio.some(Boolean) && proj.clips.length > 0) {
    proj.clips.forEach((c, i) => {
      if (clipHasAudio[i]) {
        const rec = records.get(c.videoId)!
        const end = c.outSec > 0 ? Math.min(c.outSec, rec.durationSec) : rec.durationSec
        // apad to the exact clip duration: mp4 audio streams are often a few
        // hundredths shorter than the video, which would shift every later
        // clip's audio earlier after concat
        filters.push(
          `[${i}:a]atrim=start=${c.inSec.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${durs[i].toFixed(3)}[a${i}]`
        )
      } else {
        filters.push(
          `aevalsrc=0:d=${durs[i].toFixed(3)}:s=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
        )
      }
    })
    filters.push(
      `${proj.clips.map((_, i) => `[a${i}]`).join('')}concat=n=${proj.clips.length}:v=0:a=1[acat]`
    )
    mixInputs.push('[acat]')
  }

  if (proj.bgm) {
    // offsetSec delays the BGM start within the timeline; atrim afterwards
    // keeps the overall audio length at the video total
    const delayMs = Math.max(0, Math.round(proj.bgm.offsetSec * 1000))
    const delay = delayMs > 0 ? `,adelay=${delayMs}|${delayMs}` : ''
    filters.push(
      `[${bgmIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${proj.bgm.gainDb.toFixed(1)}dB${delay},atrim=0:${total.toFixed(3)}[bgm0]`
    )
    mixInputs.push('[bgm0]')
  }
  // silence bed guarantees an audio track exists; loudnorm on pure silence
  // would produce NaN samples, so only normalize when real audio is present
  const hasRealAudio = mixInputs.length > 0
  mixInputs.push(`[${silenceIndex}:a]`)

  let aLabel: string
  if (mixInputs.length === 1) {
    aLabel = mixInputs[0].slice(1, -1)
  } else {
    filters.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:normalize=0[amixed]`
    )
    aLabel = 'amixed'
  }
  filters.push(`[${aLabel}]atrim=0:${total.toFixed(3)}[atrimmed]`)
  aLabel = 'atrimmed'
  if (req.loudnessNormalize && hasRealAudio) {
    // loudnorm internally resamples to 192kHz/dbl — bring it back to an
    // AAC-compatible format explicitly or the encoder rejects the frames
    filters.push(
      `[${aLabel}]loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=48000:sample_fmts=fltp:channel_layouts=stereo[anorm]`
    )
    aLabel = 'anorm'
  } else {
    filters.push(`[${aLabel}]aformat=sample_rates=48000:sample_fmts=fltp:channel_layouts=stereo[afmt]`)
    aLabel = 'afmt'
  }

  // ---- encode ------------------------------------------------------------------
  args.push('-filter_complex', filters.join(';'))
  args.push('-map', `[${vLabel}]`, '-map', `[${aLabel}]`)

  if (preset.videoCodec === 'hevc') {
    if (useNvenc)
      args.push('-c:v', 'hevc_nvenc', '-rc', 'vbr', '-cq', String(preset.crf ?? 22), '-b:v', '0', '-preset', 'p5', '-tag:v', 'hvc1')
    else args.push('-c:v', 'libx265', '-crf', String(preset.crf ?? 22), '-preset', 'medium', '-tag:v', 'hvc1')
  } else {
    if (useNvenc)
      args.push('-c:v', 'h264_nvenc', '-rc', 'vbr', '-cq', String(preset.crf ?? 19), '-b:v', '0', '-preset', 'p5', '-profile:v', 'high')
    else args.push('-c:v', 'libx264', '-crf', String(preset.crf ?? 19), '-preset', 'medium', '-profile:v', 'high')
  }
  if (preset.videoBitrateK) {
    args.push('-maxrate', `${preset.videoBitrateK}k`, '-bufsize', `${preset.videoBitrateK * 2}k`)
  }
  args.push('-pix_fmt', 'yuv420p', '-r', String(preset.fps))
  args.push('-c:a', 'aac', '-b:a', `${preset.audioBitrateK}k`, '-ar', '48000')
  args.push('-movflags', '+faststart')
  args.push('-metadata', 'comment=Generated with Movie Creator Studio (AI-generated content)')
  args.push(outputPath)

  return { args, totalDurationSec: total, outputPath }
}
