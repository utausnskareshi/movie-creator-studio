import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, renameSync, copyFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { GenerationRequest, JobInfo, VideoRecord } from '@shared/types'
import { FAMILY_META } from '@shared/familyMeta'
import { findMinimaxTagIssue } from '@shared/minimaxTags'
import { comfyManager } from '../comfyui/manager'
import { buildGraph, type InputRefs } from '../comfyui/graphs'
import { engineOutputDir, libraryDir, modelsDir, tempDir, thumbsDir } from '../core/paths'
import { allModelFiles } from '../models/registry'
import { isEngineInstallActive } from '../setup/installer'
import { library } from '../library/store'
import { ffmpegAvailable, fitBlurPadImage, fitCropImage, fitPadBlackImage, makeThumbnail, prepareControlVideo, prepareRefVideo, probe, toWav48k } from '../media/ffmpeg'

type JobCb = (job: JobInfo) => void

/** Model files a request depends on (checked before queueing to the engine). */
export function requiredFileIds(req: GenerationRequest): string[] {
  const o = req.options
  switch (o.family) {
    case 'wan22':
      if (o.wan22.size === '5b') return ['wan22_ti2v_5b', 'umt5_xxl_fp8', 'wan2.2_vae']
      return req.mode === 'i2v'
        ? ['wan22_i2v_high', 'wan22_i2v_low', 'umt5_xxl_fp8', 'wan_2.1_vae',
           ...(o.wan22.lightning ? ['wan22_i2v_lightx2v_high', 'wan22_i2v_lightx2v_low'] : [])]
        : ['wan22_t2v_high', 'wan22_t2v_low', 'umt5_xxl_fp8', 'wan_2.1_vae',
           ...(o.wan22.lightning ? ['wan22_t2v_lightx2v_high', 'wan22_t2v_lightx2v_low'] : [])]
    case 'animegen':
      return req.mode === 'i2v'
        ? ['animegen_i2v_high', 'animegen_i2v_low', 'umt5_xxl_fp8', 'wan_2.1_vae',
           ...(o.animegen.lightning ? ['wan22_i2v_lightx2v_high', 'wan22_i2v_lightx2v_low'] : [])]
        : ['animegen_t2v_high', 'animegen_t2v_low', 'umt5_xxl_fp8', 'wan_2.1_vae',
           // AIdeaLab official T2V recipe uses the 250928 lightning pair
           ...(o.animegen.lightning ? ['animegen_t2v_lora_250928_high', 'animegen_t2v_lora_250928_low'] : [])]
    case 'hunyuan15': {
      const base = ['hv15_qwen_te', 'hv15_byt5_te', 'hv15_vae']
      if (o.hunyuan15.variant === '480p_distilled')
        return [...base, 'hv15_480p_i2v_distilled', 'hv15_sigclip']
      const sr = o.hunyuan15.superResolution ? ['hv15_sr_1080p', 'hv15_sr_1080p_unet'] : []
      if (req.mode === 'i2v') return [...base, 'hv15_720p_i2v', 'hv15_sigclip', ...sr]
      return [...base, 'hv15_720p_t2v', ...sr]
    }
    case 'cogvideox':
      return ['cogx_5b_i2v', 'cogx_vae', 't5xxl_fp8']
    case 'cosmos':
      return req.mode === 'i2v'
        ? ['cosmos_p2_v2w_720p', 'oldt5_xxl_fp8', 'wan_2.1_vae']
        : ['cosmos_p2_t2i', 'cosmos_p2_v2w_720p', 'oldt5_xxl_fp8', 'wan_2.1_vae']
    case 'ltx2':
      return ['ltx2_ckpt', 'ltx2_gemma', 'ltx2_distilled_lora', 'ltx2_upscaler']
    case 'wanfun':
      return o.wanfun.size === '5b'
        ? ['wanfun_5b_ctrl', 'umt5_xxl_fp8', 'wan2.2_vae']
        : [
            'wanfun_14b_high',
            'wanfun_14b_low',
            'umt5_xxl_fp8',
            'wan_2.1_vae',
            ...(o.wanfun.lightning ? ['wan22_i2v_lightx2v_high', 'wan22_i2v_lightx2v_low'] : [])
          ]
    case 'minimaxh3': {
      const shared = ['minimax_h3_te_nvfp4', 'minimax_h3_video_vae', 'minimax_h3_audio_vae']
      return o.minimaxh3.variant === 'ref2va'
        ? ['minimax_h3_ref2va', ...shared]
        : ['minimax_h3_fl2va', ...shared]
    }
  }
}

/**
 * Last line of defense before a request reaches the engine: any non-finite
 * number (NaN from an emptied input, Infinity) would serialize to null in the
 * workflow JSON and fail deep inside ComfyUI with a cryptic error — reject at
 * the door instead. Also bounds the core dimensions to sane ranges.
 */
function sanitizeRequest(req: GenerationRequest): void {
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error(`数値入力が不正です(${path})— 空欄になっていないか確認してください`)
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`))
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k)
    }
  }
  walk(req, '')
  // shape guard: family must be known and carry its own options object —
  // a tampered stored request would otherwise TypeError deep in graphs.ts
  const fam = req.options?.family
  if (!fam || !(fam in FAMILY_META) || fam !== req.family) {
    throw new Error('リクエストが不正です(family)')
  }
  const famOpts = (req.options as unknown as Record<string, unknown>)[fam]
  if (!famOpts || typeof famOpts !== 'object') {
    throw new Error(`リクエストが不正です(options.${fam} がありません)`)
  }
  const intIn = (n: number, min: number, max: number): boolean => Number.isInteger(n) && n >= min && n <= max
  if (!intIn(req.width, 16, 4096) || !intIn(req.height, 16, 4096)) {
    throw new Error(`解像度が不正です: ${req.width}x${req.height}`)
  }
  if (!intIn(req.frames, 1, 1025)) throw new Error(`フレーム数が不正です: ${req.frames}`)
  if (!intIn(req.seed, -1, 2147483647)) throw new Error(`シード値が不正です: ${req.seed}`)
  if (req.prompt.length > 8000) throw new Error('プロンプトが長すぎます(8000文字以内)')
  if (req.negative.length > 4000) throw new Error('ネガティブプロンプトが長すぎます(4000文字以内)')

  // MiniMax H3 Ref2VA reference caps (model limits: 9 images / 3 videos /
  // 3 audios, 12 files total; audio refs need at least one visual ref)
  if (fam === 'minimaxh3') {
    const imgs = req.refImagePaths ?? []
    const vids = req.refVideoPaths ?? []
    const auds = req.refAudioPaths ?? []
    const strOk = (a: string[]): boolean => a.every((p) => typeof p === 'string' && p.length > 0)
    if (!strOk(imgs) || !strOk(vids) || !strOk(auds)) {
      throw new Error('参照ファイルのパスが不正です')
    }
    if (imgs.length > 9) throw new Error('参照画像は最大9枚です')
    if (vids.length > 3) throw new Error('参照動画は最大3本です')
    if (auds.length > 3) throw new Error('参照音声は最大3つです')
    if (imgs.length + vids.length + auds.length > 12) {
      throw new Error('参照ファイルは合計12個までです')
    }
    if (auds.length > 0 && imgs.length + vids.length === 0) {
      throw new Error(
        '参照音声には画像または動画の同伴が必要です(例: 歌声+人物画像でリップシンク)'
      )
    }
    // R2V only: a prompt tag pointing past the provided references is
    // undefined behavior model-side — reject with a clear message instead
    if (req.options.family === 'minimaxh3' && req.options.minimaxh3.variant === 'ref2va') {
      const issue = findMinimaxTagIssue(req.prompt, {
        images: imgs.length,
        videos: vids.length,
        audios: auds.length
      })
      if (issue) {
        const label =
          issue.kind === 'Picture' ? '参照画像' : issue.kind === 'Video' ? '参照動画' : '参照音声'
        throw new Error(
          `プロンプトの <${issue.kind} ${issue.index}> に対応する${label}がありません(現在${issue.available}件)。参照を追加するかタグを修正してください`
        )
      }
    }
  }
}

export function missingFiles(req: GenerationRequest): string[] {
  const files = allModelFiles()
  return requiredFileIds(req).filter((id) => {
    const spec = files.find((f) => f.id === id)
    return !spec || !existsSync(join(modelsDir(), spec.dest))
  })
}

class JobQueue {
  private jobs = new Map<string, JobInfo>()
  private order: string[] = []
  private processing = false
  private currentJobId: string | null = null
  private currentPromptId: string | null = null
  private listeners = new Set<JobCb>()
  private lastFamily: string | null = null

  onUpdate(cb: JobCb): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  list(): JobInfo[] {
    return this.order.map((id) => this.jobs.get(id)!).filter(Boolean)
  }

  private emit(job: JobInfo): void {
    for (const l of this.listeners) l(job)
  }

  private patch(id: string, patch: Partial<JobInfo>): JobInfo {
    const job = this.jobs.get(id)
    if (!job) throw new Error(`unknown job ${id}`)
    Object.assign(job, patch)
    this.emit(job)
    return job
  }

  enqueue(req: GenerationRequest): string {
    if (!ffmpegAvailable()) {
      throw new Error('ffmpeg is not installed — run setup first')
    }
    // a job would boot the engine while the installer is renaming/wiping the
    // engine tree — mirror of the ipc-side "no engine install during jobs"
    if (isEngineInstallActive()) {
      throw new Error(
        'エンジンのインストール・更新の実行中は生成を開始できません。完了後にもう一度お試しください。'
      )
    }
    sanitizeRequest(req)
    const missing = missingFiles(req)
    if (missing.length > 0) {
      throw new Error(`MISSING_MODELS:${missing.join(',')}`)
    }
    if (req.seed < 0) req.seed = Math.floor(Math.random() * 2 ** 31)
    const id = randomUUID().slice(0, 8)
    const job: JobInfo = {
      id,
      request: req,
      state: 'queued',
      createdAt: Date.now(),
      progress: 0
    }
    this.jobs.set(id, job)
    this.order.push(id)
    this.emit(job)
    void this.pump()
    return id
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.state === 'queued') {
      this.patch(jobId, { state: 'cancelled', finishedAt: Date.now() })
      return
    }
    if (jobId === this.currentJobId && (job.state === 'running' || job.state === 'preparing')) {
      this.patch(jobId, { state: 'cancelled' })
      // the engine may not be running yet (still in 'preparing'); interrupt only
      // if a client exists, and never let a failed interrupt reject the caller
      try {
        if (comfyManager.isRunning()) {
          const client = comfyManager.client()
          // dequeue first: /interrupt only stops the RUNNING prompt, so a prompt
          // the engine hadn't started yet would run to completion as a zombie
          if (this.currentPromptId) {
            await client.deleteQueued(this.currentPromptId).catch(() => undefined)
          }
          await client.interrupt().catch(() => undefined)
        }
      } catch {
        // client() throws if the engine vanished between the check and the
        // call (mid-stop) — the job is already marked cancelled, so ignore
      }
    }
  }

  /** true while any job is queued or executing (used to defer engine restarts) */
  hasActive(): boolean {
    for (const j of this.jobs.values()) {
      if (['queued', 'preparing', 'running', 'saving'].includes(j.state)) return true
    }
    return false
  }

  /** a cancel during the prepare phase should skip the remaining work */
  private cancelledEarly(jobId: string): boolean {
    if (this.jobs.get(jobId)?.state !== 'cancelled') return false
    this.patch(jobId, { finishedAt: Date.now() })
    return true
  }

  private async pump(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      for (;;) {
        const nextId = this.order.find((id) => this.jobs.get(id)?.state === 'queued')
        if (!nextId) break
        await this.run(nextId)
      }
    } finally {
      this.processing = false
    }
  }

  private async run(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)!
    this.currentJobId = jobId
    this.currentPromptId = null
    try {
      this.patch(jobId, { state: 'preparing', startedAt: Date.now(), progressText: 'エンジン起動中…' })
      await comfyManager.ensureRunning()

      // free VRAM when switching between model families
      const family = job.request.options.family
      if (this.lastFamily && this.lastFamily !== family) {
        this.patch(jobId, { progressText: 'VRAM解放中…' })
        await comfyManager.freeVram()
      }
      this.lastFamily = family

      const client = comfyManager.client()

      const refs: InputRefs = {}
      if (job.request.inputImagePath) {
        let toUpload = job.request.inputImagePath
        // CogVideoX is locked to 720x480; when the user chose "keep the whole
        // image", letterbox it with black bars app-side (no distortion, no
        // cropping). Other families are untouched.
        if (job.request.options.family === 'cogvideox' && job.request.options.cogvideox.aspectMode === 'pad') {
          this.patch(jobId, { progressText: '入力画像を調整中…' })
          mkdirSync(tempDir(), { recursive: true })
          const fitted = join(tempDir(), `i2v_${jobId}.png`)
          try {
            await fitPadBlackImage(job.request.inputImagePath, fitted, job.request.width, job.request.height)
            toUpload = fitted
          } catch {
            // fall back to the raw image (workflow then resizes without crop)
          }
        }
        // MiniMaxH3ImageToVideo plain-STRETCHES the first frame onto the canvas
        // ("geometry anchor" in the node source), so a portrait image on a
        // landscape canvas would distort. Pre-fit it app-side per the chosen
        // mode; 'stretch' keeps the node's native behavior. Requests stored
        // before this option existed fall back to 'blur'.
        if (job.request.options.family === 'minimaxh3' && job.request.mode === 'i2v') {
          const am = job.request.options.minimaxh3.aspectMode ?? 'blur'
          if (am !== 'stretch') {
            this.patch(jobId, { progressText: '入力画像を調整中…' })
            mkdirSync(tempDir(), { recursive: true })
            const fitted = join(tempDir(), `i2v_${jobId}.png`)
            try {
              if (am === 'crop') {
                await fitCropImage(job.request.inputImagePath, fitted, job.request.width, job.request.height)
              } else if (am === 'pad') {
                await fitPadBlackImage(job.request.inputImagePath, fitted, job.request.width, job.request.height)
              } else {
                await fitBlurPadImage(job.request.inputImagePath, fitted, job.request.width, job.request.height)
              }
              toUpload = fitted
            } catch {
              // fall back to the raw image (the node then stretches it)
            }
          }
        }
        this.patch(jobId, { progressText: '入力画像アップロード中…' })
        refs.image = await client.uploadImage(toUpload)
      }
      if (this.cancelledEarly(jobId)) return
      if (job.request.inputAudioPath) {
        // normalize to 48k wav — LoadAudio's MIME filter rejects some source
        // extensions, and the LTX audio VAE wants clean PCM anyway
        let audioToUpload = job.request.inputAudioPath
        this.patch(jobId, { progressText: '音声を変換中…' })
        try {
          mkdirSync(tempDir(), { recursive: true })
          const wav = join(tempDir(), `audio_${jobId}.wav`)
          // only the video-duration slice is conditioned on (LTX2 = 24fps);
          // cap the conversion so a full-length song isn't uploaded
          await toWav48k(job.request.inputAudioPath, wav, job.request.frames / 24 + 1)
          audioToUpload = wav
        } catch {
          // fall back to the raw file (works for common formats)
        }
        this.patch(jobId, { progressText: '音声アップロード中…' })
        refs.audio = await client.uploadInputFile(audioToUpload)
      }
      if (this.cancelledEarly(jobId)) return
      if (job.request.controlVideoPath) {
        // resample to the generation fps so control motion speed maps 1:1,
        // crop to the target frame and cap length (also guarantees an .mp4
        // that LoadVideo's MIME filter accepts)
        let ctrlToUpload = job.request.controlVideoPath
        this.patch(jobId, { progressText: '制御動画を変換中…' })
        try {
          mkdirSync(tempDir(), { recursive: true })
          const fps =
            job.request.options.family === 'wanfun' && job.request.options.wanfun.size === '5b' ? 24 : 16
          const mp4 = join(tempDir(), `ctrl_${jobId}.mp4`)
          await prepareControlVideo(job.request.controlVideoPath, mp4, {
            fps,
            width: job.request.width,
            height: job.request.height,
            maxSec: job.request.frames / fps + 0.5
          })
          ctrlToUpload = mp4
        } catch {
          // fall back to the raw file
        }
        this.patch(jobId, { progressText: '制御動画アップロード中…' })
        refs.controlVideo = await client.uploadInputFile(ctrlToUpload)
      }
      if (this.cancelledEarly(jobId)) return

      // MiniMax H3: optional last keyframe (FL2VA) and reference media (Ref2VA)
      if (job.request.options.family === 'minimaxh3') {
        if (job.request.lastFrameImagePath && job.request.mode === 'i2v') {
          // the node cover-crops the LAST frame ("center"), while the app
          // pre-fits the FIRST frame per aspectMode — without the same fit
          // here, blur/pad first frames carry bars that the last frame lacks,
          // and the video morphs between the two compositions. Pre-fitting
          // makes the node's crop an identity op ('stretch' keeps node-native
          // behavior for both frames).
          let lastToUpload = job.request.lastFrameImagePath
          const lam = job.request.options.minimaxh3.aspectMode ?? 'blur'
          if (lam !== 'stretch') {
            this.patch(jobId, { progressText: '最終フレーム画像を調整中…' })
            mkdirSync(tempDir(), { recursive: true })
            const fitted = join(tempDir(), `i2v_last_${jobId}.png`)
            try {
              if (lam === 'crop') {
                await fitCropImage(lastToUpload, fitted, job.request.width, job.request.height)
              } else if (lam === 'pad') {
                await fitPadBlackImage(lastToUpload, fitted, job.request.width, job.request.height)
              } else {
                await fitBlurPadImage(lastToUpload, fitted, job.request.width, job.request.height)
              }
              lastToUpload = fitted
            } catch {
              // fall back to the raw image (the node then cover-crops it)
            }
          }
          this.patch(jobId, { progressText: '最終フレーム画像アップロード中…' })
          refs.lastFrame = await client.uploadImage(lastToUpload)
        }
        const imgs = job.request.refImagePaths ?? []
        const vids = job.request.refVideoPaths ?? []
        const auds = job.request.refAudioPaths ?? []
        // reference media belongs to the Ref2VA variant only — a tampered
        // fl2va request carrying ref paths would waste time uploading media
        // the fl2va graph never consumes
        if (job.request.options.minimaxh3.variant === 'ref2va' && imgs.length + vids.length + auds.length > 0) {
          mkdirSync(tempDir(), { recursive: true })
          refs.refImages = []
          refs.refVideos = []
          refs.refAudios = []
          for (let i = 0; i < imgs.length; i++) {
            this.patch(jobId, { progressText: `参照画像 ${i + 1}/${imgs.length} アップロード中…` })
            refs.refImages.push(await client.uploadImage(imgs[i]))
            if (this.cancelledEarly(jobId)) return
          }
          for (let i = 0; i < vids.length; i++) {
            // 24fps・15秒上限・音声なしへ正規化(音声は <Audio j> 参照で渡す)
            this.patch(jobId, { progressText: `参照動画 ${i + 1}/${vids.length} を変換中…` })
            // fail fast on too-short refs: the node needs >=5 frames (~0.21s
            // at 24fps) and would otherwise error AFTER the 42GB model load
            const vMeta = await probe(vids[i]).catch(() => null)
            if (vMeta && vMeta.durationSec > 0 && vMeta.durationSec < 0.3) {
              throw new Error(
                `参照動画 ${i + 1} が短すぎます(約${vMeta.durationSec.toFixed(1)}秒)。0.3秒以上(推奨2〜15秒)の動画を指定してください`
              )
            }
            let up = vids[i]
            try {
              const mp4 = join(tempDir(), `refv_${jobId}_${i + 1}.mp4`)
              await prepareRefVideo(vids[i], mp4, 15)
              up = mp4
            } catch {
              // fall back to the raw file (LoadVideo handles common mp4/mov)
            }
            this.patch(jobId, { progressText: `参照動画 ${i + 1}/${vids.length} アップロード中…` })
            refs.refVideos.push(await client.uploadInputFile(up))
            if (this.cancelledEarly(jobId)) return
          }
          for (let i = 0; i < auds.length; i++) {
            this.patch(jobId, { progressText: `参照音声 ${i + 1}/${auds.length} を変換中…` })
            const aMeta = await probe(auds[i]).catch(() => null)
            if (aMeta && aMeta.durationSec > 0 && aMeta.durationSec < 0.3) {
              throw new Error(
                `参照音声 ${i + 1} が短すぎます(約${aMeta.durationSec.toFixed(1)}秒)。0.3秒以上(推奨2〜15秒)の音声を指定してください`
              )
            }
            let up = auds[i]
            try {
              const wav = join(tempDir(), `refa_${jobId}_${i + 1}.wav`)
              await toWav48k(auds[i], wav, 15)
              up = wav
            } catch {
              // fall back to the raw file
            }
            this.patch(jobId, { progressText: `参照音声 ${i + 1}/${auds.length} アップロード中…` })
            refs.refAudios.push(await client.uploadInputFile(up))
            if (this.cancelledEarly(jobId)) return
          }
        }
      }
      if (this.cancelledEarly(jobId)) return

      const { graph, fps } = buildGraph(job.request, jobId, refs)

      let previewAt = 0
      // resolved by WS success/executing(null); also has two safety nets so a
      // dropped socket or crashed engine can never wedge the job forever:
      //   1) engine status -> reject if it stops/errors mid-job
      //   2) a /history poll that resolves/rejects from the authoritative record
      let settle: { resolve: () => void; reject: (e: Error) => void } | null = null
      let offEvent = (): void => {}
      let offStatus = (): void => {}
      let poll: NodeJS.Timeout | null = null
      const teardown = (): void => {
        offEvent()
        offStatus()
        if (poll) clearInterval(poll)
        poll = null
      }
      const done = new Promise<void>((resolve, reject) => {
        settle = {
          resolve: () => {
            teardown()
            resolve()
          },
          reject: (e) => {
            teardown()
            reject(e)
          }
        }
        offEvent = client.onEvent((ev) => {
          const j = this.jobs.get(jobId)
          if (!j) return
          // events from a FOREIGN prompt (e.g. a cancelled zombie still
          // finishing engine-side) must not move this job's progress bar or
          // fail it — filter whenever both sides carry a prompt id
          if (
            (ev.kind === 'progress' || ev.kind === 'error') &&
            ev.promptId &&
            this.currentPromptId &&
            ev.promptId !== this.currentPromptId
          ) {
            return
          }
          if (ev.kind === 'progress') {
            const p = ev.max > 0 ? ev.value / ev.max : 0
            this.patch(jobId, {
              state: j.state === 'cancelled' ? 'cancelled' : 'running',
              progress: p,
              progressText: `サンプリング ${ev.value}/${ev.max}`
            })
          } else if (ev.kind === 'preview') {
            const now = Date.now()
            if (now - previewAt > 700) {
              previewAt = now
              this.patch(jobId, {
                previewDataUrl: `data:${ev.mime};base64,${ev.data.toString('base64')}`
              })
            }
          } else if (ev.kind === 'success') {
            if (ev.promptId === this.currentPromptId) settle?.resolve()
          } else if (ev.kind === 'executing') {
            if (ev.node === null && ev.promptId === this.currentPromptId) settle?.resolve()
          } else if (ev.kind === 'error') {
            settle?.reject(new Error(ev.message))
          }
        })
        offStatus = comfyManager.onStatus((s) => {
          if (s.state === 'stopped' || s.state === 'error') {
            settle?.reject(new Error('生成エンジンが停止しました(ログを確認してください)'))
          }
        })
      })

      // teardown MUST run once listeners are subscribed, even if patch or
      // queuePrompt throws — otherwise offEvent/offStatus leak on failure
      let promptId = ''
      try {
        this.patch(jobId, { state: 'running', progressText: 'ワークフロー送信中…' })
        const queued = await client.queuePrompt(graph)
        promptId = queued.promptId
        this.currentPromptId = promptId
        // A cancel issued while queuePrompt was in flight found no promptId to
        // interrupt, so the job showed キャンセル while the engine ran the whole
        // generation (and the queue stayed blocked). Re-check and stop it now —
        // dequeue first in case the engine hasn't started it yet (interrupt
        // alone would no-op there and leave a zombie generation running).
        if (this.jobs.get(jobId)?.state === 'cancelled') {
          await client.deleteQueued(promptId).catch(() => undefined)
          await client.interrupt().catch(() => undefined)
          this.patch(jobId, { finishedAt: Date.now() })
          return
        }

        // watchdog: even if the WS misses the final event, /history is authoritative
        poll = setInterval(() => {
          // キャンセル済みなら interrupt を再送し続ける。cancel() の1回きりの
          // interrupt は、モデル初期化などで Python が分単位でブロックしている
          // 間はタイムアウトして失われる(実機: Cosmos v2w 初期化 56 秒)。
          // 失われると「キャンセル済み」表示のまま生成が最後まで走り、その間
          // キューも塞がる。キューは直列なので他のプロンプトを誤爆する余地は
          // なく、アイドルのエンジンへの interrupt は無害な no-op。
          if (this.jobs.get(jobId)?.state === 'cancelled') {
            void client.interrupt().catch(() => undefined)
          }
          void client.historyState(promptId).then((st) => {
            if (st === 'completed') settle?.resolve()
            else if (st === 'error') settle?.reject(new Error('生成に失敗しました(ComfyUI側でエラー)'))
          })
        }, 4000)

        await done
      } finally {
        teardown()
      }

      if (this.jobs.get(jobId)?.state === 'cancelled') {
        this.patch(jobId, { finishedAt: Date.now() })
        return
      }

      this.patch(jobId, { state: 'saving', progressText: '動画を保存中…' })
      const outputs = await client.historyOutputs(promptId)
      const vid = outputs.find((f) => /\.(mp4|webm|mov)$/i.test(f.filename))
      if (!vid) throw new Error('生成出力が見つかりません(SaveVideoノードの出力なし)')
      const srcPath = join(engineOutputDir(), vid.subfolder, vid.filename)
      if (!existsSync(srcPath)) throw new Error(`出力ファイルが見つかりません: ${srcPath}`)

      const videoId = `${Date.now().toString(36)}_${jobId}`
      const ext = vid.filename.split('.').pop() ?? 'mp4'
      mkdirSync(libraryDir(), { recursive: true })
      const destPath = join(libraryDir(), `${videoId}.${ext}`)
      try {
        renameSync(srcPath, destPath)
      } catch {
        copyFileSync(srcPath, destPath)
        rmSync(srcPath, { force: true })
      }
      const thumbPath = join(thumbsDir(), `${videoId}.jpg`)
      await makeThumbnail(destPath, thumbPath).catch(() => undefined)
      const media = await probe(destPath).catch(() => null)

      const meta = FAMILY_META[job.request.options.family]
      const rec: VideoRecord = {
        id: videoId,
        filePath: destPath,
        thumbPath,
        family: job.request.options.family,
        mode: job.request.mode,
        prompt: job.request.prompt,
        negative: job.request.negative,
        seed: job.request.seed,
        width: media?.width ?? job.request.width,
        height: media?.height ?? job.request.height,
        fps: media?.fps ?? fps,
        frames: job.request.frames,
        durationSec: media?.durationSec ?? job.request.frames / fps,
        createdAt: Date.now(),
        favorite: false,
        tags: [],
        requestJson: JSON.stringify(job.request),
        modelLabel: meta.modelLabel
      }
      library.insert(rec)
      this.patch(jobId, {
        state: 'completed',
        finishedAt: Date.now(),
        progress: 1,
        progressText: undefined,
        previewDataUrl: undefined, // release the retained base64 preview frame
        videoId
      })
    } catch (err) {
      const j = this.jobs.get(jobId)
      if (j && j.state !== 'cancelled') {
        this.patch(jobId, {
          state: 'failed',
          finishedAt: Date.now(),
          error: err instanceof Error ? err.message : String(err)
        })
      } else if (j) {
        this.patch(jobId, { finishedAt: Date.now() })
      }
    } finally {
      this.currentJobId = null
      this.currentPromptId = null
      // per-job scratch files (fitted image / converted audio / control video /
      // minimax reference media) used to accumulate under work/tmp
      const scratch = [
        join(tempDir(), `i2v_${jobId}.png`),
        join(tempDir(), `i2v_last_${jobId}.png`),
        join(tempDir(), `audio_${jobId}.wav`),
        join(tempDir(), `ctrl_${jobId}.mp4`)
      ]
      for (let i = 1; i <= 3; i++) {
        scratch.push(join(tempDir(), `refv_${jobId}_${i}.mp4`))
        scratch.push(join(tempDir(), `refa_${jobId}_${i}.wav`))
      }
      for (const f of scratch) {
        try {
          rmSync(f, { force: true })
        } catch {
          /* best effort */
        }
      }
      this.trimHistory()
    }
  }

  /**
   * Keep the in-memory job list bounded. Every finished job stayed in `jobs`
   * (and in listJobs' IPC payload) for the whole session; only the newest
   * MAX_HISTORY finished jobs are worth keeping for the panel.
   */
  private trimHistory(): void {
    const MAX_HISTORY = 50
    const finished = this.order.filter((id) => {
      const s = this.jobs.get(id)?.state
      return s === 'completed' || s === 'failed' || s === 'cancelled'
    })
    const excess = finished.length - MAX_HISTORY
    if (excess <= 0) return
    for (const id of finished.slice(0, excess)) {
      this.jobs.delete(id)
      const i = this.order.indexOf(id)
      if (i >= 0) this.order.splice(i, 1)
    }
  }
}

export const jobQueue = new JobQueue()

// エンジンのヘルスチェックに「ジョブ実行中か」を教える(実行中はモデル初期化
// による長い無応答が正常のため、応答なし判定の閾値が緩和される)。queue は
// 元々 manager に依存しているので、この向きの登録なら循環参照にならない。
comfyManager.setBusyProbe(() => jobQueue.hasActive())
