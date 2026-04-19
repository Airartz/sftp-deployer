import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../../shared/types'

// ─── Listener registry ────────────────────────────────────────────────────────
// Maps  channel → (userCallback → ipcRenderer wrapper)
// so that off() can look up and remove the exact same function that on() registered.

const registry = new Map<string, Map<Function, (...args: unknown[]) => void>>()

function subscribe(channel: string, cb: (...args: never[]) => void): void {
  let byChannel = registry.get(channel)
  if (!byChannel) { byChannel = new Map(); registry.set(channel, byChannel) }
  if (byChannel.has(cb)) return // idempotent — prevents StrictMode double-registration
  const wrapper = (_event: unknown, data: unknown) => (cb as (d: unknown) => void)(data)
  byChannel.set(cb, wrapper)
  ipcRenderer.on(channel, wrapper)
}

function unsubscribe(channel: string, cb: (...args: never[]) => void): void {
  const wrapper = registry.get(channel)?.get(cb)
  if (!wrapper) return
  ipcRenderer.removeListener(channel, wrapper)
  registry.get(channel)?.delete(cb)
}

// ─── API ──────────────────────────────────────────────────────────────────────

const api: ElectronAPI = {
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    create: (data) => ipcRenderer.invoke('servers:create', data),
    update: (id, data) => ipcRenderer.invoke('servers:update', id, data),
    delete: (id) => ipcRenderer.invoke('servers:delete', id),
    testConnection: (id) => ipcRenderer.invoke('servers:testConnection', id),
    testNewConnection: (data) => ipcRenderer.invoke('servers:testNewConnection', data),
    setWatch: (id, active) => ipcRenderer.invoke('servers:setWatch', id, active),
    ping: (id) => ipcRenderer.invoke('servers:ping', id),
    info: (id) => ipcRenderer.invoke('servers:info', id)
  },

  sync: {
    start: (serverId, options) => ipcRenderer.invoke('sync:start', serverId, options),
    cancel: (sessionId) => ipcRenderer.invoke('sync:cancel', sessionId)
  },

  logs: {
    getHistory: (serverId, limit) => ipcRenderer.invoke('logs:getHistory', serverId, limit),
    clearHistory: (serverId) => ipcRenderer.invoke('logs:clearHistory', serverId),
    getStats: () => ipcRenderer.invoke('logs:getStats')
  },

  fs: {
    pickFolder: () => ipcRenderer.invoke('fs:pickFolder'),
    pickKeyFile: () => ipcRenderer.invoke('fs:pickKeyFile'),
    readKeyFile: (path) => ipcRenderer.invoke('fs:readKeyFile', path),
    listFiles: (folderPath) => ipcRenderer.invoke('fs:listFiles', folderPath),
    getTempDir: () => ipcRenderer.invoke('fs:getTempDir')
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data) => ipcRenderer.invoke('settings:update', data)
  },

  backup: {
    listSessions: (serverId) => ipcRenderer.invoke('backup:listSessions', serverId),
    restoreSession: (serverId, sessionId) => ipcRenderer.invoke('backup:restoreSession', serverId, sessionId),
    deleteSession: (serverId, sessionId) => ipcRenderer.invoke('backup:deleteSession', serverId, sessionId)
  },

  terminal: {
    open: (serverId) => ipcRenderer.invoke('terminal:open', serverId),
    openDirect: (config, label) => ipcRenderer.invoke('terminal:openDirect', config, label),
    write: (sessionId, data) => ipcRenderer.send('terminal:write', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send('terminal:resize', sessionId, cols, rows),
    close: (sessionId) => ipcRenderer.send('terminal:close', sessionId),
    createWindow: () => ipcRenderer.invoke('terminal:createWindow'),
    getSessions: () => ipcRenderer.invoke('terminal:getSessions')
  },

  sftpBrowser: {
    list:            (serverId, path)                  => ipcRenderer.invoke('sftpbrowser:list', serverId, path),
    listLocal:       (path)                            => ipcRenderer.invoke('sftpbrowser:listLocal', path),
    upload:          (serverId, localPath, remotePath) => ipcRenderer.invoke('sftpbrowser:upload', serverId, localPath, remotePath),
    uploadFolder:    (serverId, localPath, remotePath) => ipcRenderer.invoke('sftpbrowser:uploadFolder', serverId, localPath, remotePath),
    download:        (serverId, remotePath, localPath) => ipcRenderer.invoke('sftpbrowser:download', serverId, remotePath, localPath),
    deleteRemote:    (serverId, path, isDir)           => ipcRenderer.invoke('sftpbrowser:deleteRemote', serverId, path, isDir),
    rename:          (serverId, oldPath, newPath)      => ipcRenderer.invoke('sftpbrowser:rename', serverId, oldPath, newPath),
    mkdir:           (serverId, path)                  => ipcRenderer.invoke('sftpbrowser:mkdir', serverId, path),
    readFile:        (serverId, path)                  => ipcRenderer.invoke('sftpbrowser:readFile', serverId, path),
    writeFile:       (serverId, path, content)         => ipcRenderer.invoke('sftpbrowser:writeFile', serverId, path, content),
    chmod:           (serverId, path, mode)            => ipcRenderer.invoke('sftpbrowser:chmod', serverId, path, mode),
    pickLocalFolder: ()                                => ipcRenderer.invoke('sftpbrowser:pickLocalFolder'),
    openLocalFolder: (path)                            => ipcRenderer.invoke('sftpbrowser:openLocalFolder', path),
    connectDirect:   (config)                          => ipcRenderer.invoke('sftpbrowser:connectDirect', config),
    removeTemp:      (id)                              => ipcRenderer.invoke('sftpbrowser:removeTemp', id),
  },

  cloud: {
    list:      ()             => ipcRenderer.invoke('cloud:list'),
    create:    (data)         => ipcRenderer.invoke('cloud:create', data),
    update:    (id, data)     => ipcRenderer.invoke('cloud:update', id, data),
    delete:    (id)           => ipcRenderer.invoke('cloud:delete', id),
    startAuth: (id)           => ipcRenderer.invoke('cloud:startAuth', id),
    browser: {
      list:     (id, path)               => ipcRenderer.invoke('cloud:browser:list', id, path),
      upload:   (id, localPath, remPath) => ipcRenderer.invoke('cloud:browser:upload', id, localPath, remPath),
      download: (id, remPath, localPath) => ipcRenderer.invoke('cloud:browser:download', id, remPath, localPath),
      delete:   (id, path, isDir)        => ipcRenderer.invoke('cloud:browser:delete', id, path, isDir),
      rename:   (id, from, to)           => ipcRenderer.invoke('cloud:browser:rename', id, from, to),
      mkdir:    (id, path)               => ipcRenderer.invoke('cloud:browser:mkdir', id, path),
    }
  },

  files: {
    createWindow: () => ipcRenderer.invoke('files:createWindow')
  },

  contextMenu: {
    isRegistered: () => ipcRenderer.invoke('contextmenu:isRegistered'),
    register: () => ipcRenderer.invoke('contextmenu:register'),
    unregister: () => ipcRenderer.invoke('contextmenu:unregister')
  },

  updater: {
    check:    () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install:  () => ipcRenderer.invoke('updater:install')
  },

  serverConfig: {
    export: ()       => ipcRenderer.invoke('serverConfig:export'),
    import: (json)   => ipcRenderer.invoke('serverConfig:import', json)
  },

  on: {
    syncProgress:            (cb) => subscribe('sync:progress',              cb as never),
    syncLog:                 (cb) => subscribe('sync:log',                   cb as never),
    syncComplete:            (cb) => subscribe('sync:complete',              cb as never),
    watcherEvent:            (cb) => subscribe('watcher:change',             cb as never),
    terminalData:            (cb) => subscribe('terminal:data',              cb as never),
    terminalClosed:          (cb) => subscribe('terminal:closed',            cb as never),
    uploadRequest:           (cb) => subscribe('upload:request',             cb as never),
    terminalSessionsUpdated: (cb) => subscribe('terminal:sessionsUpdated',   cb as never),
    updateProgress:          (cb) => subscribe('updater:progress',           cb as never)
  },

  off: {
    syncProgress:            (cb) => unsubscribe('sync:progress',            cb as never),
    syncLog:                 (cb) => unsubscribe('sync:log',                 cb as never),
    syncComplete:            (cb) => unsubscribe('sync:complete',            cb as never),
    watcherEvent:            (cb) => unsubscribe('watcher:change',           cb as never),
    terminalData:            (cb) => unsubscribe('terminal:data',            cb as never),
    terminalClosed:          (cb) => unsubscribe('terminal:closed',          cb as never),
    uploadRequest:           (cb) => unsubscribe('upload:request',           cb as never),
    terminalSessionsUpdated: (cb) => unsubscribe('terminal:sessionsUpdated', cb as never),
    updateProgress:          (cb) => unsubscribe('updater:progress',         cb as never)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
