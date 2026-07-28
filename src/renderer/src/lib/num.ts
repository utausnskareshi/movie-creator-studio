/** Parse + clamp a numeric input value; NaN/empty falls back. */
export function clampNum(raw: string | number, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Integer variant (steps, seeds, frame counts). */
export function clampInt(raw: string | number, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(raw, min, max, fallback))
}
