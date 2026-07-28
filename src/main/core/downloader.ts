import {
  createWriteStream,
  existsSync,
  statSync,
  mkdirSync,
  renameSync,
  rmSync,
  readFileSync,
  writeFileSync
} from 'fs'
import { open, type FileHandle } from 'fs/promises'
import { dirname } from 'path'
import { createHash } from 'crypto'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { DownloadProgress } from '@shared/types'

export type ProgressCb = (p: DownloadProgress) => void

/** thrown when the user cancels — callers can treat it as "stop quietly" */
export class DownloadCancelledError extends Error {
  constructor(label: string) {
    super(`キャンセルされました: ${label}`)
    this.name = 'DownloadCancelledError'
  }
}

const activeControllers = new Map<string, AbortController>()

export function cancelDownload(id: string): void {
  activeControllers.get(id)?.abort()
}

export function isDownloadActive(id: string): boolean {
  return activeControllers.has(id)
}

export interface DownloadTask {
  id: string
  label: string
  url: string
  dest: string
  expectedBytes?: number
  expectedSha256?: string
}

const MAX_ATTEMPTS = 8
/** exponential backoff, capped so a bad minute doesn't stall recovery */
const backoffMs = (attempt: number): number => Math.min(15000, 1500 * 2 ** (attempt - 1))
/** files below this size use a plain single stream */
const SEGMENT_MIN_BYTES = 128 * 1024 * 1024
/** target segment count per file (fewer for smaller files) */
const SEGMENT_COUNT = 4
const MIN_SEGMENT_BYTES = 64 * 1024 * 1024

// ---------------------------------------------------------------------------
// segment planning + sidecar state (resume support)
// ---------------------------------------------------------------------------

export interface Segment {
  start: number
  /** exclusive */
  end: number
  /** bytes already downloaded from start */
  got: number
}

export interface SegmentState {
  size: number
  segments: Segment[]
}

/** Split [0,size) into up to `count` contiguous segments of >= MIN_SEGMENT_BYTES. */
export function planSegments(size: number, count = SEGMENT_COUNT): Segment[] {
  const n = Math.max(1, Math.min(count, Math.floor(size / MIN_SEGMENT_BYTES) || 1))
  const base = Math.floor(size / n)
  const segments: Segment[] = []
  let start = 0
  for (let i = 0; i < n; i++) {
    const end = i === n - 1 ? size : start + base
    segments.push({ start, end, got: 0 })
    start = end
  }
  return segments
}

/**
 * Byte counts must be integers: the registry stores estimates as float
 * expressions (`6.74 * GB` = 7237019893.76) and `FileHandle.truncate()`
 * rejects a fractional length with ERR_OUT_OF_RANGE — after `open(part,'w')`
 * has already emptied the file. (exported for tests)
 */
export function normalizeByteSize(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Read the sidecar, falling back to the `.tmp` written by an interrupted
 * saveState. (exported for tests)
 */
export function readSidecar(metaPath: string): SegmentState | null {
  for (const p of [metaPath, metaPath + '.tmp']) {
    try {
      const st = JSON.parse(readFileSync(p, 'utf-8')) as SegmentState
      if (Number.isFinite(st.size) && st.size > 0 && Array.isArray(st.segments)) return st
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

function loadState(metaPath: string, size: number): SegmentState | null {
  const st = readSidecar(metaPath)
  if (!st || st.size !== size) return null
  for (const s of st.segments) {
    if (!Number.isFinite(s.got) || s.got < 0 || s.got > s.end - s.start) return null
  }
  return st
}

/**
 * Persist the sidecar ATOMICALLY. This runs about once a second for hours on
 * a multi-GB file; a power loss during a plain write left unparseable JSON,
 * and the next run then discarded the whole partial and restarted from zero.
 * (exported for tests)
 */
export function saveState(metaPath: string, st: SegmentState): void {
  const tmp = metaPath + '.tmp'
  writeFileSync(tmp, JSON.stringify(st))
  renameSync(tmp, metaPath)
}

/** remove the sidecar and any interrupted-write leftover */
function rmSidecar(metaPath: string): void {
  rmSync(metaPath, { force: true })
  rmSync(metaPath + '.tmp', { force: true })
}

/** the size an existing sidecar was planned against (shape-checked, no size validation) */
function sidecarSize(metaPath: string): number | null {
  return readSidecar(metaPath)?.size ?? null
}

class NoRangeSupportError extends Error {}

/**
 * Ask the server for the AUTHORITATIVE content length. `task.expectedBytes`
 * may be a rough registry estimate (used as a fallback when the size API was
 * unreachable at download time); planning or preallocating a segmented
 * download against a wrong size corrupts the file — the final segment over-
 * or under-shoots the real EOF and can never complete. A 1-byte range probe
 * returns `Content-Range: bytes 0-0/<total>`, which is exact even through the
 * HuggingFace LFS CDN redirect.
 */
async function resolveRemoteSize(url: string, controller: AbortController): Promise<number | null> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      redirect: 'follow',
      // own timeout: on a congested line this probe can hang long before the
      // download even starts (the caller has a sidecar/estimate fallback)
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
    })
    res.body?.cancel().catch(() => undefined)
    const cr = res.headers.get('content-range')
    const m = cr ? /\/\s*(\d+)\s*$/.exec(cr) : null
    if (m) return Number(m[1])
    // a CDN that ignores the range answers 200 with the full length
    if (res.status === 200) {
      const len = Number(res.headers.get('content-length') ?? 0)
      if (len > 0) return len
    }
  } catch {
    // network hiccup — caller falls back to the estimate
  }
  return null
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * Download with resume + SHA256 verification.
 * Large files with a known size are fetched with several parallel range
 * segments (sidecar .part.json tracks per-segment progress for resume);
 * small/unknown-size files use a single resumable stream.
 * On SHA256 mismatch the partial data is discarded and the file is
 * re-downloaded once from scratch before failing.
 */
export async function downloadFile(task: DownloadTask, cb: ProgressCb): Promise<void> {
  const { id, label, dest } = task
  const part = dest + '.part'
  const meta = part + '.json'
  mkdirSync(dirname(dest), { recursive: true })

  if (existsSync(dest)) {
    const size = statSync(dest).size
    cb({ id, label, receivedBytes: size, totalBytes: size, bytesPerSec: 0, status: 'done' })
    return
  }

  const controller = new AbortController()
  activeControllers.set(id, controller)
  try {
    let shaRetried = false
    for (;;) {
      // legacy single-stream .part (no sidecar) keeps resuming as a single stream
      const legacyPart = existsSync(part) && !existsSync(meta)
      const segmented =
        !legacyPart && !!task.expectedBytes && task.expectedBytes >= SEGMENT_MIN_BYTES

      // the full size as reported by the SERVER (0 when it never told us)
      let authoritativeSize = 0
      try {
        if (segmented) {
          authoritativeSize = await segmentedDownload(task, part, meta, cb, controller)
        } else {
          authoritativeSize = await singleStreamWithRetry(task, part, cb, controller)
        }
      } catch (err) {
        if (err instanceof NoRangeSupportError) {
          // server can't do ranges: restart as a single stream
          rmSync(part, { force: true })
          rmSidecar(meta)
          authoritativeSize = await singleStreamWithRetry(task, part, cb, controller)
        } else {
          throw err
        }
      }

      // Length check for files with no hash (the size probe or paths-info API
      // is authoritative when it answered). Without it a short file — a CDN
      // truncating the stream, a proxy error page — was renamed to the final
      // path and reported 'done', and only surfaced much later as a broken
      // model load. Only enforced when the size came from the server.
      if (!task.expectedSha256 && authoritativeSize > 0) {
        const got = statSync(part).size
        if (got !== authoritativeSize) {
          rmSync(part, { force: true })
          rmSidecar(meta)
          if (!shaRetried) {
            shaRetried = true
            continue
          }
          throw new Error(
            `ダウンロードが不完全です: ${label}(${got} / ${authoritativeSize} バイト・再取得も失敗)`
          )
        }
      }

      if (task.expectedSha256) {
        const size = statSync(part).size
        cb({ id, label, receivedBytes: size, totalBytes: size, bytesPerSec: 0, status: 'verifying' })
        const actual = await sha256File(part)
        if (actual.toLowerCase() !== task.expectedSha256.toLowerCase()) {
          rmSync(part, { force: true })
          rmSidecar(meta)
          if (!shaRetried) {
            // corrupted partial data (e.g. crash/kill mid-write) — one clean retry
            shaRetried = true
            continue
          }
          throw new Error(`SHA256が一致しません: ${label}(再取得も失敗)`)
        }
      }
      rmSidecar(meta)
      renameSync(part, dest)
      const size = statSync(dest).size
      cb({ id, label, receivedBytes: size, totalBytes: size, bytesPerSec: 0, status: 'done' })
      return
    }
  } catch (err) {
    // report the REAL partial progress with the interrupt/error event — a
    // 0-byte reset here makes the UI bar (and the pack %) jump backwards
    const { got, total } = partialProgress(part, meta, task.expectedBytes ?? 0)
    if (controller.signal.aborted) {
      cb({ id, label, receivedBytes: got, totalBytes: total, bytesPerSec: 0, status: 'cancelled' })
      throw new DownloadCancelledError(label)
    }
    cb({
      id,
      label,
      receivedBytes: got,
      totalBytes: total,
      bytesPerSec: 0,
      status: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  } finally {
    activeControllers.delete(id)
  }
}

/**
 * Best-effort progress of an interrupted download, for status events only.
 * The segmented .part is preallocated to the full size, so its on-disk size
 * says nothing — the sidecar is the truth, whatever size it was planned
 * against (loadState's size check would wrongly discard it here when the
 * authoritative size differs from the registry estimate). Only a legacy
 * single-stream .part (no sidecar) grows incrementally on disk.
 * (exported for tests)
 */
export function partialProgress(
  part: string,
  metaPath: string,
  fallbackTotal: number
): { got: number; total: number } {
  // LENIENT parse (unlike readSidecar/loadState): this is display-only, so a
  // sidecar with a mangled `size` should still salvage its intact segments.
  // The `.tmp` fallback covers a saveState interrupted between write & rename.
  const readLoose = (p: string): SegmentState | null => {
    try {
      const st = JSON.parse(readFileSync(p, 'utf-8')) as SegmentState
      return Array.isArray(st.segments) ? st : null
    } catch {
      return null
    }
  }
  try {
    const st = readLoose(metaPath) ?? readLoose(metaPath + '.tmp')
    if (st) {
      // clamp AND type-check each entry: a parseable-but-mangled sidecar
      // must degrade to 0, never to NaN in the progress bar
      const got = st.segments.reduce((a, s) => {
        const g = Math.min(Number(s?.got), Number(s?.end) - Number(s?.start))
        return a + (Number.isFinite(g) ? Math.max(0, g) : 0)
      }, 0)
      return { got, total: Number.isFinite(st.size) && st.size > 0 ? st.size : fallbackTotal }
    }
    // a sidecar file that EXISTS but is unreadable marks a segmented .part —
    // report zero rather than its preallocated full size
    if (existsSync(metaPath) || existsSync(metaPath + '.tmp')) {
      return { got: 0, total: fallbackTotal }
    }
    // true legacy single-stream .part (no sidecar): grows incrementally
    if (existsSync(part)) {
      return { got: statSync(part).size, total: fallbackTotal }
    }
  } catch {
    /* stat/fs error — report zero */
  }
  return { got: 0, total: fallbackTotal }
}

// ---------------------------------------------------------------------------
// segmented download (N parallel range requests, positioned writes)
// ---------------------------------------------------------------------------

async function segmentedDownload(
  task: DownloadTask,
  part: string,
  metaPath: string,
  cb: ProgressCb,
  controller: AbortController
): Promise<number> {
  // the server is authoritative for the size; the estimate is only a hint.
  // normalizeByteSize: registry estimates are floats and truncate() needs an int
  const remote = await resolveRemoteSize(task.url, controller)
  let size = normalizeByteSize(remote && remote > 0 ? remote : task.expectedBytes)
  if (!remote) {
    // the probe can fail on a congested line. If a sidecar from an earlier
    // attempt exists and matches the preallocated file, trust ITS size over
    // the rough registry estimate — otherwise the size flip would invalidate
    // the plan below and visibly reset the whole download to 0
    const prior = sidecarSize(metaPath)
    if (prior && existsSync(part) && statSync(part).size === prior) size = prior
  }
  let state = loadState(metaPath, size)
  if (!state || !existsSync(part) || statSync(part).size !== size) {
    // a stale sidecar planned against a different (e.g. estimated) size is
    // discarded here — truncating to the correct size keeps the valid leading
    // bytes and re-plans, so a wrong-size partial self-heals on the next run
    state = { size, segments: planSegments(size) }
    const fh = await open(part, 'w')
    try {
      await fh.truncate(size)
    } finally {
      await fh.close()
    }
    saveState(metaPath, state)
  }

  // shared progress/persist throttles across segments
  let lastEmit = 0
  let lastBytes = state.segments.reduce((a, s) => a + s.got, 0)
  let lastTime = Date.now()
  let lastPersist = 0
  const onChunk = (): void => {
    const now = Date.now()
    if (now - lastPersist > 1000) {
      lastPersist = now
      saveState(metaPath, state!)
    }
    if (now - lastEmit > 400) {
      const received = state!.segments.reduce((a, s) => a + s.got, 0)
      const bps = ((received - lastBytes) / Math.max(1, now - lastTime)) * 1000
      cb({
        id: task.id,
        label: task.label,
        receivedBytes: received,
        totalBytes: size,
        bytesPerSec: Math.round(bps),
        status: 'downloading'
      })
      lastEmit = now
      lastBytes = received
      lastTime = now
    }
  }

  // A failing segment must not leave its siblings streaming: the error path in
  // downloadFile deletes and recreates this very .part, and an orphaned write
  // at an old offset would corrupt the replacement (silently, when the file has
  // no SHA256 to verify against). Chain a segment-local controller and wait for
  // EVERY segment to settle before returning.
  const segCtl = new AbortController()
  const relayAbort = (): void => segCtl.abort()
  if (controller.signal.aborted) segCtl.abort()
  else controller.signal.addEventListener('abort', relayAbort, { once: true })
  try {
    const results = await Promise.allSettled(
      state.segments.map((seg) =>
        runSegment(task, part, seg, onChunk, segCtl).catch((err) => {
          // first PERMANENT failure cancels the siblings right away — they
          // used to keep streaming their full ranges (minutes, gigabytes)
          // after the download was already doomed, delaying the error and
          // the NoRangeSupport fallback by that much
          segCtl.abort()
          throw err
        })
      )
    )
    const reasons = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
    if (reasons.length > 0) {
      // prefer the ORIGINAL failure over the AbortErrors it caused in siblings
      const real =
        reasons.find((e) => !(e instanceof Error && e.name === 'AbortError')) ?? reasons[0]
      throw real
    }
  } finally {
    segCtl.abort()
    controller.signal.removeEventListener('abort', relayAbort)
    saveState(metaPath, state)
  }
  // only authoritative when the server actually answered the probe
  return remote && remote > 0 ? size : 0
}

async function runSegment(
  task: DownloadTask,
  part: string,
  seg: Segment,
  onChunk: () => void,
  controller: AbortController
): Promise<void> {
  // a proxy/CDN edge can ignore Range INTERMITTENTLY — giving up on the
  // segmented download (which discards the preallocated part) on the first
  // stray 200 can throw away gigabytes. Only fall back after 3 strikes; a
  // genuinely range-less server just costs two cancelled requests more.
  let noRange = 0
  let stalled = 0
  // consecutive failures WITHOUT progress — a multi-GB segment on a flaky
  // line drops the connection many times while still advancing; counting
  // raw attempts killed such downloads at MAX_ATTEMPTS despite steady
  // progress (each resume continues from seg.got, so progress ⇒ it finishes)
  let fails = 0
  while (seg.got < seg.end - seg.start) {
    const before = seg.got
    try {
      await streamSegment(task, part, seg, onChunk, controller)
    } catch (err) {
      if (controller.signal.aborted) throw err
      if (seg.got > before) fails = 0
      if (++fails >= MAX_ATTEMPTS) throw err
      if (err instanceof NoRangeSupportError && ++noRange >= 3) throw err
      await new Promise((r) => setTimeout(r, backoffMs(fails)))
      continue
    }
    if (seg.got === before) {
      // Resolved WITHOUT delivering bytes (e.g. a proxy answering the range
      // request with 206 + an empty body). Nothing threw, so the retry cap in
      // the catch never applied and the loop re-fetched immediately, forever.
      if (++stalled >= MAX_ATTEMPTS) {
        throw new Error(`サーバーがデータを返しません (range ${seg.start}-${seg.end})`)
      }
      await new Promise((r) => setTimeout(r, backoffMs(stalled)))
    } else {
      stalled = 0
    }
  }
}

async function streamSegment(
  task: DownloadTask,
  part: string,
  seg: Segment,
  onChunk: () => void,
  controller: AbortController
): Promise<void> {
  const from = seg.start + seg.got
  const to = seg.end - 1
  if (from > to) return
  const res = await fetch(task.url, {
    headers: { Range: `bytes=${from}-${to}` },
    redirect: 'follow',
    signal: controller.signal
  })
  if (res.status === 200) {
    res.body?.cancel().catch(() => undefined)
    throw new NoRangeSupportError()
  }
  if (res.status !== 206) throw new Error(`HTTP ${res.status} for range ${from}-${to}`)
  if (!res.body) throw new Error('empty response body')

  // each segment gets its own handle: positioned writes never interfere
  const fh: FileHandle = await open(part, 'r+')
  try {
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      const max = seg.end - (seg.start + seg.got)
      const buf = value.length > max ? value.subarray(0, max) : value
      await fh.write(buf, 0, buf.length, seg.start + seg.got)
      seg.got += buf.length
      onChunk()
      if (seg.got >= seg.end - seg.start) {
        await reader.cancel().catch(() => undefined)
        break
      }
    }
  } finally {
    await fh.close()
  }
}

// ---------------------------------------------------------------------------
// single stream (small files / unknown size / legacy .part resume)
// ---------------------------------------------------------------------------

async function singleStreamWithRetry(
  task: DownloadTask,
  part: string,
  cb: ProgressCb,
  controller: AbortController
): Promise<number> {
  // cap counts consecutive failures WITHOUT progress: each attempt resumes
  // from the .part size, so as long as bytes keep landing the download will
  // finish — counting raw attempts failed long flaky transfers near the end
  let fails = 0
  for (;;) {
    const before = existsSync(part) ? statSync(part).size : 0
    try {
      return await attemptSingleStream(task, part, cb, controller)
    } catch (err) {
      if (controller.signal.aborted) throw err
      if ((existsSync(part) ? statSync(part).size : 0) > before) fails = 0
      if (++fails >= MAX_ATTEMPTS) throw err
      cb({
        id: task.id,
        label: task.label,
        receivedBytes: existsSync(part) ? statSync(part).size : 0,
        totalBytes: task.expectedBytes ?? 0,
        bytesPerSec: 0,
        status: 'downloading',
        error: `再試行中 (${fails}/${MAX_ATTEMPTS - 1})…`
      })
      await new Promise((r) => setTimeout(r, backoffMs(fails)))
    }
  }
}

async function attemptSingleStream(
  task: DownloadTask,
  part: string,
  cb: ProgressCb,
  controller: AbortController
): Promise<number> {
  const offset = existsSync(part) ? statSync(part).size : 0
  const headers: Record<string, string> = {}
  if (offset > 0) headers['Range'] = `bytes=${offset}-`

  const res = await fetch(task.url, { headers, redirect: 'follow', signal: controller.signal })
  if (res.status === 416) {
    res.body?.cancel().catch(() => undefined)
    return 0 // .part already complete; no fresh size from the server
  }
  if (res.status !== 200 && res.status !== 206) {
    throw new Error(`HTTP ${res.status} for ${task.url}`)
  }
  if (!res.body) throw new Error('empty response body')

  // a proxy/CDN edge can IGNORE the Range header and answer 200 with the
  // full body. The old code wiped the partial here and restarted from 0 —
  // on an unstable line that looped into the bar visibly growing and
  // shrinking (LTX-2.3 の実機報告). Keep the partial instead and skip the
  // bytes we already have from the stream.
  let skip = res.status === 200 ? offset : 0

  const contentLen = Number(res.headers.get('content-length') ?? 0)
  const total =
    res.status === 206 ? offset + contentLen : contentLen > 0 ? contentLen : (task.expectedBytes ?? 0)

  let received = offset
  let lastEmit = 0
  let lastBytes = received
  let lastTime = Date.now()

  // counts + progress only for bytes actually APPENDED (post-skip)
  const skipAndCount = new Transform({
    transform(chunk: Buffer, _enc, done): void {
      let out = chunk
      if (skip > 0) {
        if (chunk.length <= skip) {
          skip -= chunk.length
          done()
          return
        }
        out = chunk.subarray(skip)
        skip = 0
      }
      received += out.length
      const now = Date.now()
      if (now - lastEmit > 400) {
        const bps = ((received - lastBytes) / Math.max(1, now - lastTime)) * 1000
        cb({
          id: task.id,
          label: task.label,
          receivedBytes: received,
          totalBytes: total,
          bytesPerSec: Math.round(bps),
          status: 'downloading'
        })
        lastEmit = now
        lastBytes = received
        lastTime = now
      }
      done(null, out)
    }
  })

  const ws = createWriteStream(part, { flags: offset > 0 ? 'a' : 'w' })
  const body = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  controller.signal.addEventListener('abort', () => body.destroy(new Error('aborted')))
  await pipeline(body, skipAndCount, ws)
  // authoritative only when the server sent a content-length
  return contentLen > 0 ? total : 0
}

/**
 * downloadFile with whole-file retry passes (progress resumes via the
 * .part/sidecar). Component installs (ComfyUI / ffmpeg / LLM / custom nodes)
 * run as a single operation WITHOUT the pack-level retry loop model files
 * get — on a congested line one exhausted attempt failed the whole install
 * (実機: ffmpeg「fetch failed」). Between passes the UI is softened to a
 * "reconnecting" state carrying the real partial progress.
 */
export async function downloadWithRetry(
  task: DownloadTask,
  cb: ProgressCb,
  attempts = 3
): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await downloadFile(task, cb)
      return
    } catch (e) {
      if (e instanceof DownloadCancelledError || i >= attempts) throw e
      const { got, total } = partialProgress(
        task.dest + '.part',
        task.dest + '.part.json',
        task.expectedBytes ?? 0
      )
      cb({
        id: task.id,
        label: task.label,
        receivedBytes: got,
        totalBytes: total,
        bytesPerSec: 0,
        status: 'downloading',
        error: `再接続中… (自動再試行 ${i + 1}/${attempts})`
      })
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

// ---------------------------------------------------------------------------

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const fh = await open(path, 'r')
  try {
    const stream = fh.createReadStream()
    for await (const chunk of stream) hash.update(chunk as Buffer)
  } finally {
    await fh.close()
  }
  return hash.digest('hex')
}

// ---------------------------------------------------------------------------
// HuggingFace helpers
// ---------------------------------------------------------------------------

export function hfResolveUrl(repo: string, path: string, mirror: string | null): string {
  const origin = mirror?.replace(/\/$/, '') || 'https://huggingface.co'
  return `${origin}/${repo}/resolve/main/${path}`
}

export interface HfPathInfo {
  size: number
  sha256: string | null
}

/** Fetch size + LFS sha256 (oid) for a repo file via the paths-info API. */
export async function hfPathInfo(
  repo: string,
  path: string,
  mirror: string | null
): Promise<HfPathInfo | null> {
  // The OFFICIAL host is asked FIRST for the hash. A mirror serves the bytes
  // (hfResolveUrl), so letting it also supply the SHA256 those bytes are
  // checked against makes the verification circular — a wrong or tampered
  // mirror would validate its own content. The mirror stays as a fallback so
  // that users who set one because huggingface.co is unreachable still get a
  // size (and, at worst, the same trust level as no verification at all).
  const origins = mirror
    ? ['https://huggingface.co', mirror.replace(/\/$/, '')]
    : ['https://huggingface.co']
  // retry across origins AND attempts: a transient failure here otherwise
  // drops us to the rough registry estimate and loses SHA256 verification
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const origin of origins) {
      try {
        const res = await fetch(`${origin}/api/models/${repo}/paths-info/main`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paths: [path] }),
          signal: AbortSignal.timeout(15000)
        })
        if (!res.ok) continue
        const arr = (await res.json()) as Array<{
          path: string
          size?: number
          lfs?: { oid?: string; size?: number }
        }>
        const entry = arr.find((e) => e.path === path)
        if (!entry) continue
        return {
          size: entry.lfs?.size ?? entry.size ?? 0,
          sha256: entry.lfs?.oid ?? null
        }
      } catch {
        // try next origin / attempt
      }
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
  }
  return null
}

// ---------------------------------------------------------------------------
// GitHub release asset lookup (for ComfyUI portable / ffmpeg builds)
// ---------------------------------------------------------------------------

export interface GhAsset {
  name: string
  url: string
  size: number
  sha256: string | null
}

export async function githubReleaseAsset(
  ownerRepo: string,
  tag: string,
  match: RegExp
): Promise<GhAsset | null> {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'movie-creator-studio' }
  // retry with backoff + timeout: this single API call has no segment-level
  // resilience, so under parallel-download bandwidth pressure a bare fetch
  // hits ECONNRESET and fails the whole component install (comfyui/ffmpeg/llm)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // some repos (BtbN/FFmpeg-Builds) have a literal tag named "latest";
      // others (ggml-org/llama.cpp) need /releases/latest — try tag first
      let res = await fetch(`https://api.github.com/repos/${ownerRepo}/releases/tags/${tag}`, {
        headers,
        signal: AbortSignal.timeout(20000)
      })
      if (!res.ok && tag === 'latest') {
        res = await fetch(`https://api.github.com/repos/${ownerRepo}/releases/latest`, {
          headers,
          signal: AbortSignal.timeout(20000)
        })
      }
      if (!res.ok) {
        // retry only transient statuses (5xx, 403 rate-limit) — a real 404
        // means the release/tag doesn't exist and retrying can't fix that
        if (res.status >= 500 || res.status === 403) throw new Error(`GitHub HTTP ${res.status}`)
        return null
      }
      const rel = (await res.json()) as {
        assets: Array<{ name: string; browser_download_url: string; size: number; digest?: string | null }>
      }
      for (const a of rel.assets ?? []) {
        if (match.test(a.name)) {
          const sha = a.digest?.startsWith('sha256:') ? a.digest.slice(7) : null
          return { name: a.name, url: a.browser_download_url, size: a.size, sha256: sha }
        }
      }
      return null // reached the release, asset just not present
    } catch (e) {
      if (attempt === 3) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(
          `GitHub への接続に失敗しました(${msg})。ネットワーク状態を確認して、時間をおいて再試行してください`
        )
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  return null
}
