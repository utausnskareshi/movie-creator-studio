import type { ModelFamily, ModelPack, SetupStatus } from '@shared/types'

/** A pack is usable when all its files and custom nodes are present. */
export function packReady(pack: ModelPack, status: SetupStatus | null): boolean {
  if (!status) return false
  return (
    pack.files.every((f) => status.modelFiles[f.id]) &&
    pack.requiresCustomNodes.every((n) => status.customNodes[n])
  )
}

/** A generation screen needs the engine, ffmpeg and at least one ready pack of its family. */
export function familyReady(
  family: ModelFamily,
  status: SetupStatus | null,
  catalog: ModelPack[]
): boolean {
  if (!status?.comfyui.installed || !status?.ffmpeg.installed) return false
  return catalog.filter((p) => p.family === family).some((p) => packReady(p, status))
}

/** The editor needs ffmpeg for preview thumbnails and export. */
export function editorReady(status: SetupStatus | null): boolean {
  return !!status?.ffmpeg.installed
}

export function packReadyById(
  packId: string,
  status: SetupStatus | null,
  catalog: ModelPack[]
): boolean {
  const pack = catalog.find((p) => p.id === packId)
  return !!pack && packReady(pack, status)
}

export function lockReason(
  family: ModelFamily | null,
  status: SetupStatus | null
): string {
  if (!status?.comfyui.installed) return 'ComfyUI(生成エンジン)のインストールが必要です'
  if (!status?.ffmpeg.installed) return 'ffmpeg のインストールが必要です'
  if (family) return 'このモデルのダウンロードが必要です'
  return 'セットアップが必要です'
}
