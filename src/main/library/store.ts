import { join } from 'path'
import { readFileSync, writeFileSync, renameSync, rmSync, existsSync, mkdirSync } from 'fs'
import type { VideoRecord } from '@shared/types'
import { configDir } from '../core/paths'

/**
 * Simple JSON-file persistence for the video library.
 * A personal library holds at most a few thousand records — a flat JSON file
 * with atomic writes is robust, dependency-free and trivially portable.
 */
class LibraryStore {
  private records: VideoRecord[] | null = null

  private file(): string {
    return join(configDir(), 'library.json')
  }

  private load(): VideoRecord[] {
    if (this.records) return this.records
    try {
      const parsed = JSON.parse(readFileSync(this.file(), 'utf-8')) as unknown
      // JSON.parse succeeds for `{}`, `"x"`, `null`... and a non-array would
      // then blow up in push()/find() — a completed generation would be
      // reported as failed. Treat any non-array as corrupt.
      if (!Array.isArray(parsed)) throw new Error('library.json is not an array')
      this.records = parsed.filter((r): r is VideoRecord => !!r && typeof r === 'object')
    } catch {
      // never silently wipe the user's library metadata: keep the corrupt
      // file next to the fresh one so it can be recovered by hand
      try {
        if (existsSync(this.file())) {
          renameSync(this.file(), `${this.file()}.corrupt-${Date.now()}`)
        }
      } catch {
        /* backup is best-effort */
      }
      this.records = []
    }
    return this.records
  }

  private persist(): void {
    mkdirSync(configDir(), { recursive: true })
    const tmp = this.file() + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.records ?? [], null, 1), 'utf-8')
    renameSync(tmp, this.file())
  }

  list(): VideoRecord[] {
    return [...this.load()].sort((a, b) => b.createdAt - a.createdAt)
  }

  get(id: string): VideoRecord | undefined {
    return this.load().find((r) => r.id === id)
  }

  insert(rec: VideoRecord): void {
    this.load().push(rec)
    this.persist()
  }

  update(id: string, patch: Partial<VideoRecord>): void {
    const rec = this.load().find((r) => r.id === id)
    if (!rec) return
    Object.assign(rec, patch)
    this.persist()
  }

  remove(id: string, deleteFiles: boolean): void {
    const recs = this.load()
    const idx = recs.findIndex((r) => r.id === id)
    if (idx < 0) return
    const rec = recs[idx]
    // delete the media FIRST and only drop the record once that succeeded:
    // splicing first meant a locked file (open in a player, mid-export) left
    // the entry gone from the UI while the bytes stayed on disk forever
    if (deleteFiles) {
      for (const p of [rec.filePath, rec.thumbPath]) {
        if (p && existsSync(p)) rmSync(p, { force: true })
      }
    }
    recs.splice(idx, 1)
    this.persist()
  }
}

export const library = new LibraryStore()
