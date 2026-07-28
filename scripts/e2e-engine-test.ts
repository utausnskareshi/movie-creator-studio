/**
 * E2E engine verification driver.
 *
 * Exercises the app's real generation path WITHOUT the UI:
 *   1. installs ComfyUI portable (pinned release, SHA256-verified) — same URL logic as the app
 *   2. downloads the Wan2.2 TI2V-5B model set from HuggingFace (resume + LFS SHA256)
 *   3. launches ComfyUI headless with the app's exact flags + extra_model_paths.yaml
 *   4. validates required node classes via /object_info
 *   5. builds the real T2V workflow via src/main/comfyui/graphs.ts and queues it
 *   6. waits for completion and asserts the output video exists
 *
 * Run (Node 24, type stripping):  node scripts/e2e-engine-test.ts
 * Data goes to C:\MCS-Data (the app's default) so a later app install reuses it.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { path7za } from '7zip-bin'
import {
  downloadFile,
  githubReleaseAsset,
  hfPathInfo,
  hfResolveUrl
} from '../src/main/core/downloader.ts'
import { buildGraph, setWorkflowsDir } from '../src/main/comfyui/graphs.ts'

const DATA = process.env.MCS_DATA ?? 'C:\\MCS-Data'
const ENGINE = join(DATA, 'engine')
const MODELS = join(DATA, 'models')
const OUTDIR = join(DATA, 'work', 'engine-output')
const INDIR = join(DATA, 'work', 'engine-input')
const COMFY_ROOT = join(ENGINE, 'ComfyUI_windows_portable')
const PY = join(COMFY_ROOT, 'python_embeded', 'python.exe')
const MAIN = join(COMFY_ROOT, 'ComfyUI', 'main.py')
const COMFY_TAG = 'v0.28.0'

const log = (...a: unknown[]): void => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

const MODEL_FILES = [
  {
    repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
    path: 'split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors',
    dest: 'diffusion_models/wan2.2_ti2v_5B_fp16.safetensors'
  },
  {
    repo: 'Comfy-Org/Wan_2.1_ComfyUI_repackaged',
    path: 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    dest: 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors'
  },
  {
    repo: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
    path: 'split_files/vae/wan2.2_vae.safetensors',
    dest: 'vae/wan2.2_vae.safetensors'
  }
]

async function extract7z(archive: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(path7za, ['x', archive, `-o${dest}`, '-y'], { windowsHide: true })
    let err = ''
    p.stderr.on('data', (d) => (err += String(d)))
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`7za exit ${c}: ${err}`))))
    p.on('error', reject)
  })
}

async function main(): Promise<void> {
  for (const d of [ENGINE, MODELS, OUTDIR, INDIR]) mkdirSync(d, { recursive: true })

  // ---- 1. ComfyUI portable -------------------------------------------------
  if (!existsSync(MAIN)) {
    log('resolving ComfyUI release asset…')
    const asset = await githubReleaseAsset('comfyanonymous/ComfyUI', COMFY_TAG, /^ComfyUI_windows_portable_nvidia\.7z$/)
    if (!asset) throw new Error('ComfyUI asset not found')
    log(`downloading ${asset.name} (${(asset.size / 1e9).toFixed(2)} GB, sha256 ${asset.sha256 ? 'yes' : 'NO'})`)
    const archive = join(ENGINE, asset.name)
    let lastPct = -1
    await downloadFile(
      { id: 'comfyui', label: asset.name, url: asset.url, dest: archive, expectedBytes: asset.size, expectedSha256: asset.sha256 ?? undefined },
      (p) => {
        const pct = p.totalBytes ? Math.floor((p.receivedBytes / p.totalBytes) * 100) : 0
        if (p.status === 'downloading' && pct !== lastPct && pct % 5 === 0) {
          lastPct = pct
          log(`  comfyui ${pct}% (${(p.bytesPerSec / 1e6).toFixed(1)} MB/s)`)
        } else if (p.status !== 'downloading') log(`  comfyui: ${p.status}${p.error ? ' ' + p.error : ''}`)
      }
    )
    log('extracting…')
    await extract7z(archive, ENGINE)
    rmSync(archive, { force: true })
    if (!existsSync(MAIN)) throw new Error('unexpected archive layout')
  } else {
    log('ComfyUI already installed')
  }

  // extra_model_paths.yaml (same content as the app writes)
  const yaml = `mcs:\n  base_path: ${MODELS.replace(/\\/g, '/')}\n  is_default: true\n  diffusion_models: diffusion_models\n  text_encoders: text_encoders\n  vae: vae\n  loras: loras\n  clip_vision: clip_vision\n  latent_upscale_models: latent_upscale_models\n  CogVideo: CogVideo\n`
  writeFileSync(join(ENGINE, 'extra_model_paths.yaml'), yaml)

  // ---- 2. models -------------------------------------------------------------
  for (const f of MODEL_FILES) {
    const dest = join(MODELS, f.dest)
    if (existsSync(dest)) {
      log(`model present: ${f.dest}`)
      continue
    }
    const info = await hfPathInfo(f.repo, f.path, null)
    log(`downloading ${f.dest} (${info ? (info.size / 1e9).toFixed(2) : '?'} GB, sha256 ${info?.sha256 ? 'yes' : 'NO'})`)
    let lastPct = -1
    await downloadFile(
      {
        id: f.dest,
        label: f.dest,
        url: hfResolveUrl(f.repo, f.path, null),
        dest,
        expectedBytes: info?.size,
        expectedSha256: info?.sha256 ?? undefined
      },
      (p) => {
        const pct = p.totalBytes ? Math.floor((p.receivedBytes / p.totalBytes) * 100) : 0
        if (p.status === 'downloading' && pct !== lastPct && pct % 5 === 0) {
          lastPct = pct
          log(`  ${f.dest.split('/').pop()} ${pct}% (${(p.bytesPerSec / 1e6).toFixed(1)} MB/s)`)
        } else if (p.status !== 'downloading') log(`  ${f.dest.split('/').pop()}: ${p.status}${p.error ? ' ' + p.error : ''}`)
      }
    )
  }

  // ---- 3. launch engine ---------------------------------------------------------
  const port = 8199
  log(`launching ComfyUI on :${port}…`)
  const proc = spawn(
    PY,
    ['-s', MAIN, '--windows-standalone-build', '--disable-auto-launch', '--listen', '127.0.0.1', '--port', String(port), '--extra-model-paths-config', join(ENGINE, 'extra_model_paths.yaml'), '--output-directory', OUTDIR, '--input-directory', INDIR, '--preview-method', 'auto', '--reserve-vram', '1.0'],
    { cwd: COMFY_ROOT, windowsHide: true }
  )
  let engineLog = ''
  proc.stdout.on('data', (d) => (engineLog += String(d)))
  proc.stderr.on('data', (d) => (engineLog += String(d)))
  const kill = (): void => {
    try {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true })
    } catch {
      /* ignore */
    }
  }
  process.on('exit', kill)

  const base = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const j = (await res.json()) as { system?: { comfyui_version?: string }; devices?: Array<{ name?: string }> }
        log(`engine ready: ComfyUI ${j.system?.comfyui_version} on ${j.devices?.[0]?.name}`)
        ready = true
        break
      }
    } catch {
      /* not up yet */
    }
    if (proc.exitCode !== null) break
  }
  if (!ready) {
    kill()
    console.error(engineLog.slice(-4000))
    throw new Error('engine did not become ready')
  }

  // ---- 4. node class validation ---------------------------------------------------
  const oi = (await (await fetch(`${base}/object_info`)).json()) as Record<string, unknown>
  const required = ['UNETLoader', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode', 'ModelSamplingSD3', 'Wan22ImageToVideoLatent', 'KSampler', 'VAEDecode', 'CreateVideo', 'SaveVideo']
  const missing = required.filter((c) => !(c in oi))
  if (missing.length) throw new Error(`missing node classes: ${missing.join(', ')}`)
  log('all required node classes present')

  // ---- 5. build + queue the real app workflow ---------------------------------------
  setWorkflowsDir(join(process.cwd(), 'resources', 'workflows'))
  const { graph } = buildGraph(
    {
      family: 'wan22',
      mode: 't2v',
      prompt:
        'A cinematic drone shot over a coastal town at golden hour, warm sunlight, gentle camera push-in, waves rolling onto the beach',
      negative: '色调艳丽,过曝,静态,细节模糊不清,最差质量,低质量',
      seed: 1234,
      width: 1280,
      height: 704,
      frames: 49,
      options: { family: 'wan22', wan22: { size: '5b', lightning: false, steps: 20, cfg: 5 } }
    },
    'e2etest',
    null
  )
  log('queueing workflow…')
  const qRes = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: 'e2e' })
  })
  if (!qRes.ok) {
    const body = await qRes.text()
    kill()
    throw new Error(`prompt rejected: HTTP ${qRes.status} ${body.slice(0, 1500)}`)
  }
  const { prompt_id } = (await qRes.json()) as { prompt_id: string }
  log(`queued prompt ${prompt_id} — sampling (this takes a few minutes)…`)

  // ---- 6. wait for completion ----------------------------------------------------------
  const deadline = Date.now() + 40 * 60_000
  let outputs: Array<{ filename: string; subfolder: string }> = []
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000))
    const h = (await (await fetch(`${base}/history/${prompt_id}`)).json()) as Record<
      string,
      { status?: { status_str?: string; completed?: boolean; messages?: unknown[] }; outputs?: Record<string, Record<string, unknown>> }
    >
    const entry = h[prompt_id]
    if (!entry) continue
    if (entry.status?.status_str === 'error') {
      kill()
      console.error(JSON.stringify(entry.status.messages)?.slice(0, 3000))
      throw new Error('generation failed')
    }
    if (entry.status?.completed && entry.outputs) {
      for (const nodeOut of Object.values(entry.outputs)) {
        for (const v of Object.values(nodeOut)) {
          if (Array.isArray(v))
            for (const item of v)
              if (item && typeof item === 'object' && 'filename' in item)
                outputs.push(item as { filename: string; subfolder: string })
        }
      }
      break
    }
  }
  kill()
  const vid = outputs.find((f) => /\.(mp4|webm)$/i.test(f.filename))
  if (!vid) throw new Error('no video output found in history')
  const outPath = join(OUTDIR, vid.subfolder ?? '', vid.filename)
  if (!existsSync(outPath)) throw new Error(`output file missing: ${outPath}`)
  const size = statSync(outPath).size
  log(`✅ PASS — generated video: ${outPath} (${(size / 1e6).toFixed(2)} MB)`)
  log(`output dir listing: ${readdirSync(join(OUTDIR, vid.subfolder ?? '')).join(', ')}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('E2E FAILED:', e)
  process.exit(1)
})
