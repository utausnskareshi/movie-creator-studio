/**
 * Validation/normalization for a renderer-supplied dataDir.
 * Electron-free on purpose so unit tests can import it directly.
 */

/**
 * Returns the dataDir to store, or null when the input is unusable.
 * - trims surrounding whitespace
 * - requires an absolute drive-letter path (UNC is not supported: the
 *   engine/downloader assume a local disk)
 * - a bare drive root (e.g. "D:\") would scatter engine/models/... at the
 *   root AND be rejected by the uninstaller's marker sanity check (>3 chars),
 *   so the standard MCS-Data folder is nested automatically
 */
export function sanitizeDataDir(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const dir = input.trim()
  if (!/^[A-Za-z]:[\\/]/.test(dir)) return null
  return /^[A-Za-z]:[\\/]$/.test(dir) ? `${dir.slice(0, 2)}\\MCS-Data` : dir
}
