import { contextBridge, ipcRenderer } from 'electron'
import type { ShellEvent } from '@dskripchenko/shell-integration'
import { IPC, type AgentSignal, type ApiRequest, type Settings, type ShellApi, type UpdateInfo } from '../common/ipc'
import type { Project } from '../common/projects'

const api: ShellApi = {
  startup: () => ipcRenderer.invoke(IPC.startup),
  spawn: (paneId, opts) => ipcRenderer.invoke(IPC.spawn, paneId, opts),
  write: (paneId, data) => ipcRenderer.send(IPC.write, paneId, data),
  resize: (paneId, cols, rows) => ipcRenderer.send(IPC.resize, paneId, cols, rows),
  kill: (paneId) => ipcRenderer.send(IPC.kill, paneId),
  cwd: (paneId) => ipcRenderer.invoke(IPC.cwd, paneId),
  gitBranch: (folder) => ipcRenderer.invoke(IPC.gitBranch, folder),
  saveWorkspace: (ws) => ipcRenderer.send(IPC.saveWorkspace, ws),
  gitStatus: (cwds) => ipcRenderer.invoke(IPC.gitStatus, cwds),
  addWorktree: (cwd, branch) => ipcRenderer.invoke(IPC.addWorktree, cwd, branch),
  projects: () => ipcRenderer.invoke(IPC.projects),
  saveProjects: (list) => ipcRenderer.send(IPC.saveProjects, list),
  onProjects: (listener) => void ipcRenderer.on(IPC.projectsChanged, (_e, list: Project[]) => listener(list)),
  realpaths: (paths) => ipcRenderer.invoke(IPC.realpaths, paths),
  onApiRequest: (listener) =>
    void ipcRenderer.on(IPC.apiRequest, (_e, id: number, request: ApiRequest) => {
      void Promise.resolve(listener(request)).then(
        (reply) => ipcRenderer.send(IPC.apiReply, id, reply),
        () => ipcRenderer.send(IPC.apiReply, id, { status: 500 }),
      )
    }),
  onData: (listener) => void ipcRenderer.on(IPC.data, (_e, paneId: string, data: string) => listener(paneId, data)),
  onExit: (listener) => void ipcRenderer.on(IPC.exit, (_e, paneId: string, code: number) => listener(paneId, code)),
  onAgentSignal: (listener) => void ipcRenderer.on(IPC.agentSignal, (_e, s: AgentSignal) => listener(s)),
  claudeHooks: (on) => ipcRenderer.invoke(IPC.claudeHooks, on),
  viewerOpen: (path, cwd) => ipcRenderer.invoke(IPC.viewerOpen, path, cwd),
  openPath: (path) => ipcRenderer.send(IPC.openPath, path),
  remote: {
    hosts: () => ipcRenderer.invoke(IPC.remoteHosts),
    home: (alias) => ipcRenderer.invoke(IPC.remoteHome, alias),
    list: (alias, path) => ipcRenderer.invoke(IPC.remoteList, alias, path),
    get: (alias, items, localDir) => ipcRenderer.invoke(IPC.remoteGet, alias, items, localDir),
    put: (alias, items, remoteDir) => ipcRenderer.invoke(IPC.remotePut, alias, items, remoteDir),
    mkdir: (alias, path) => ipcRenderer.invoke(IPC.remoteMkdir, alias, path),
    rename: (alias, from, to) => ipcRenderer.invoke(IPC.remoteRename, alias, from, to),
    remove: (alias, items) => ipcRenderer.invoke(IPC.remoteRemove, alias, items),
    fetch: (alias, path) => ipcRenderer.invoke(IPC.remoteFetch, alias, path),
  },
  files: {
    list: (dir) => ipcRenderer.invoke(IPC.filesList, dir),
    copy: (items, target) => ipcRenderer.invoke(IPC.filesCopy, items, target),
    move: (items, target) => ipcRenderer.invoke(IPC.filesMove, items, target),
    rename: (item, to) => ipcRenderer.invoke(IPC.filesRename, item, to),
    mkdir: (path) => ipcRenderer.invoke(IPC.filesMkdir, path),
    trash: (items) => ipcRenderer.invoke(IPC.filesTrash, items),
    head: (path) => ipcRenderer.invoke(IPC.filesHead, path),
  },
  folioFind: () => ipcRenderer.invoke(IPC.folioFind),
  folioOpen: (request) => ipcRenderer.invoke(IPC.folioOpen, request),
  changesBaseline: (cwd, kind) => ipcRenderer.invoke(IPC.changesBaseline, cwd, kind),
  changesList: (b) => ipcRenderer.invoke(IPC.changesList, b),
  changesDiff: (b, path, untracked) => ipcRenderer.invoke(IPC.changesDiff, b, path, untracked),
  onEvents: (listener) => void ipcRenderer.on(IPC.events, (_e, paneId: string, events: ShellEvent[]) => listener(paneId, events)),
  onSettings: (listener) => void ipcRenderer.on(IPC.settings, (_e, s: Settings) => listener(s)),
  onCommand: (listener) => void ipcRenderer.on(IPC.command, (_e, command: string) => listener(command)),
  copy: (text) => ipcRenderer.send(IPC.copy, text),
  paste: () => ipcRenderer.invoke(IPC.paste),
  openExternal: (url) => ipcRenderer.send(IPC.openExternal, url),
  openConfig: () => ipcRenderer.send(IPC.openConfig),
  setSetting: (section, key, value) => ipcRenderer.invoke(IPC.setSetting, section, key, value),
  openDataDir: () => ipcRenderer.send(IPC.openDataDir),
  updateState: () => ipcRenderer.invoke(IPC.updateState),
  checkUpdate: () => ipcRenderer.send(IPC.updateCheck),
  restartToUpdate: () => ipcRenderer.send(IPC.updateRestart),
  onUpdate: (listener) => void ipcRenderer.on(IPC.updateChanged, (_e, info: UpdateInfo) => listener(info)),
}

contextBridge.exposeInMainWorld('shell', api)
