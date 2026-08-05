// ---------------------------------------------------------------------------
// Movie Creator Studio — shared types (IPC contract between main and renderer)
// ---------------------------------------------------------------------------

export type ModelFamily =
  | 'animegen'
  | 'wan22'
  | 'hunyuan15'
  | 'cogvideox'
  | 'cosmos'
  | 'ltx2'
  | 'wanfun'
  | 'minimaxh3'

export type Language = 'ja' | 'en'

// ---------------------------------------------------------------------------
// Environment / settings
// ---------------------------------------------------------------------------

export interface GpuInfo {
  name: string
  vramMB: number
}

export interface DiskInfo {
  drive: string
  freeGB: number
  totalGB: number
}

export interface EnvInfo {
  appVersion: string
  platform: string
  gpu: GpuInfo | null
  ramGB: number
  disks: DiskInfo[]
}

export interface AppSettings {
  language: Language
  /** Root folder holding engine/, models/, output/, work/ */
  dataDir: string
  /** last-used folders for the file pickers (falls back to the library dir) */
  lastDirs?: { image?: string; audio?: string; video?: string }
  /** gate model downloads by detected VRAM (setup screen toggle) */
  vramLimitEnabled: boolean
  /** Optional HuggingFace mirror origin, e.g. https://hf-mirror.com */
  hfMirror: string | null
  /** Prefer NVENC hardware encoding on export */
  useNvenc: boolean
}

// ---------------------------------------------------------------------------
// Setup (engine / ffmpeg / custom nodes / models)
// ---------------------------------------------------------------------------

export interface ComponentStatus {
  installed: boolean
  version?: string
  path?: string
  /** version this app release expects (set for comfyui) — mismatch = 更新あり */
  pinnedVersion?: string
}

export interface SetupStatus {
  comfyui: ComponentStatus
  ffmpeg: ComponentStatus
  /** local CPU LLM for Japanese->English prompt conversion */
  llm: ComponentStatus
  /** custom node pack id -> installed */
  customNodes: Record<string, boolean>
  /** model file id -> present on disk */
  modelFiles: Record<string, boolean>
}

/** One downloadable file belonging to a model pack. */
export interface ModelFileSpec {
  id: string
  /** Repo-relative source: huggingface repo + path */
  repo: string
  path: string
  /** Destination below <dataDir>/models, e.g. "diffusion_models/x.safetensors" */
  dest: string
  bytes: number
  sha256?: string
}

export interface LicenseInfo {
  name: string
  url: string
  commercialNote: string
  warnings: string[]
}

export interface ModelPack {
  id: string
  family: ModelFamily
  name: string
  description: string
  /** Sum of file sizes not shared with other packs (informational) */
  totalBytes: number
  vramNote: string
  /** minimum VRAM (GB) for practical use — gates downloads on low-VRAM PCs */
  minVramGB: number
  files: ModelFileSpec[]
  license: LicenseInfo
  /** Custom node packs required (ids into CUSTOM_NODES) */
  requiresCustomNodes: string[]
  recommended: boolean
}

export type SetupComponent = 'comfyui' | 'ffmpeg' | 'llm' | `customnode:${string}`

export interface DownloadProgress {
  /** file id, or component name for engine/ffmpeg */
  id: string
  label: string
  receivedBytes: number
  totalBytes: number
  bytesPerSec: number
  status: 'downloading' | 'verifying' | 'extracting' | 'done' | 'error' | 'cancelled'
  error?: string
}

// ---------------------------------------------------------------------------
// Engine (ComfyUI)
// ---------------------------------------------------------------------------

export interface EngineStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  port: number | null
  pid: number | null
  comfyuiVersion?: string
  vramFreeMB?: number
  vramTotalMB?: number
  lastError?: string
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type GenMode = 't2v' | 'i2v'

export interface GenBase {
  family: ModelFamily
  mode: GenMode
  prompt: string
  negative: string
  seed: number
  /** -1 = randomize on queue */
  width: number
  height: number
  frames: number
  /** Input image absolute path (i2v) */
  inputImagePath?: string
  /** Input audio clip absolute path (LTX2 avatar / IA2V) */
  inputAudioPath?: string
  /** Control video absolute path (Wan Fun Control) */
  controlVideoPath?: string
  /** MiniMax H3 FL2VA: optional LAST keyframe (inputImagePath is the first) */
  lastFrameImagePath?: string
  /** MiniMax H3 Ref2VA: reference images, model limit 9 */
  refImagePaths?: string[]
  /** MiniMax H3 Ref2VA: reference videos (2-15s each), model limit 3 */
  refVideoPaths?: string[]
  /** MiniMax H3 Ref2VA: standalone reference audio (2-15s each), model limit 3 */
  refAudioPaths?: string[]
}

export interface Wan22Options {
  /** '14b' uses the MoE dual-expert models, '5b' the TI2V dense model */
  size: '14b' | '5b'
  /** lightning 4-step LoRA (14b only) */
  lightning: boolean
  steps: number
  cfg: number
}

export interface AnimeGenOptions {
  lightning: boolean
  steps: number
  cfg: number
  /** auto-prefix "Japanese anime style, " */
  animePrefix: boolean
}

export interface Hunyuan15Options {
  /** 720p final quality, 480p distilled fast preview */
  variant: '720p' | '480p_distilled'
  /** latent super-resolution to 1080p (720p i2v/t2v only) */
  superResolution: boolean
  steps: number
  cfg: number
}

export interface CogVideoXOptions {
  steps: number
  cfg: number
  /** 0.0 = maximum fidelity to input image; higher = more motion freedom */
  noiseAugStrength: number
  /** pin the input image as the last frame too (identity lock) */
  endImageLock: boolean
  /**
   * How to fit non-16:10 inputs into the model's fixed 720x480 frame
   * (official card: "720x480, no support for other resolutions"):
   * pad = keep whole image, black bars / crop = center crop / stretch = distort
   */
  aspectMode: 'pad' | 'crop' | 'stretch'
  /** wrapper's enable_sequential_cpu_offload — for ~12GB GPUs (much slower) */
  lowVramOffload: boolean
}

export interface CosmosOptions {
  /** t2v runs the t2i -> video2world chain; i2v runs video2world directly */
  steps: number
  cfg: number
}

export interface Ltx2Options {
  /**
   * 'video' = synced-audio music-video (t2v/i2v); 'avatar' = image+audio talking head (IA2V).
   * The distilled LTX-2.3 template uses fixed manual sigmas + cfg 1, so there are
   * no step/cfg knobs — describe dialogue/music/sound in the prompt.
   */
  submode: 'video' | 'avatar'
}

export interface MinimaxH3Options {
  /**
   * 'fl2va' = first/last-frame model (T2V and I2V with optional last frame).
   * 'ref2va' = omni-reference model (images<=9 / videos<=3 / audios<=3,
   * referenced from the prompt as <Picture i> / <Video k> / <Audio j>).
   * Official templates use BasicGuider (no CFG / no negative prompt) with
   * res_multistep + simple scheduling.
   */
  variant: 'fl2va' | 'ref2va'
  steps: number
  /**
   * Ref2VA reference sizing: 'match' scales refs to the generation's pixel
   * area (faster), 'max' keeps up to a 2048px short edge for best identity
   * fidelity (reference tokens ride every step — several times slower).
   */
  refImageSize: 'match' | 'max'
  /**
   * I2V first-frame fitting. MiniMaxH3ImageToVideo plain-STRETCHES the first
   * frame to the canvas ("geometry anchor" in the node source), so a portrait
   * image on a landscape canvas comes out distorted. The app pre-fits the
   * image instead: 'blur' = blurred-background pad (recommended), 'pad' =
   * black bars, 'crop' = center crop, 'stretch' = the node's native behavior.
   * (The optional LAST frame is cover-cropped by the node and never distorts.)
   */
  aspectMode: 'blur' | 'pad' | 'crop' | 'stretch'
}

export type ControlType = 'canny' | 'pose' | 'depth'

export interface WanFunOptions {
  size: '14b' | '5b'
  /** control signal extracted from the control video */
  controlType: ControlType
  /** A14B only: the official template's (muted) lightx2v 4-step branch */
  lightning: boolean
  steps: number
  cfg: number
}

export type FamilyOptions =
  | { family: 'wan22'; wan22: Wan22Options }
  | { family: 'animegen'; animegen: AnimeGenOptions }
  | { family: 'hunyuan15'; hunyuan15: Hunyuan15Options }
  | { family: 'cogvideox'; cogvideox: CogVideoXOptions }
  | { family: 'cosmos'; cosmos: CosmosOptions }
  | { family: 'ltx2'; ltx2: Ltx2Options }
  | { family: 'wanfun'; wanfun: WanFunOptions }
  | { family: 'minimaxh3'; minimaxh3: MinimaxH3Options }

export type GenerationRequest = GenBase & { options: FamilyOptions }

export type JobState =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface JobInfo {
  id: string
  request: GenerationRequest
  state: JobState
  createdAt: number
  startedAt?: number
  finishedAt?: number
  /** 0..1 sampling progress */
  progress: number
  progressText?: string
  /** data URL of latest preview frame */
  previewDataUrl?: string
  error?: string
  /** library entry created on completion */
  videoId?: string
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export interface VideoRecord {
  id: string
  filePath: string
  thumbPath: string
  family: ModelFamily
  mode: GenMode
  prompt: string
  negative: string
  seed: number
  width: number
  height: number
  fps: number
  frames: number
  durationSec: number
  createdAt: number
  favorite: boolean
  tags: string[]
  /** full GenerationRequest JSON for regeneration */
  requestJson: string
  /** e.g. "AnimeGen-I2V (AIdeaLab)" for license/attribution metadata */
  modelLabel: string
}

// ---------------------------------------------------------------------------
// Editing / export
// ---------------------------------------------------------------------------

export interface EditClip {
  videoId: string
  /** trim range in seconds; out=0 means "to end" */
  inSec: number
  outSec: number
}

export type OverlayPosition = 'top' | 'middle' | 'bottom'

export interface TextOverlay {
  text: string
  startSec: number
  endSec: number
  position: OverlayPosition
  fontSizePct: number // relative to video height, e.g. 5 = 5%
  color: string // hex
  outline: boolean
}

export interface AudioTrackItem {
  path: string
  offsetSec: number
  gainDb: number
}

export interface EditProject {
  clips: EditClip[]
  bgm: (AudioTrackItem & { loop: boolean }) | null
  overlays: TextOverlay[]
  fadeInSec: number
  fadeOutSec: number
  /** keep original clip audio (generated clips are usually silent) */
  keepClipAudio: boolean
}

export type AspectMode = 'crop' | 'blurpad'

export interface ExportPreset {
  id: string
  label: string
  width: number
  height: number
  fps: number
  videoCodec: 'h264' | 'hevc'
  videoBitrateK?: number
  crf?: number
  audioBitrateK: number
  maxDurationSec?: number
  note: string
}

export interface ExportRequest {
  project: EditProject
  presetId: string
  aspectMode: AspectMode
  /** motion-interpolate to preset fps instead of duplicating frames */
  smoothInterpolation: boolean
  /** lanczos upscale when source is below target */
  upscale: boolean
  loudnessNormalize: boolean
  outputName: string
}

export interface ExportProgress {
  exportId: string
  phase: 'preparing' | 'encoding' | 'done' | 'error' | 'cancelled'
  /** 0..1 when measurable */
  progress: number
  message?: string
  outputPath?: string
}

// ---------------------------------------------------------------------------
// IPC surface
// ---------------------------------------------------------------------------

export interface McsApi {
  // env & settings
  getEnv(): Promise<EnvInfo>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>

  // setup
  getSetupStatus(): Promise<SetupStatus>
  getModelCatalog(): Promise<ModelPack[]>
  installComponent(component: SetupComponent): Promise<void>
  /** packKey scopes cancel intents: only the pack whose card the cancel came from stops wholesale */
  downloadModelFiles(fileIds: string[], packKey: string): Promise<void>
  cancelDownload(id: string, packKey: string): Promise<void>
  onDownloadProgress(cb: (p: DownloadProgress) => void): () => void

  // engine
  getEngineStatus(): Promise<EngineStatus>
  startEngine(): Promise<EngineStatus>
  stopEngine(): Promise<void>
  onEngineStatus(cb: (s: EngineStatus) => void): () => void

  // generation
  queueGeneration(req: GenerationRequest): Promise<string>
  cancelJob(jobId: string): Promise<void>
  listJobs(): Promise<JobInfo[]>
  onJobUpdate(cb: (job: JobInfo) => void): () => void

  // library
  listVideos(): Promise<VideoRecord[]>
  updateVideo(id: string, patch: Partial<Pick<VideoRecord, 'favorite' | 'tags'>>): Promise<void>
  deleteVideo(id: string, deleteFile: boolean): Promise<void>
  showInFolder(id: string): Promise<void>
  openLibraryFolder(): Promise<void>
  openLogsFolder(): Promise<void>

  // editing / export
  getExportPresets(): Promise<ExportPreset[]>
  startExport(req: ExportRequest): Promise<string>
  cancelExport(exportId: string): Promise<void>
  onExportProgress(cb: (p: ExportProgress) => void): () => void

  // prompt conversion (local CPU LLM)
  llmTranslate(family: ModelFamily, japaneseText: string): Promise<string>


  // dialogs & misc
  pickImage(): Promise<string | null>
  pickAudio(): Promise<string | null>
  pickVideo(): Promise<string | null>
  pickDirectory(): Promise<string | null>
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<void>
  /** convert a local absolute path into a mcs:// URL usable in <img>/<video> */
  toMediaUrl(path: string): string
}

export const IPC = {
  getEnv: 'env:get',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getSetupStatus: 'setup:status',
  getModelCatalog: 'models:catalog',
  installComponent: 'setup:install',
  downloadModelFiles: 'models:download',
  cancelDownload: 'download:cancel',
  evDownloadProgress: 'ev:download-progress',
  getEngineStatus: 'engine:status',
  startEngine: 'engine:start',
  stopEngine: 'engine:stop',
  evEngineStatus: 'ev:engine-status',
  queueGeneration: 'gen:queue',
  cancelJob: 'gen:cancel',
  listJobs: 'gen:jobs',
  evJobUpdate: 'ev:job-update',
  listVideos: 'library:list',
  updateVideo: 'library:update',
  deleteVideo: 'library:delete',
  showInFolder: 'library:show',
  openLibraryFolder: 'library:open-folder',
  openLogsFolder: 'shell:open-logs',
  getExportPresets: 'export:presets',
  startExport: 'export:start',
  cancelExport: 'export:cancel',
  evExportProgress: 'ev:export-progress',
  llmTranslate: 'llm:translate',
  pickImage: 'dialog:pick-image',
  pickAudio: 'dialog:pick-audio',
  pickVideo: 'dialog:pick-video',
  pickDirectory: 'dialog:pick-directory',
  openExternal: 'shell:open-external',
  openPath: 'shell:open-path'
} as const
