import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, rmSync, copyFileSync } from 'fs'
import { rm } from 'fs/promises'
import { dirname, join } from 'path'
import { path7za } from '7zip-bin'
import type { DownloadProgress, SetupStatus } from '@shared/types'
import {
  downloadFile,
  downloadWithRetry,
  githubReleaseAsset,
  hfResolveUrl,
  hfPathInfo
} from '../core/downloader'
import type { ProgressCb } from '../core/downloader'
import {
  comfyMain,
  comfyPython,
  comfyRoot,
  configDir,
  customNodesDir,
  engineDir,
  ffmpegDir,
  ffmpegExe,
  ffprobeExe,
  llmDir,
  llmModelPath,
  llmServerExe,
  modelsDir,
  tempDir
} from '../core/paths'
import { getSettings } from '../core/settings'
import { allModelFiles, CUSTOM_NODES, CUSTOM_NODE_ASSETS } from '../models/registry'

const execFileP = promisify(execFile)

/**
 * ComfyUI portable release pinned for this app version (verified working set).
 * v0.30.0: MiniMax H3 native support(v0.29.0で追加・0.30.0で768P対応完了、
 * 公式ドキュメントの要求バージョン)。0.28→0.30 で既存7ファミリのノードに
 * 破壊的変更はないことをリリースノートで確認済み(要実機スモークテスト)。
 */
export const COMFY_PIN = {
  tag: 'v0.30.0',
  asset: /^ComfyUI_windows_portable_nvidia\.7z$/
}

/**
 * llama.cpp release pinned for this app version(検証済み: llama-server.exe と
 * 全DLLがzipルート直下・SHA256 digest一致を実機確認)。
 * 「latest」は使わない: llama.cpp は1日に何度もタグが切られ、タグ作成から
 * CI が資産をアップロードし終わるまで assets が空のリリースが latest になる
 * (実機で b10156 = assets 0 件に遭遇し「CPUビルドが見つかりません」で失敗)。
 * ピン留めで決定的にし、latest はピンのリリースが消えた場合の予備に格下げ。
 */
export const LLAMA_PIN = {
  tag: 'b10155',
  asset: /^llama-.*-bin-win-cpu-x64\.zip$/
}

// ---------------------------------------------------------------------------
// Exclusivity: a given install/download must never run twice concurrently
// (two writers on the same .part/extract dir would corrupt it). The UI also
// disables buttons, but this is the authoritative guard.
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<unknown>>()

/**
 * Run `fn` under `key`, but if an identical operation is already running,
 * JOIN it (await the same promise) instead of throwing or starting a second.
 * This makes concurrent/rapid callers safe: a double-clicked "download"
 * or two packs needing the same custom node / shared file just await the
 * one in-flight operation.
 */
async function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const p = (async () => fn())()
  inFlight.set(key, p)
  try {
    return await p
  } finally {
    inFlight.delete(key)
  }
}

// 7za binary lives inside asar-unpacked node_modules when packaged
function sevenZip(): string {
  return path7za.replace('app.asar', 'app.asar.unpacked')
}

async function extract7z(archive: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const p = spawn(sevenZip(), ['x', archive, `-o${destDir}`, '-y'], { windowsHide: true })
    let err = ''
    p.stderr.on('data', (d) => (err += String(d)))
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`7za exit ${code}: ${err}`))))
    p.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function getSetupStatus(): SetupStatus {
  const modelFiles: Record<string, boolean> = {}
  for (const f of allModelFiles()) {
    modelFiles[f.id] = existsSync(join(modelsDir(), f.dest))
  }
  const customNodes: Record<string, boolean> = {}
  for (const n of CUSTOM_NODES) {
    customNodes[n.id] = existsSync(join(customNodesDir(), n.id))
  }
  let engineVersion: string | undefined
  try {
    const vf = join(engineDir(), 'comfy-version.txt')
    if (existsSync(vf)) engineVersion = readFileSync(vf, 'utf-8').trim() || undefined
  } catch {
    /* unreadable marker = unknown version */
  }
  return {
    comfyui: {
      installed: existsSync(comfyMain()) && existsSync(comfyPython()),
      version: engineVersion,
      pinnedVersion: COMFY_PIN.tag,
      path: comfyRoot()
    },
    ffmpeg: { installed: existsSync(ffmpegExe()) && existsSync(ffprobeExe()), path: ffmpegDir() },
    llm: { installed: existsSync(llmServerExe()) && existsSync(llmModelPath()), path: llmDir() },
    customNodes,
    modelFiles
  }
}

// ---------------------------------------------------------------------------
// Prompt-conversion LLM: llama.cpp CPU runtime + Qwen3-4B-Instruct GGUF
// ---------------------------------------------------------------------------

const LLM_GGUF = {
  repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
  path: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  bytes: 2.33 * 1024 ** 3
}

export function installLlm(cb: ProgressCb): Promise<void> {
  return exclusive('llm', () => doInstallLlm(cb))
}

async function doInstallLlm(cb: ProgressCb): Promise<void> {
  // 1) llama.cpp CPU server binary (small zip from the official releases)
  if (!existsSync(llmServerExe())) {
    const asset =
      (await githubReleaseAsset('ggml-org/llama.cpp', LLAMA_PIN.tag, LLAMA_PIN.asset)) ??
      // fallbacks only if the pinned release was deleted upstream — note the
      // "latest" release can be legitimately EMPTY right after a tag lands
      (await githubReleaseAsset('ggml-org/llama.cpp', 'latest', /^llama-.*-bin-win-cpu-x64\.zip$/)) ??
      (await githubReleaseAsset('ggml-org/llama.cpp', 'latest', /^llama-.*-bin-win-avx2-x64\.zip$/)) ??
      (await githubReleaseAsset('ggerganov/llama.cpp', 'latest', /^llama-.*-bin-win-(cpu|avx2)-x64\.zip$/))
    if (!asset) {
      throw new Error(
        'llama.cpp のWindows用CPUビルドが見つかりませんでした(リリース直後は配布ファイルが未公開のことがあります。時間をおいて再試行してください)'
      )
    }
    const archive = join(tempDir(), asset.name)
    await downloadWithRetry(
      {
        id: 'llm',
        label: `llama.cpp ランタイム (${asset.name})`,
        url: asset.url,
        dest: archive,
        expectedBytes: asset.size,
        expectedSha256: asset.sha256 ?? undefined
      },
      cb
    )
    cb(progress('llm', 'llama.cpp ランタイム', 'extracting'))
    const tmpOut = join(tempDir(), 'llm-extract')
    rmSync(tmpOut, { recursive: true, force: true })
    await extract7z(archive, tmpOut)
    // recent releases place the exes at the zip root; older ones under build/bin
    const exe = findFileRecursive(tmpOut, 'llama-server.exe')
    if (!exe) throw new Error('llama-server.exe がアーカイブ内に見つかりません')
    // Copy into a staging folder and move it into place only once every file
    // landed. Copying straight into bin/ meant a failure midway (a directory
    // entry hitting copyFileSync, disk full) left llama-server.exe present
    // without its DLLs — and llm.installed keys off that exe, so the broken
    // runtime was reported as installed and never repaired.
    const stagedBin = join(tempDir(), 'llm-bin-staging')
    rmSync(stagedBin, { recursive: true, force: true })
    mkdirSync(stagedBin, { recursive: true })
    for (const f of readdirSync(dirname(exe), { withFileTypes: true })) {
      if (!f.isFile()) continue // subdirectories in the archive are not runtime deps
      copyFileSync(join(dirname(exe), f.name), join(stagedBin, f.name))
    }
    if (!existsSync(join(stagedBin, 'llama-server.exe'))) {
      throw new Error('llama.cpp ランタイムのコピーに失敗しました')
    }
    rmSync(join(llmDir(), 'bin'), { recursive: true, force: true })
    mkdirSync(llmDir(), { recursive: true })
    renameSync(stagedBin, join(llmDir(), 'bin'))
    rmSync(tmpOut, { recursive: true, force: true })
    rmSync(archive, { force: true })
  }

  // 2) Qwen3-4B-Instruct GGUF (Apache-2.0)
  if (!existsSync(llmModelPath())) {
    const mirror = getSettings().hfMirror
    const info = await hfPathInfo(LLM_GGUF.repo, LLM_GGUF.path, mirror)
    await downloadWithRetry(
      {
        id: 'llm',
        label: 'Qwen3-4B-Instruct (GGUF Q4_K_M)',
        url: hfResolveUrl(LLM_GGUF.repo, LLM_GGUF.path, mirror),
        dest: llmModelPath(),
        expectedBytes: info?.size ?? LLM_GGUF.bytes,
        expectedSha256: info?.sha256 ?? undefined
      },
      cb
    )
  }
  cb(progress('llm', 'プロンプト変換AI', 'done'))
}

function findFileRecursive(root: string, name: string): string | null {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === name) return p
    if (entry.isDirectory()) {
      const found = findFileRecursive(p, name)
      if (found) return found
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// ComfyUI portable
// ---------------------------------------------------------------------------

// The queue refuses new generations while this gate is held: a job would
// boot the engine mid-wipe (rename/extract collide with a fresh python.exe).
// A COUNTER, not a boolean: ipc.ts raises the gate BEFORE its own
// comfyManager.stop() await (several seconds — a boolean set only inside
// installComfyUI left that window open for enqueues), and the wrapper below
// raises it again around the actual install. The reverse guard (no engine
// install while a job runs) lives in ipc.ts.
let engineInstallGate = 0
export function isEngineInstallActive(): boolean {
  return engineInstallGate > 0
}
export function beginEngineInstallGate(): void {
  engineInstallGate++
}
export function endEngineInstallGate(): void {
  engineInstallGate = Math.max(0, engineInstallGate - 1)
}

export function installComfyUI(cb: ProgressCb): Promise<void> {
  return exclusive('comfyui', async () => {
    beginEngineInstallGate()
    try {
      await doInstallComfyUI(cb)
    } finally {
      endEngineInstallGate()
    }
  })
}

/**
 * Best-effort cleanup of renamed-aside engine trees (engine.__old-*) left by
 * a previous update whose delete lost a race against a lingering lock. Runs
 * at the start of every engine install/update AND (deferred) at app startup —
 * the already-on-pin early return means updates alone could leave a ~7GB
 * graveyard sitting for months. Async so the startup call never blocks the
 * main process; failures are ignored — the next sweep tries again.
 */
/** logs/engine-install.log — engine replacement is otherwise undiagnosable. */
function engineLog(line: string): void {
  try {
    const dir = join(configDir(), 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'engine-install.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    // logging must never break an install
  }
}

/**
 * Graveyard folders are named "~engN" — deliberately SHORTER than "engine"
 * (5 chars vs 6) so renaming can only shrink the paths inside. The obvious
 * "engine.__old-<epoch>" grew every descendant by 20 characters, and the
 * deepest real path under a default install measures 250 — past NSIS's 260
 * MAX_PATH limit, which would leave the uninstaller unable to delete it.
 */
const GRAVEYARD_PREFIX = '~eng'

function nextGraveyardPath(): string {
  const parent = dirname(engineDir())
  for (let i = 1; i < 1000; i++) {
    const p = join(parent, `${GRAVEYARD_PREFIX}${i}`)
    if (!existsSync(p)) return p
  }
  return join(parent, `${GRAVEYARD_PREFIX}${Date.now() % 100000}`)
}

export async function sweepOldEngineDirs(): Promise<void> {
  const parent = dirname(engineDir())
  let names: string[]
  try {
    names = readdirSync(parent)
  } catch {
    return // parent unreadable — nothing to sweep
  }
  for (const name of names) {
    if (!name.startsWith(GRAVEYARD_PREFIX)) continue
    const dir = join(parent, name)
    try {
      // A graveyard exists ONLY because a delete lost to a lock — i.e. because
      // something is still running inside it. After the rename Windows reports
      // that process under the NEW path, so killProcessesUnder(engineDir())
      // from any later update can never match it; kill under the graveyard.
      await killProcessesUnder(dir)
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    } catch {
      // still locked — leave it for the next sweep
    }
  }
}

/**
 * Kill any process still executing from inside `root` (trailing separator is
 * enforced so "engine" can never match an "engine2" sibling). The path
 * travels as an environment variable — data, not script text — so spaces or
 * quotes in the folder name cannot break the command (same pattern as the
 * uninstaller's MCS_KILL_DATA_PROCESSES). Never throws; a kill failure just
 * leaves the subsequent delete to surface its own, clearer error.
 */
async function killProcessesUnder(root: string): Promise<void> {
  const prefix = root.endsWith('\\') || root.endsWith('/') ? root : `${root}\\`
  await new Promise<void>((resolve) => {
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '$root = $env:MCS_KILL_ROOT; if ($root) { Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} } }'
      ],
      { env: { ...process.env, MCS_KILL_ROOT: prefix }, windowsHide: true, stdio: 'ignore' }
    )
    const done = (info: string): void => {
      clearTimeout(timer)
      // Without this line a kill sweep that never ran (Defender ASR blocking
      // WMI process creation, AppLocker, ConstrainedLanguage mode breaking the
      // [System.StringComparison] cast) is indistinguishable from "nothing to
      // kill" — and the only evidence left on the machine is an undeletable
      // 7GB folder.
      engineLog(`kill under ${prefix}: ${info}`)
      resolve()
    }
    const timer = setTimeout(() => {
      try {
        ps.kill()
      } catch {
        /* already gone */
      }
      done('timed out after 20s')
    }, 20_000)
    ps.on('exit', (code) => done(`exit=${code}`))
    ps.on('error', (e) => done(`powershell unavailable: ${e.message}`))
  })
  // Windows releases file/directory handles slightly after process death
  await new Promise((r) => setTimeout(r, 500))
}

async function doInstallComfyUI(cb: ProgressCb): Promise<void> {
  // Collect a previous update's leftovers FIRST: the graveyard is a full
  // ~7GB engine tree, and freeing it before the 2GB download (rather than
  // after) keeps a tight disk from failing this update.
  await sweepOldEngineDirs()
  // already on the pinned version — nothing to do (the same button doubles
  // as the「エンジンを更新」action when the pin moves with an app update)
  const versionFile = join(engineDir(), 'comfy-version.txt')
  const installedTag = existsSync(versionFile) ? readFileSync(versionFile, 'utf-8').trim() : ''
  if (existsSync(comfyMain()) && existsSync(comfyPython()) && installedTag === COMFY_PIN.tag) {
    cb(progress('comfyui', `ComfyUI portable ${COMFY_PIN.tag}`, 'done'))
    return
  }
  const asset = await githubReleaseAsset('comfyanonymous/ComfyUI', COMFY_PIN.tag, COMFY_PIN.asset)
  if (!asset) throw new Error(`ComfyUI release asset not found for ${COMFY_PIN.tag}`)
  const archive = join(tempDir(), asset.name)
  await downloadWithRetry(
    {
      id: 'comfyui',
      label: `ComfyUI portable ${COMFY_PIN.tag}`,
      url: asset.url,
      dest: archive,
      expectedBytes: asset.size,
      expectedSha256: asset.sha256 ?? undefined
    },
    cb
  )
  cb(progress('comfyui', 'ComfyUI portable', 'extracting'))
  // UPDATE PATH: the portable tree (embedded python + site-packages) must be
  // replaced wholesale — extracting a new version over an old one leaves a
  // mixed install. Models live outside engineDir; custom nodes live inside,
  // so remember which were present and re-install them against the NEW
  // embedded python (their pip deps live in the wiped site-packages).
  const nodesToRestore = CUSTOM_NODES.filter((n) =>
    existsSync(join(customNodesDir(), n.id))
  ).map((n) => n.id)
  if (existsSync(engineDir())) {
    // The wipe used to be a bare rmSync and failed with EPERM on real
    // machines(実機: 上書きインストール直後の「エンジンを更新」で再現)。
    // 実測で判明した機構: Node の rmSync はツリー内の「どれか1つ」でも
    // ロックされたエントリがあると、失敗した実エントリではなく常にルート
    // パスで `EPERM, Permission denied: <root> '<root>'` を投げる(排他
    // オープン中の子ファイル/CWD保持/dirハンドル保持の全ケースで同形式を
    // 確認)。犯人はエラーからは特定できない。原因側の実例:
    //  - an overwrite-install closes the app but can orphan the engine child
    //    (python.exe keeps running from inside engineDir and holds it)
    //  - AV/indexer transient locks while walking the ~7GB tree
    // 対策は三段構え:
    //  1. kill anything still executing from the folder
    //  2. RENAME the tree aside first — a same-volume dir rename succeeds
    //     even while files INSIDE are locked (only a handle on the dir
    //     itself blocks it), which frees the extract path immediately
    //  3. delete (renamed) tree with retries; a leftover graveyard dir is
    //     non-fatal and swept on the next engine install/update
    cb(progress('comfyui', '旧エンジンを停止・削除中', 'extracting'))
    await killProcessesUnder(engineDir())
    const graveyard = nextGraveyardPath()
    let renamed = false
    try {
      renameSync(engineDir(), graveyard)
      renamed = true
    } catch {
      // rename blocked = a handle on the directory itself; fall back to
      // deleting in place (retries below may still win)
    }
    if (renamed) {
      // The rename already freed the extract path and a leftover graveyard is
      // explicitly non-fatal, so DO NOT await this: with one locked descendant
      // rm retries for as long as the lock lives (実測119秒超), and every one
      // of those seconds would be spent parked on「旧エンジンを停止・削除中」
      // with nothing for the user to do. sweepOldEngineDirs() collects
      // whatever is left on a later run.
      void rm(graveyard, { recursive: true, force: true, maxRetries: 15, retryDelay: 400 }).catch(
        () => undefined
      )
    } else {
      try {
        // ASYNC rm, never rmSync: deleting the ~7GB tree takes seconds even
        // when it succeeds (実測6.2秒) and a sync call blocks the main process
        // for all of it, freezing the window and starving the progress IPC.
        await rm(engineDir(), { recursive: true, force: true, maxRetries: 15, retryDelay: 400 })
      } catch (e) {
        // the extract path is still occupied — this attempt cannot proceed
        const code = (e as NodeJS.ErrnoException)?.code ?? ''
        throw new Error(
          `旧エンジンフォルダを削除できませんでした(${code || 'エラー'}: ${engineDir()})。` +
            'エクスプローラーやコマンドプロンプトでこのフォルダを開いている場合は閉じ、' +
            'ウイルス対策ソフトのスキャン中の場合は1〜2分待ってから、もう一度「エンジンを更新」を押してください。'
        )
      }
    }
  }
  await extract7z(archive, engineDir())
  rmSync(archive, { force: true })
  if (!existsSync(comfyMain())) {
    throw new Error('ComfyUI extraction did not produce the expected layout')
  }
  writeFileSync(join(engineDir(), 'comfy-version.txt'), COMFY_PIN.tag, 'utf-8')
  writeExtraModelPaths()
  for (const id of nodesToRestore) {
    // exclusive per node id — joins instead of double-running if a pack
    // download happens to install the same node concurrently
    await installCustomNode(id, cb)
  }
  cb(progress('comfyui', 'ComfyUI portable', 'done'))
}

/**
 * Point the engine at the app-managed shared models folder. The folder keys
 * are derived from the registry's install destinations, so a new model family
 * can never end up invisible to the engine (a hardcoded list once missed
 * `checkpoints`, breaking every LTX-2.3 loader at /prompt validation).
 */
export function writeExtraModelPaths(): void {
  const root = modelsDir().replace(/\\/g, '/')
  const folders = [...new Set(allModelFiles().map((f) => f.dest.split('/')[0]))].sort()
  const yaml = `# generated by Movie Creator Studio — do not edit
mcs:
  base_path: ${root}
  is_default: true
${folders.map((d) => `  ${d}: ${d}`).join('\n')}
`
  writeFileSync(extraModelPathsFile(), yaml, 'utf-8')
}

export function extraModelPathsFile(): string {
  return join(engineDir(), 'extra_model_paths.yaml')
}

// ---------------------------------------------------------------------------
// ffmpeg (BtbN win64 gpl build, downloaded at setup to keep the installer lean)
// ---------------------------------------------------------------------------

export function installFfmpeg(cb: ProgressCb): Promise<void> {
  return exclusive('ffmpeg', () => doInstallFfmpeg(cb))
}

async function doInstallFfmpeg(cb: ProgressCb): Promise<void> {
  // prefer a stable release-branch build over master
  let asset =
    (await githubReleaseAsset('BtbN/FFmpeg-Builds', 'latest', /^ffmpeg-n[\d.]+-latest-win64-gpl-[\d.]+\.zip$/)) ??
    (await githubReleaseAsset('BtbN/FFmpeg-Builds', 'latest', /^ffmpeg-master-latest-win64-gpl\.zip$/))
  if (!asset) throw new Error('ffmpeg build asset not found (BtbN/FFmpeg-Builds latest)')
  const archive = join(tempDir(), asset.name)
  await downloadWithRetry(
    {
      id: 'ffmpeg',
      label: 'ffmpeg (BtbN win64-gpl)',
      url: asset.url,
      dest: archive,
      expectedBytes: asset.size,
      expectedSha256: asset.sha256 ?? undefined
    },
    cb
  )
  cb(progress('ffmpeg', 'ffmpeg', 'extracting'))
  const tmpOut = join(tempDir(), 'ffmpeg-extract')
  rmSync(tmpOut, { recursive: true, force: true })
  await extract7z(archive, tmpOut)
  // locate bin/ffmpeg.exe inside the extracted folder
  const rootEntry = readdirSync(tmpOut).find((e) => e.toLowerCase().startsWith('ffmpeg'))
  if (!rootEntry) throw new Error('unexpected ffmpeg archive layout')
  const bin = join(tmpOut, rootEntry, 'bin')
  mkdirSync(ffmpegDir(), { recursive: true })
  for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) {
    copyFileSync(join(bin, exe), join(ffmpegDir(), exe))
  }
  writeFileSync(join(ffmpegDir(), 'SOURCE.txt'), `BtbN/FFmpeg-Builds ${asset.name} (GPLv3 build, run as a separate process)\nhttps://github.com/BtbN/FFmpeg-Builds\n`, 'utf-8')
  rmSync(tmpOut, { recursive: true, force: true })
  rmSync(archive, { force: true })
  cb(progress('ffmpeg', 'ffmpeg', 'done'))
}

// ---------------------------------------------------------------------------
// Custom nodes (no git dependency: GitHub codeload zip of the pinned ref)
// ---------------------------------------------------------------------------

export function installCustomNode(id: string, cb: ProgressCb): Promise<void> {
  return exclusive(`customnode:${id}`, () => doInstallCustomNode(id, cb))
}

async function doInstallCustomNode(id: string, cb: ProgressCb): Promise<void> {
  const spec = CUSTOM_NODES.find((n) => n.id === id)
  if (!spec) throw new Error(`unknown custom node pack: ${id}`)
  if (!existsSync(comfyPython())) throw new Error('ComfyUI must be installed first')
  const target = join(customNodesDir(), spec.id)

  // idempotent: an existing install skips clone/pip and only tops up assets,
  // so calling this again is cheap and self-heals older installs
  if (!existsSync(target)) {
    const m = /github\.com\/([^/]+\/[^/]+)/.exec(spec.gitUrl)
    if (!m) throw new Error(`unsupported git url: ${spec.gitUrl}`)
    const zipUrl = `https://codeload.github.com/${m[1]}/zip/${spec.commit}`
    const archive = join(tempDir(), `${spec.id}.zip`)
    rmSync(archive, { force: true })
    await downloadWithRetry({ id: `customnode:${id}`, label: spec.name, url: zipUrl, dest: archive }, cb)

    cb(progress(`customnode:${id}`, spec.name, 'extracting'))
    const tmpOut = join(tempDir(), `${spec.id}-extract`)
    rmSync(tmpOut, { recursive: true, force: true })
    await extract7z(archive, tmpOut)
    const rootEntry = readdirSync(tmpOut)[0]
    if (!rootEntry) throw new Error('unexpected custom node archive layout')
    const staged = join(tmpOut, rootEntry)

    // pip + the compat patch run against the STAGING copy, and the folder is
    // moved into custom_nodes only once both succeed. Installing first and
    // running pip afterwards left a half-installed node behind on any pip
    // failure: getSetupStatus reports a node as installed purely from folder
    // existence, and the retry path below skips everything when it exists —
    // the pack showed a green check forever while every generation failed
    // with ModuleNotFoundError, unrecoverable from the UI.
    if (spec.hasRequirements && existsSync(join(staged, 'requirements.txt'))) {
      // -s keeps the embedded python from picking up user site-packages
      await execFileP(
        comfyPython(),
        [
          '-s',
          '-m',
          'pip',
          'install',
          '--no-input',
          '--disable-pip-version-check',
          '-r',
          join(staged, 'requirements.txt')
        ],
        { timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 }
      )
    }
    applyCustomNodeCompat(id, staged)

    rmSync(target, { recursive: true, force: true })
    renameSync(staged, target)
    rmSync(tmpOut, { recursive: true, force: true })
    rmSync(archive, { force: true })
  }

  await ensureCustomNodeAssets(id, spec.name, target, cb)
  cb(progress(`customnode:${id}`, spec.name, 'done'))
}

/**
 * Pre-place model files the node would otherwise download at first RUN —
 * that in-engine downloader is unreliable (httpx "client has been closed"),
 * and a generation job is the worst moment to discover it.
 */
async function ensureCustomNodeAssets(
  id: string,
  name: string,
  target: string,
  cb: ProgressCb
): Promise<void> {
  const assets = CUSTOM_NODE_ASSETS[id] ?? []
  const mirror = getSettings().hfMirror
  for (const a of assets) {
    const dest = join(target, ...a.dest.split('/'))
    if (existsSync(dest)) continue
    const info = await hfPathInfo(a.repo, a.path, mirror)
    await downloadWithRetry(
      {
        id: `customnode:${id}`,
        label: `${name} — ${a.path}`,
        url: hfResolveUrl(a.repo, a.path, mirror),
        dest,
        expectedBytes: info?.size ?? a.bytes,
        expectedSha256: info?.sha256 ?? undefined
      },
      cb
    )
  }
}

/**
 * Compatibility shims for aging custom nodes against the pinned (newer) ComfyUI.
 * Idempotent text patches applied right after install.
 */
function applyCustomNodeCompat(id: string, target: string): void {
  if (id === 'cogvideox_wrapper') {
    // CogVideoXLatentFormat is a plain class missing latent_rgb_factors_reshape,
    // which newer ComfyUI latent_preview.py accesses unconditionally → crash at
    // sampling. Add the attribute (None is fully supported by the previewer).
    const file = join(target, 'pipeline_cogvideox.py')
    if (!existsSync(file)) return
    const src = readFileSync(file, 'utf-8')
    if (src.includes('latent_rgb_factors_reshape')) return
    const anchor = 'class CogVideoXLatentFormat():\n    latent_channels = 16\n    latent_dimensions = 3\n    scale_factor = 0.7\n    taesd_decoder_name = None'
    if (src.includes(anchor)) {
      writeFileSync(
        file,
        src.replace(anchor, anchor + '\n    latent_rgb_factors_reshape = None  # MCS compat: newer ComfyUI latent_preview requires this attr'),
        'utf-8'
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Model files
// ---------------------------------------------------------------------------

export function downloadModelFile(fileId: string, cb: ProgressCb): Promise<void> {
  return exclusive(`model:${fileId}`, () => doDownloadModelFile(fileId, cb))
}

async function doDownloadModelFile(fileId: string, cb: ProgressCb): Promise<void> {
  const spec = allModelFiles().find((f) => f.id === fileId)
  if (!spec) throw new Error(`unknown model file: ${fileId}`)
  const mirror = getSettings().hfMirror
  const dest = join(modelsDir(), spec.dest)
  if (existsSync(dest)) {
    cb(progress(fileId, spec.dest, 'done'))
    return
  }
  const info = await hfPathInfo(spec.repo, spec.path, mirror)
  await downloadFile(
    {
      id: fileId,
      label: spec.dest.split('/').pop() ?? spec.dest,
      url: hfResolveUrl(spec.repo, spec.path, mirror),
      dest,
      expectedBytes: info?.size ?? spec.bytes,
      expectedSha256: info?.sha256 ?? undefined
    },
    cb
  )
}

function progress(
  id: string,
  label: string,
  status: DownloadProgress['status']
): DownloadProgress {
  return { id, label, receivedBytes: 0, totalBytes: 0, bytesPerSec: 0, status }
}
