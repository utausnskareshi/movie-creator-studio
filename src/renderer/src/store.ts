import { create } from 'zustand'
import type {
  AppSettings,
  DownloadProgress,
  EditClip,
  EditProject,
  EngineStatus,
  EnvInfo,
  ExportProgress,
  JobInfo,
  ModelPack,
  SetupStatus,
  TextOverlay,
  VideoRecord
} from '@shared/types'

/** everything the editor screen must not lose when the user navigates away */
export interface EditorProjectState {
  clips: EditClip[]
  bgm: EditProject['bgm']
  overlays: TextOverlay[]
  fadeInSec: number
  fadeOutSec: number
  keepClipAudio: boolean
}

export const EMPTY_EDITOR_PROJECT: EditorProjectState = {
  clips: [],
  bgm: null,
  overlays: [],
  fadeInSec: 0,
  fadeOutSec: 0.5,
  // LTX-2.3 clips carry generated audio — keep it by default
  keepClipAudio: true
}

export type Screen =
  | 'home'
  | 'setup'
  | 'animegen'
  | 'wan22'
  | 'hunyuan15'
  | 'cogvideox'
  | 'cosmos'
  | 'ltx2'
  | 'wanfun'
  | 'library'
  | 'editor'
  | 'settings'
  | 'licenses'
  | 'help'

interface AppState {
  screen: Screen
  setScreen: (s: Screen) => void

  env: EnvInfo | null
  settings: AppSettings | null
  setupStatus: SetupStatus | null
  catalog: ModelPack[]
  engine: EngineStatus | null
  jobs: JobInfo[]
  videos: VideoRecord[]
  downloads: Record<string, DownloadProgress>
  exports: Record<string, ExportProgress>

  /** clips selected in library to seed the editor */
  editorSeedIds: string[]
  setEditorSeedIds: (ids: string[]) => void

  /**
   * The edit project lives in the store, not in EditorScreen: it used to be
   * component state, so visiting any other screen (or the nav lock bouncing
   * the user home) silently threw away every clip, telop and BGM setting.
   * The functional form patches against the LATEST state — two updates in
   * one commit (the seed effect + the ghost-clip sweep) otherwise clobber
   * each other through the render-time snapshot.
   */
  editorProject: EditorProjectState
  setEditorProject: (
    patch:
      | Partial<EditorProjectState>
      | ((prev: EditorProjectState) => Partial<EditorProjectState>)
  ) => void
  resetEditorProject: () => void

  /**
   * UI-side busy registry for long-running operations
   * (keys: 'install:comfyui' | 'install:ffmpeg' | 'pack:<packId>').
   * Lives in the global store so screen navigation doesn't lose it.
   */
  busyKeys: Record<string, boolean>
  setBusy: (key: string, on: boolean) => void

  refreshBase: () => Promise<void>
  refreshSetup: () => Promise<void>
  refreshVideos: () => Promise<void>
  refreshJobs: () => Promise<void>
  init: () => Promise<void>
}

let initialized = false

export const useApp = create<AppState>((set, get) => ({
  screen: 'home',
  setScreen: (s) => set({ screen: s }),

  env: null,
  settings: null,
  setupStatus: null,
  catalog: [],
  engine: null,
  jobs: [],
  videos: [],
  downloads: {},
  exports: {},

  editorSeedIds: [],
  setEditorSeedIds: (ids) => set({ editorSeedIds: ids }),

  editorProject: EMPTY_EDITOR_PROJECT,
  setEditorProject: (patch) =>
    set((st) => ({
      editorProject: {
        ...st.editorProject,
        ...(typeof patch === 'function' ? patch(st.editorProject) : patch)
      }
    })),
  resetEditorProject: () => set({ editorProject: EMPTY_EDITOR_PROJECT }),

  busyKeys: {},
  setBusy: (key, on) =>
    set((st) => {
      const busyKeys = { ...st.busyKeys }
      if (on) busyKeys[key] = true
      else delete busyKeys[key]
      return { busyKeys }
    }),

  refreshBase: async () => {
    const [env, settings, engine] = await Promise.all([
      window.mcs.getEnv(),
      window.mcs.getSettings(),
      window.mcs.getEngineStatus()
    ])
    set({ env, settings, engine })
  },
  refreshSetup: async () => {
    const [setupStatus, catalog] = await Promise.all([
      window.mcs.getSetupStatus(),
      window.mcs.getModelCatalog()
    ])
    set({ setupStatus, catalog })
  },
  refreshVideos: async () => {
    set({ videos: await window.mcs.listVideos() })
  },
  refreshJobs: async () => {
    set({ jobs: await window.mcs.listJobs() })
  },

  init: async () => {
    if (initialized) return
    initialized = true

    // register live listeners FIRST — they don't depend on the initial fetches,
    // and if a fetch throws we must not end up with no event wiring for the session
    window.mcs.onEngineStatus((engine) => set({ engine }))
    window.mcs.onJobUpdate((job) => {
      set((st) => {
        const jobs = [...st.jobs]
        const i = jobs.findIndex((j) => j.id === job.id)
        if (i >= 0) jobs[i] = job
        else jobs.unshift(job)
        // keep only active jobs + the most recent terminal ones (bounded memory)
        const active = jobs.filter((j) => !['completed', 'failed', 'cancelled'].includes(j.state))
        const terminal = jobs.filter((j) => ['completed', 'failed', 'cancelled'].includes(j.state)).slice(0, 50)
        return { jobs: [...active, ...terminal] }
      })
      if (job.state === 'completed') void get().refreshVideos()
    })
    window.mcs.onDownloadProgress((p) => {
      set((st) => ({ downloads: { ...st.downloads, [p.id]: p } }))
      if (p.status === 'done') void get().refreshSetup()
    })
    window.mcs.onExportProgress((p) => {
      set((st) => ({ exports: { ...st.exports, [p.exportId]: p } }))
    })

    try {
      await Promise.all([
        get().refreshBase(),
        get().refreshSetup(),
        get().refreshVideos(),
        get().refreshJobs()
      ])
    } catch {
      // a failed initial refresh must not disable the app; the user can retry
      // from the UI and listeners above are already live
    }
  }
}))
