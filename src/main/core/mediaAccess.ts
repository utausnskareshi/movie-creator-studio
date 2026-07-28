import { resolve } from 'path'
import { dataDir, configDir } from './paths'

/**
 * Whitelist of local files the renderer is allowed to reference (via the
 * mcs:// protocol) or open (shell.openPath). Everything the app itself
 * produces lives under dataDir()/configDir(); user-picked inputs (images,
 * audio) are added explicitly when the native picker returns them. This keeps
 * a compromised renderer from reading or launching arbitrary files.
 */
const pickedPaths = new Set<string>()

function norm(p: string): string {
  return resolve(p).toLowerCase()
}

/** Record a path the user explicitly chose via a native dialog. */
export function allowPickedPath(p: string | null): void {
  if (p) pickedPaths.add(norm(p))
}

/** May the renderer reference this path (mcs:// media serving)? */
export function isMediaPathAllowed(p: string): boolean {
  const n = norm(p)
  if (pickedPaths.has(n)) return true
  const roots = [norm(dataDir()), norm(configDir())]
  return roots.some((root) => n === root || n.startsWith(root + '\\'))
}

/** May the renderer open this path in the shell? (no picked-file execution) */
export function isOpenPathAllowed(p: string): boolean {
  const n = norm(p)
  const roots = [norm(dataDir()), norm(configDir())]
  return roots.some((root) => n === root || n.startsWith(root + '\\'))
}
