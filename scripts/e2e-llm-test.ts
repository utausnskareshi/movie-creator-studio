/**
 * E2E test of the prompt-conversion LLM path:
 *   downloads the llama.cpp CPU runtime + Qwen3-4B-Instruct GGUF (same sources
 *   as the app), launches llama-server on CPU, and converts Japanese inputs
 *   into per-model English prompts using the real system prompts.
 *
 * Run:  node scripts/e2e-llm-test.ts
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { path7za } from '7zip-bin'
import { downloadFile, githubReleaseAsset, hfPathInfo, hfResolveUrl } from '../src/main/core/downloader.ts'
import { SYSTEM_PROMPTS, cleanLlmOutput } from '../src/main/llm/prompts.ts'

const DATA = process.env.MCS_DATA ?? 'C:\\MCS-Data'
const LLM = join(DATA, 'llm')
const EXE = join(LLM, 'bin', 'llama-server.exe')
const GGUF = join(LLM, 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf')

const log = (...a: unknown[]): void => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

function findFileRecursive(root: string, name: string): string | null {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === name) return p
    if (entry.isDirectory()) {
      const f = findFileRecursive(p, name)
      if (f) return f
    }
  }
  return null
}

async function main(): Promise<void> {
  mkdirSync(join(LLM, 'bin'), { recursive: true })

  if (!existsSync(EXE)) {
    const asset = await githubReleaseAsset('ggml-org/llama.cpp', 'latest', /^llama-.*-bin-win-cpu-x64\.zip$/)
    if (!asset) throw new Error('llama.cpp asset not found')
    log(`downloading ${asset.name} (${(asset.size / 1e6).toFixed(0)}MB, sha ${asset.sha256 ? 'yes' : 'no'})`)
    const zip = join(LLM, asset.name)
    await downloadFile({ id: 'llm-rt', label: asset.name, url: asset.url, dest: zip, expectedBytes: asset.size, expectedSha256: asset.sha256 ?? undefined }, () => undefined)
    const tmp = join(LLM, 'extract')
    rmSync(tmp, { recursive: true, force: true })
    await new Promise<void>((res, rej) => {
      const p = spawn(path7za, ['x', zip, `-o${tmp}`, '-y'], { windowsHide: true })
      p.on('close', (c) => (c === 0 ? res() : rej(new Error(`7za ${c}`))))
    })
    const exe = findFileRecursive(tmp, 'llama-server.exe')
    if (!exe) throw new Error('llama-server.exe not in archive')
    for (const f of readdirSync(dirname(exe))) copyFileSync(join(dirname(exe), f), join(LLM, 'bin', f))
    rmSync(tmp, { recursive: true, force: true })
    rmSync(zip, { force: true })
    log('runtime installed')
  } else log('runtime present')

  if (!existsSync(GGUF)) {
    const info = await hfPathInfo('unsloth/Qwen3-4B-Instruct-2507-GGUF', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', null)
    log(`downloading GGUF (${info ? (info.size / 1e9).toFixed(2) : '?'}GB, sha ${info?.sha256 ? 'yes' : 'no'})`)
    let last = -1
    await downloadFile(
      { id: 'llm-gguf', label: 'qwen3-4b', url: hfResolveUrl('unsloth/Qwen3-4B-Instruct-2507-GGUF', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', null), dest: GGUF, expectedBytes: info?.size, expectedSha256: info?.sha256 ?? undefined },
      (p) => {
        const pct = p.totalBytes ? Math.floor((p.receivedBytes / p.totalBytes) * 100) : 0
        if (p.status === 'downloading' && pct !== last && pct % 10 === 0) {
          last = pct
          log(`  gguf ${pct}% (${(p.bytesPerSec / 1e6).toFixed(0)}MB/s)`)
        } else if (p.status !== 'downloading') log(`  gguf: ${p.status}`)
      }
    )
  } else log('gguf present')

  const port = 8231
  log('starting llama-server (CPU)…')
  const proc = spawn(EXE, ['-m', GGUF, '--host', '127.0.0.1', '--port', String(port), '-c', '4096', '--jinja'], { windowsHide: true })
  let serverLog = ''
  proc.stdout.on('data', (d) => (serverLog += String(d)))
  proc.stderr.on('data', (d) => (serverLog += String(d)))
  const kill = (): void => {
    try { proc.kill() } catch { /* gone */ }
  }
  process.on('exit', kill)

  let ready = false
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) { ready = true; break }
    } catch { /* not yet */ }
    if (proc.exitCode !== null) break
  }
  if (!ready) { kill(); console.error(serverLog.slice(-2000)); throw new Error('server not ready') }
  log('server ready')

  const cases = [
    { family: 'wan22' as const, ja: '夕暮れの海辺の街をドローンで撮った映画のような映像。波が浜辺に打ち寄せる。' },
    { family: 'cogvideox' as const, ja: '女の子が優しく微笑んで、髪が風で少し揺れる。' },
    { family: 'cosmos' as const, ja: '雪山の尾根の上を朝日の中でゆっくり前進していく空撮。' }
  ]
  for (const c of cases) {
    const t0 = Date.now()
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[c.family] },
          { role: 'user', content: c.ja }
        ],
        temperature: 0.7,
        top_p: 0.8,
        max_tokens: 360,
        stream: false
      }),
      signal: AbortSignal.timeout(300_000)
    })
    if (!res.ok) { kill(); throw new Error(`chat HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`) }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const out = cleanLlmOutput(j.choices?.[0]?.message?.content ?? '')
    log(`--- ${c.family} (${((Date.now() - t0) / 1000).toFixed(1)}s) ---`)
    console.log(out)
    if (!out || /[぀-ヿ一-鿿]/.test(out)) { kill(); throw new Error(`bad output for ${c.family} (empty or contains Japanese)`) }
  }
  kill()
  log('✅ LLM E2E PASS')
  process.exit(0)
}

main().catch((e) => {
  console.error('LLM E2E FAILED:', e)
  process.exit(1)
})
