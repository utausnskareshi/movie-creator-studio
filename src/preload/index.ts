import { contextBridge, ipcRenderer } from 'electron'
import type { McsApi } from '@shared/types'
import { IPC } from '@shared/types'

function on<T>(channel: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api: McsApi = {
  getEnv: () => ipcRenderer.invoke(IPC.getEnv),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),

  getSetupStatus: () => ipcRenderer.invoke(IPC.getSetupStatus),
  getModelCatalog: () => ipcRenderer.invoke(IPC.getModelCatalog),
  installComponent: (component) => ipcRenderer.invoke(IPC.installComponent, component),
  downloadModelFiles: (fileIds, packKey) => ipcRenderer.invoke(IPC.downloadModelFiles, fileIds, packKey),
  cancelDownload: (id, packKey) => ipcRenderer.invoke(IPC.cancelDownload, id, packKey),
  onDownloadProgress: on(IPC.evDownloadProgress),

  getEngineStatus: () => ipcRenderer.invoke(IPC.getEngineStatus),
  startEngine: () => ipcRenderer.invoke(IPC.startEngine),
  stopEngine: () => ipcRenderer.invoke(IPC.stopEngine),
  onEngineStatus: on(IPC.evEngineStatus),

  queueGeneration: (req) => ipcRenderer.invoke(IPC.queueGeneration, req),
  cancelJob: (jobId) => ipcRenderer.invoke(IPC.cancelJob, jobId),
  listJobs: () => ipcRenderer.invoke(IPC.listJobs),
  onJobUpdate: on(IPC.evJobUpdate),

  listVideos: () => ipcRenderer.invoke(IPC.listVideos),
  updateVideo: (id, patch) => ipcRenderer.invoke(IPC.updateVideo, id, patch),
  deleteVideo: (id, deleteFile) => ipcRenderer.invoke(IPC.deleteVideo, id, deleteFile),
  showInFolder: (id) => ipcRenderer.invoke(IPC.showInFolder, id),
  openLibraryFolder: () => ipcRenderer.invoke(IPC.openLibraryFolder),
  openLogsFolder: () => ipcRenderer.invoke(IPC.openLogsFolder),

  getExportPresets: () => ipcRenderer.invoke(IPC.getExportPresets),
  startExport: (req) => ipcRenderer.invoke(IPC.startExport, req),
  cancelExport: (exportId) => ipcRenderer.invoke(IPC.cancelExport, exportId),
  onExportProgress: on(IPC.evExportProgress),

  llmTranslate: (family, japaneseText) => ipcRenderer.invoke(IPC.llmTranslate, family, japaneseText),


  pickImage: () => ipcRenderer.invoke(IPC.pickImage),
  pickAudio: () => ipcRenderer.invoke(IPC.pickAudio),
  pickVideo: () => ipcRenderer.invoke(IPC.pickVideo),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  openPath: (p) => ipcRenderer.invoke(IPC.openPath, p),
  toMediaUrl: (path) => `mcs://media/${encodeURIComponent(path)}`
}

contextBridge.exposeInMainWorld('mcs', api)
