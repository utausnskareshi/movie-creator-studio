import { describe, expect, it } from 'vitest'
import { planSegments } from '../src/main/core/downloader'

describe('planSegments', () => {
  it('covers the whole file with contiguous non-overlapping ranges', () => {
    for (const size of [128 * 1024 * 1024, 500_000_001, 14_293_923_632]) {
      const segs = planSegments(size)
      expect(segs[0].start).toBe(0)
      expect(segs[segs.length - 1].end).toBe(size)
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i].start).toBe(segs[i - 1].end)
      }
      expect(segs.reduce((a, s) => a + (s.end - s.start), 0)).toBe(size)
      expect(segs.every((s) => s.got === 0)).toBe(true)
    }
  })

  it('uses fewer segments for smaller files (min 64MB per segment)', () => {
    expect(planSegments(100 * 1024 * 1024).length).toBe(1)
    expect(planSegments(140 * 1024 * 1024).length).toBe(2)
    expect(planSegments(10 * 1024 * 1024 * 1024).length).toBe(4)
  })

  it('never returns an empty or zero-length segment', () => {
    for (const size of [1, 64 * 1024 * 1024 + 1, 999_999_999]) {
      const segs = planSegments(size)
      expect(segs.length).toBeGreaterThan(0)
      expect(segs.every((s) => s.end > s.start)).toBe(true)
    }
  })
})
