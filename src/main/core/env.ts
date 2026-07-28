import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { totalmem } from 'os'
import { statfsSync } from 'fs'
import type { EnvInfo, GpuInfo, DiskInfo } from '@shared/types'

const execFileP = promisify(execFile)

export async function detectGpu(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execFileP(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 10_000 }
    )
    const line = stdout.trim().split(/\r?\n/)[0]
    if (!line) return null
    const idx = line.lastIndexOf(',')
    const name = line.slice(0, idx).trim()
    const vramMB = parseInt(line.slice(idx + 1).trim(), 10)
    if (!name || !Number.isFinite(vramMB)) return null
    return { name, vramMB }
  } catch {
    return null
  }
}

export function diskInfo(paths: string[]): DiskInfo[] {
  const drives = new Set<string>()
  for (const p of paths) {
    const m = /^([A-Za-z]:)/.exec(p)
    if (m) drives.add(m[1].toUpperCase())
  }
  const out: DiskInfo[] = []
  for (const drive of drives) {
    try {
      const s = statfsSync(drive + '\\')
      out.push({
        drive,
        freeGB: Math.round((s.bavail * s.bsize) / 1024 ** 3),
        totalGB: Math.round((s.blocks * s.bsize) / 1024 ** 3)
      })
    } catch {
      // drive not accessible
    }
  }
  return out
}

export async function getEnvInfo(dataDir: string): Promise<EnvInfo> {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    gpu: await detectGpu(),
    ramGB: Math.round(totalmem() / 1024 ** 3),
    disks: diskInfo([dataDir, app.getPath('userData')])
  }
}
