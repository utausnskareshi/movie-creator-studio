import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { getSettings } from './settings'

/** Root for engine/models/output. Kept short to avoid Windows MAX_PATH issues. */
export function dataDir(): string {
  return getSettings().dataDir
}

export function engineDir(): string {
  return join(dataDir(), 'engine')
}

/** ComfyUI_windows_portable extraction root */
export function comfyRoot(): string {
  return join(engineDir(), 'ComfyUI_windows_portable')
}

export function comfyPython(): string {
  return join(comfyRoot(), 'python_embeded', 'python.exe')
}

export function comfyMain(): string {
  return join(comfyRoot(), 'ComfyUI', 'main.py')
}

export function customNodesDir(): string {
  return join(comfyRoot(), 'ComfyUI', 'custom_nodes')
}

/** Shared model root referenced via extra_model_paths.yaml */
export function modelsDir(): string {
  return join(dataDir(), 'models')
}

export function ffmpegDir(): string {
  return join(dataDir(), 'ffmpeg')
}

/** llama.cpp runtime + GGUF model for the prompt-conversion LLM */
export function llmDir(): string {
  return join(dataDir(), 'llm')
}

export function llmServerExe(): string {
  return join(llmDir(), 'bin', 'llama-server.exe')
}

export function llmModelPath(): string {
  return join(llmDir(), 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf')
}

export function ffmpegExe(): string {
  return join(ffmpegDir(), 'ffmpeg.exe')
}

export function ffprobeExe(): string {
  return join(ffmpegDir(), 'ffprobe.exe')
}

/** ComfyUI --output-directory (raw engine outputs before library import) */
export function engineOutputDir(): string {
  return join(dataDir(), 'work', 'engine-output')
}

export function engineInputDir(): string {
  return join(dataDir(), 'work', 'engine-input')
}

export function libraryDir(): string {
  return join(dataDir(), 'library')
}

export function thumbsDir(): string {
  return join(libraryDir(), 'thumbs')
}

export function exportsDir(): string {
  return join(dataDir(), 'exports')
}

export function tempDir(): string {
  return join(dataDir(), 'work', 'tmp')
}

/** app-config (settings.json, library.json) lives in userData, not dataDir */
export function configDir(): string {
  return app.getPath('userData')
}

// NOTE: dataDir 直下に新しいサブフォルダを増やす場合は build/installer.nsh の
// MCS_DELETE_DATA_SUBDIRS にも追加すること(アンインストールの完全削除は
// ルート丸ごとではなく、ここで作るサブフォルダ単位で行われる)
export function ensureDirs(): void {
  for (const d of [
    dataDir(),
    engineDir(),
    modelsDir(),
    ffmpegDir(),
    engineOutputDir(),
    engineInputDir(),
    libraryDir(),
    thumbsDir(),
    exportsDir(),
    tempDir()
  ]) {
    mkdirSync(d, { recursive: true })
  }
}
