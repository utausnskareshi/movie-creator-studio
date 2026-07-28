import { describe, expect, it } from 'vitest'
import { clampInt, clampNum } from '../src/renderer/src/lib/num'

describe('clampNum / clampInt', () => {
  it('clamps into range', () => {
    expect(clampNum(25, 0, 20, 5)).toBe(20)
    expect(clampNum(-3, 0, 20, 5)).toBe(0)
    expect(clampNum('7.5', 0, 20, 5)).toBe(7.5)
  })
  it('falls back on empty / NaN / garbage', () => {
    expect(clampNum('', 0, 20, 5)).toBe(5)
    expect(clampNum('abc', 0, 20, 5)).toBe(5)
    expect(clampNum(NaN, 0, 20, 5)).toBe(5)
    // non-finite (incl. Infinity from "1e999") falls back to the known-good value
    expect(clampNum(Infinity, 0, 20, 5)).toBe(5)
  })
  it('clampInt rounds and bounds seeds', () => {
    expect(clampInt('12345.7', 0, 2147483647, 0)).toBe(12346)
    expect(clampInt('9999999999999', 0, 2147483647, 0)).toBe(2147483647)
    expect(clampInt('', 0, 2147483647, 0)).toBe(0)
  })
})
