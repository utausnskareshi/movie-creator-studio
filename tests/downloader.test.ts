import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  downloadFile,
  normalizeByteSize,
  partialProgress,
  planSegments,
  readSidecar,
  saveState
} from '../src/main/core/downloader'
import { MODEL_PACKS } from '../src/main/models/registry'

describe('planSegments', () => {
  // the bug: when the planned size overshoots the real file, the last segment
  // can never reach its end. these assert that for the AUTHORITATIVE size the
  // segments tile [0,size) exactly and the last ends precisely at EOF.
  const sizes = [
    10_003_303_280, // real wan2.2_fun_control_5B size (was mis-estimated as 10 GiB)
    6_734_915_968,
    1_313_884_408,
    200 * 1024 * 1024,
    129 * 1024 * 1024
  ]

  for (const size of sizes) {
    it(`tiles [0,${size}) contiguously ending exactly at EOF`, () => {
      const segs = planSegments(size)
      expect(segs[0].start).toBe(0)
      expect(segs[segs.length - 1].end).toBe(size)
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i].start).toBe(segs[i - 1].end) // no gaps, no overlaps
      }
      expect(segs.reduce((a, s) => a + (s.end - s.start), 0)).toBe(size)
      expect(segs.every((s) => s.got === 0)).toBe(true)
    })
  }

  it('never splits below the 64MB minimum segment size', () => {
    expect(planSegments(100 * 1024 * 1024).length).toBe(1) // 100MB -> single segment
    expect(planSegments(200 * 1024 * 1024).length).toBe(3) // 200MB -> 3 x ~64MB
    expect(planSegments(10_003_303_280).length).toBe(4) // large -> capped at 4
  })
})

describe('partialProgress', () => {
  // the bug: the segmented .part is PREALLOCATED to full size, and the
  // cancel/error paths validated the sidecar against the registry ESTIMATE —
  // when the authoritative size differed, the sidecar was discarded and the
  // preallocated file size (= 100%) was reported as received.
  const dirs: string[] = []
  const dir = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'mcs-pp-'))
    dirs.push(d)
    return d
  }
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('trusts the sidecar even when planned against a different size than the estimate', () => {
    const d = dir()
    const part = join(d, 'f.part')
    const meta = part + '.json'
    const size = 10_003_303_280 // authoritative
    writeFileSync(part, 'x') // stand-in for the preallocated file
    writeFileSync(
      meta,
      JSON.stringify({
        size,
        segments: [
          { start: 0, end: 5_000_000_000, got: 5_000_000_000 },
          { start: 5_000_000_000, end: size, got: 123 }
        ]
      })
    )
    // fallbackTotal = the (wrong) 10GiB registry estimate
    const p = partialProgress(part, meta, 10 * 1024 ** 3)
    expect(p.got).toBe(5_000_000_123)
    expect(p.total).toBe(size) // sidecar size wins over the estimate
  })

  it('clamps corrupt got values to the segment length', () => {
    const d = dir()
    const part = join(d, 'f.part')
    const meta = part + '.json'
    writeFileSync(meta, JSON.stringify({ size: 100, segments: [{ start: 0, end: 100, got: 999 }] }))
    expect(partialProgress(part, meta, 0).got).toBe(100)
  })

  it('uses the on-disk size only for a legacy single-stream part (no sidecar)', () => {
    const d = dir()
    const part = join(d, 'f.part')
    writeFileSync(part, Buffer.alloc(1234))
    const p = partialProgress(part, part + '.json', 5678)
    expect(p).toEqual({ got: 1234, total: 5678 })
  })

  it('degrades a type-mangled but parseable sidecar to zero contribution, never NaN', () => {
    const d = dir()
    const part = join(d, 'f.part')
    const meta = part + '.json'
    writeFileSync(
      meta,
      JSON.stringify({
        size: 'big',
        segments: [
          { start: 0, end: 'x', got: 7 },
          { start: 0, end: 100, got: 50 }
        ]
      })
    )
    const p = partialProgress(part, meta, 777)
    expect(p.got).toBe(50) // the intact segment counts; the mangled one adds 0
    expect(p.total).toBe(777) // non-numeric size falls back to the estimate
  })

  it('reads progress from the .tmp sidecar when the primary is missing (interrupted save)', () => {
    // without the fallback this fell into the legacy branch and reported the
    // PREALLOCATED on-disk size (=100%) of a segmented .part as progress
    const d = dir()
    const part = join(d, 'f.part')
    const meta = part + '.json'
    writeFileSync(part, Buffer.alloc(4096)) // preallocated stand-in
    writeFileSync(
      meta + '.tmp',
      JSON.stringify({ size: 100, segments: [{ start: 0, end: 100, got: 42 }] })
    )
    expect(partialProgress(part, meta, 0)).toEqual({ got: 42, total: 100 })
  })

  it('reports zero for a corrupt sidecar instead of the preallocated size', () => {
    const d = dir()
    const part = join(d, 'f.part')
    const meta = part + '.json'
    writeFileSync(part, Buffer.alloc(4096)) // preallocated stand-in
    writeFileSync(meta, '{not json')
    expect(partialProgress(part, meta, 999)).toEqual({ got: 0, total: 999 })
  })

  it('reports zero when nothing is on disk', () => {
    const d = dir()
    expect(partialProgress(join(d, 'no.part'), join(d, 'no.part.json'), 42)).toEqual({
      got: 0,
      total: 42
    })
  })
})

describe('normalizeByteSize', () => {
  // the bug: registry estimates are float expressions, and the segmented path
  // preallocates with FileHandle.truncate(size) — which throws
  // ERR_OUT_OF_RANGE on a fractional length AFTER open(part,'w') has already
  // emptied the file.
  it('floors the float estimates the registry actually stores', () => {
    expect(normalizeByteSize(6.74 * 1024 ** 3)).toBe(7237019893)
    expect(Number.isInteger(normalizeByteSize(28.6 * 1024 ** 3))).toBe(true)
    expect(Number.isInteger(normalizeByteSize(2.33 * 1024 ** 3))).toBe(true)
  })

  it('keeps an exact server-reported integer unchanged', () => {
    expect(normalizeByteSize(10_003_303_280)).toBe(10_003_303_280)
  })

  it('rejects unusable values instead of propagating them into truncate()', () => {
    expect(normalizeByteSize(undefined)).toBe(0)
    expect(normalizeByteSize(Number.NaN)).toBe(0)
    expect(normalizeByteSize(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizeByteSize(-1)).toBe(0)
  })

  it('every registry byte estimate normalizes to a positive integer', () => {
    const sizes = MODEL_PACKS.flatMap((p) => p.files.map((f) => f.bytes))
    expect(sizes.length).toBeGreaterThan(20)
    for (const s of sizes) {
      const n = normalizeByteSize(s)
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThan(0)
    }
  })
})

describe('retry cap counts consecutive no-progress failures (local server)', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  // the bug: the retry cap counted RAW attempts. A long transfer on a flaky
  // line that drops the connection more than MAX_ATTEMPTS(8) times was failed
  // permanently even though every resume kept making progress — a 22GB model
  // could die at 95%. Progress must reset the cap; only consecutive
  // no-progress failures may exhaust it.
  it(
    'completes a download whose connection drops 9 times while bytes keep flowing',
    async () => {
      const CHUNK = 8 * 1024
      const CONTENT = Buffer.alloc(10 * CHUNK) // 10 slices -> 9 mid-stream drops
      for (let i = 0; i < CONTENT.length; i++) CONTENT[i] = (i * 7 + 13) & 0xff

      let requests = 0
      const server = createServer((req, res) => {
        requests++
        let start = 0
        const m = /^bytes=(\d+)-/.exec(req.headers.range ?? '')
        if (m) start = Number(m[1])
        if (start >= CONTENT.length) {
          res.statusCode = 416
          res.end()
          return
        }
        res.statusCode = m ? 206 : 200
        res.setHeader('content-length', String(CONTENT.length - start))
        if (m) res.setHeader('content-range', `bytes ${start}-${CONTENT.length - 1}/${CONTENT.length}`)
        const slice = CONTENT.subarray(start, Math.min(start + CHUNK, CONTENT.length))
        if (start + CHUNK >= CONTENT.length) {
          res.end(slice)
        } else {
          // deliver one slice, then kill the connection mid-stream
          res.write(slice, () => setTimeout(() => res.destroy(), 5))
        }
      })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
      const port = (server.address() as AddressInfo).port
      const d = mkdtempSync(join(tmpdir(), 'mcs-rt-'))
      dirs.push(d)
      const dest = join(d, 'out.bin')
      try {
        await downloadFile(
          { id: 'retry-test', label: 'retry-test', url: `http://127.0.0.1:${port}/f`, dest },
          () => undefined
        )
        expect(readFileSync(dest).equals(CONTENT)).toBe(true)
        // more connections than the cap — the old attempt-counting code
        // failed this download on the 8th drop
        expect(requests).toBeGreaterThan(8)
      } finally {
        await new Promise((r) => server.close(r))
      }
    },
    60_000
  )
})

describe('sidecar persistence (atomic)', () => {
  const dirs: string[] = []
  const dir = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'mcs-sc-'))
    dirs.push(d)
    return d
  }
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  const state = { size: 1000, segments: [{ start: 0, end: 1000, got: 250 }] }

  it('writes via a temp file and leaves no leftover', () => {
    const meta = join(dir(), 'f.part.json')
    saveState(meta, state)
    expect(existsSync(meta)).toBe(true)
    expect(existsSync(meta + '.tmp')).toBe(false)
    expect(JSON.parse(readFileSync(meta, 'utf-8'))).toEqual(state)
    expect(readSidecar(meta)).toEqual(state)
  })

  it('replaces an existing sidecar atomically across repeated saves', () => {
    const meta = join(dir(), 'f.part.json')
    saveState(meta, state)
    saveState(meta, { size: 1000, segments: [{ start: 0, end: 1000, got: 900 }] })
    expect(readSidecar(meta)?.segments[0].got).toBe(900)
    expect(existsSync(meta + '.tmp')).toBe(false)
  })

  it('recovers from the .tmp when the primary was left unparseable (kill mid-write)', () => {
    // the historical failure mode: a plain write interrupted by power loss
    // left truncated JSON, loadState returned null, and a multi-GB partial
    // was wiped and restarted from zero
    const meta = join(dir(), 'f.part.json')
    writeFileSync(meta, '{"size":1000,"segm')
    writeFileSync(meta + '.tmp', JSON.stringify(state))
    expect(readSidecar(meta)).toEqual(state)
  })

  it('returns null when neither file is usable', () => {
    const meta = join(dir(), 'f.part.json')
    writeFileSync(meta, 'not json at all')
    expect(readSidecar(meta)).toBeNull()
  })
})
