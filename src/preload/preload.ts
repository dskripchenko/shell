import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type Settings, type ShellApi, type UpdateInfo } from '../common/ipc'

const api: ShellApi = {
  startup: () => ipcRenderer.invoke(IPC.startup),
  spawn: (paneId, opts) => ipcRenderer.invoke(IPC.spawn, paneId, opts),
  write: (paneId, data) => ipcRenderer.send(IPC.write, paneId, data),
  resize: (paneId, cols, rows) => ipcRenderer.send(IPC.resize, paneId, cols, rows),
  kill: (paneId) => ipcRenderer.send(IPC.kill, paneId),
  cwd: (paneId) => ipcRenderer.invoke(IPC.cwd, paneId),
  gitBranch: (folder) => ipcRenderer.invoke(IPC.gitBranch, folder),
  saveWorkspace: (ws) => ipcRenderer.send(IPC.saveWorkspace, ws),
  onData: (listener) => void ipcRenderer.on(IPC.data, (_e, paneId: string, data: string) => listener(paneId, data)),
  onExit: (listener) => void ipcRenderer.on(IPC.exit, (_e, paneId: string, code: number) => listener(paneId, code)),
  onSettings: (listener) => void ipcRenderer.on(IPC.settings, (_e, s: Settings) => listener(s)),
  onCommand: (listener) => void ipcRenderer.on(IPC.command, (_e, command: string) => listener(command)),
  copy: (text) => ipcRenderer.send(IPC.copy, text),
  paste: () => ipcRenderer.invoke(IPC.paste),
  openExternal: (url) => ipcRenderer.send(IPC.openExternal, url),
  openConfig: () => ipcRenderer.send(IPC.openConfig),
  openDataDir: () => ipcRenderer.send(IPC.openDataDir),
  updateState: () => ipcRenderer.invoke(IPC.updateState),
  checkUpdate: () => ipcRenderer.send(IPC.updateCheck),
  restartToUpdate: () => ipcRenderer.send(IPC.updateRestart),
  onUpdate: (listener) => void ipcRenderer.on(IPC.updateChanged, (_e, info: UpdateInfo) => listener(info)),
}

contextBridge.exposeInMainWorld('shell', api)
