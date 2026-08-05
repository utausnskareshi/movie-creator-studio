import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { ffmpegExe, ffprobeExe } from '../core/paths'

export interface MediaInfo {
  durationSec: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

export function ffmpegAvailable(): boolean {
  return existsSync(ffmpegExe()) && existsSync(ffprobeExe())
}

export interface RunResult {
  code: number
  stderr: string
}

export function runFfmpeg(
  args: string[],
  opts?: { onStderr?: (line: string) => void; signal?: AbortSignal; timeoutMs?: number }
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegExe(), ['-hide_banner', '-y', ...args], { windowsHide: true })
    let stderr = ''
    let timedOut = false
    // pathological inputs can make ffmpeg hang on demux — bound prep-phase
    // conversions so a stuck job cannot freeze the app (exports pass none)
    const killTimer = opts?.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          try {
            p.kill()
          } catch {
            /* already gone */
          }
        }, opts.timeoutMs)
      : null
    p.stderr.on('data', (d) => {
      const s = String(d)
      stderr += s
      if (stderr.length > 512 * 1024) stderr = stderr.slice(-256 * 1024)
      opts?.onStderr?.(s)
    })
    opts?.signal?.addEventListener('abort', () => {
      try {
        p.kill()
      } catch {
        /* already gone */
      }
    })
    p.on('error', (e) => {
      if (killTimer) clearTimeout(killTimer)
      reject(e)
    })
    p.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer)
      if (timedOut) reject(new Error(`ffmpegが応答しないため中断しました(${Math.round((opts!.timeoutMs ?? 0) / 1000)}秒)`))
      else resolve({ code: code ?? -1, stderr })
    })
  })
}

const PROBE_TIMEOUT_MS = 30_000

export async function probe(path: string): Promise<MediaInfo> {
  const info = await new Promise<string>((resolve, reject) => {
    const p = spawn(
      ffprobeExe(),
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        path
      ],
      { windowsHide: true }
    )
    let out = ''
    let timedOut = false
    // A pathological/locked file made ffprobe hang forever, and this promise
    // is awaited inside the job queue's 'saving' phase — one hang wedged all
    // later generations. Also DRAIN stderr: a full pipe buffer blocks the
    // child even when it has nothing else to do.
    const killTimer = setTimeout(() => {
      timedOut = true
      p.kill()
    }, PROBE_TIMEOUT_MS)
    p.stdout.on('data', (d) => (out += String(d)))
    p.stderr?.resume()
    p.on('error', (e) => {
      clearTimeout(killTimer)
      reject(e)
    })
    p.on('close', (code) => {
      clearTimeout(killTimer)
      if (timedOut) reject(new Error('ffprobeが応答しないため中断しました(30秒)'))
      else if (code === 0) resolve(out)
      else reject(new Error(`ffprobe exit ${code}`))
    })
  })
  const j = JSON.parse(info) as {
    streams?: Array<{
      codec_type?: string
      width?: number
      height?: number
      avg_frame_rate?: string
      r_frame_rate?: string
    }>
    format?: { duration?: string }
  }
  const v = j.streams?.find((s) => s.codec_type === 'video')
  const a = j.streams?.find((s) => s.codec_type === 'audio')
  const rate = v?.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v?.r_frame_rate
  let fps = 0
  if (rate) {
    const [num, den] = rate.split('/').map(Number)
    if (num && den) fps = num / den
  }
  return {
    durationSec: Number(j.format?.duration ?? 0),
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    fps: Math.round(fps * 100) / 100,
    hasAudio: !!a
  }
}

/**
 * Fit an image into exactly w×h with NO distortion and NO cropping:
 * aspect-preserving scale + centered black letter/pillar-box.
 * Used only where a model demands a fixed frame size (CogVideoX 720x480)
 * and the user chose to keep the whole image.
 */
export async function fitPadBlackImage(
  srcPath: string,
  outPath: string,
  w: number,
  h: number
): Promise<void> {
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
  const r = await runFfmpeg(['-i', srcPath, '-vf', vf, '-frames:v', '1', outPath], { timeoutMs: 60_000 })
  if (r.code !== 0) throw new Error(`image fit-pad failed: ${r.stderr.slice(-400)}`)
}

/**
 * Fill w×h completely with NO distortion: aspect-preserving scale to cover,
 * then center crop. Edges beyond the target aspect are lost.
 */
export async function fitCropImage(
  srcPath: string,
  outPath: string,
  w: number,
  h: number
): Promise<void> {
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1`
  const r = await runFfmpeg(['-i', srcPath, '-vf', vf, '-frames:v', '1', outPath], { timeoutMs: 60_000 })
  if (r.code !== 0) throw new Error(`image fit-crop failed: ${r.stderr.slice(-400)}`)
}

/**
 * Fit an image into w×h with NO distortion and NO content loss: the image
 * itself is scaled to fit inside, and the leftover bars are filled with a
 * blurred, slightly darkened cover-crop of the same image (the SNS-style
 * "blurred background" look, matching the exporter's blurpad mode).
 */
export async function fitBlurPadImage(
  srcPath: string,
  outPath: string,
  w: number,
  h: number
): Promise<void> {
  const fc =
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},gblur=sigma=24,eq=brightness=-0.08[bg];` +
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`
  const r = await runFfmpeg(
    ['-i', srcPath, '-filter_complex', fc, '-frames:v', '1', outPath],
    { timeoutMs: 60_000 }
  )
  if (r.code !== 0) throw new Error(`image fit-blurpad failed: ${r.stderr.slice(-400)}`)
}

/**
 * Convert any audio file to 48kHz stereo PCM wav. ComfyUI's LoadAudio combo
 * filters the input dir by MIME type, so exotic extensions (aac/flac on some
 * systems) can fail /prompt validation — wav always passes and feeds the
 * LTX audio VAE clean PCM.
 */
export async function toWav48k(src: string, dest: string, maxSec?: number): Promise<void> {
  const cap = maxSec && maxSec > 0 ? ['-t', maxSec.toFixed(2)] : []
  const r = await runFfmpeg(
    ['-i', src, ...cap, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', dest],
    { timeoutMs: 120_000 }
  )
  if (r.code !== 0) throw new Error(`音声の変換に失敗しました (ffmpeg exit ${r.code})`)
}

/**
 * Normalize a control video for Wan Fun Control: resample to the generation
 * fps (so motion speed is preserved 1:1), center-crop to the target frame,
 * cap the length, strip audio. Mirrors Wan22FunControlToVideo's internal
 * center-crop upscale, so pre-scaling only shrinks the upload/preproc cost.
 */
export async function prepareControlVideo(
  src: string,
  dest: string,
  opts: { fps: number; width: number; height: number; maxSec: number }
): Promise<void> {
  const vf = `fps=${opts.fps},scale=${opts.width}:${opts.height}:force_original_aspect_ratio=increase,crop=${opts.width}:${opts.height}`
  const r = await runFfmpeg(
    [
      '-i', src,
      '-t', opts.maxSec.toFixed(2),
      '-an',
      '-vf', vf,
      '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      dest
    ],
    { timeoutMs: 180_000 }
  )
  if (r.code !== 0) throw new Error(`制御動画の変換に失敗しました (ffmpeg exit ${r.code})`)
}

/**
 * Normalize a REFERENCE video for MiniMax H3 Ref2VA: 24fps (the node treats
 * frames as 24fps timing), keep aspect (the node adapts its own canvas per
 * reference — no crop), shrink only (short edge <= 768 keeps upload and
 * Qwen-side sampling cheap), cap 15s (model limit), strip audio (lip-sync
 * audio goes through the standalone <Audio j> reference inputs instead).
 */
export async function prepareRefVideo(src: string, dest: string, maxSec = 15): Promise<void> {
  const vf = `fps=24,scale='if(gt(iw,ih),-2,min(768,iw))':'if(gt(iw,ih),min(768,ih),-2)':flags=lanczos`
  const r = await runFfmpeg(
    [
      '-i', src,
      '-t', maxSec.toFixed(2),
      '-an',
      '-vf', vf,
      '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      dest
    ],
    { timeoutMs: 180_000 }
  )
  if (r.code !== 0) throw new Error(`参照動画の変換に失敗しました (ffmpeg exit ${r.code})`)
}

export async function makeThumbnail(videoPath: string, outPath: string, atSec = 0): Promise<void> {
  const r = await runFfmpeg(
    ['-ss', String(atSec), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=480:-2', outPath],
    // bounded: this runs in the job queue's 'saving' phase, which has no
    // cancel path — a hang here would block every later generation
    { timeoutMs: 60_000 }
  )
  if (r.code !== 0) throw new Error(`thumbnail failed: ${r.stderr.slice(-400)}`)
}

/** Detect NVENC availability once (cached). */
let nvencCache: boolean | null = null
export async function hasNvenc(): Promise<boolean> {
  if (nvencCache !== null) return nvencCache
  const r = await runFfmpeg(['-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-'])
  nvencCache = r.code === 0
  return nvencCache
}
