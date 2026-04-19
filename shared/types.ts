// ─── Server ───────────────────────────────────────────────────────────────────

export interface Server {
  id: string
  name: string
  projectName: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  encryptedPassword?: string
  encryptedPrivateKey?: string
  encryptedPassphrase?: string
  localPath: string
  remotePath: string
  ignorePatterns: string[]
  autoWatch: boolean
  deleteOrphans: boolean
  backup: boolean
  createdAt: string
  updatedAt: string
}

export type ServerFormData = Omit<
  Server,
  'id' | 'encryptedPassword' | 'encryptedPrivateKey' | 'encryptedPassphrase' | 'createdAt' | 'updatedAt'
> & {
  password?: string
  privateKey?: string
  passphrase?: string
}

// ─── SyncState ────────────────────────────────────────────────────────────────

export interface SyncState {
  id?: number
  serverId: string
  relativePath: string
  localSize: number
  localMtime: number     // Unix seconds
  localHash: string
  remoteSize: number
  remoteMtime: number    // Unix seconds
  remoteHash: string | null
  lastSyncedAt: string
  status: 'synced' | 'pending' | 'error'
}

// ─── Log ──────────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id?: number
  serverId: string
  sessionId: string
  level: LogLevel
  message: string
  filePath?: string
  bytesTransferred?: number
  timestamp: string
}

// ─── SyncSession (in-memory) ──────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'
  | 'connecting'
  | 'scanning'
  | 'hashing'
  | 'uploading'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'dry_run_done'

export interface SyncSession {
  sessionId: string
  serverId: string
  isDryRun: boolean
  status: SyncStatus
  totalFiles: number
  changedFiles: number
  uploadedFiles: number
  skippedFiles: number
  errorFiles: number
  totalBytes: number
  uploadedBytes: number
  deletedFiles: number
  startedAt: number
  finishedAt?: number
  currentFile?: string
  error?: string
}

// ─── Diff Result (internal) ───────────────────────────────────────────────────

export type FileChangeStatus = 'new' | 'changed' | 'unchanged' | 'needs_hash'

export interface LocalFile {
  relativePath: string
  absolutePath: string
  size: number
  mtime: number     // Unix seconds
}

export interface DiffResult {
  changed: LocalFile[]
  unchanged: LocalFile[]
}

// ─── File Tree ────────────────────────────────────────────────────────────────

export interface FileEntry {
  relativePath: string
  isDirectory: boolean
  children?: FileEntry[]
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSettings {
  encryptionSalt: string
  theme: 'light' | 'dark' | 'system'
  defaultPort: number
  logRetentionDays: number
  maxConcurrentUploads: number
  hashLargeFileThresholdMB: number
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export interface BackupEntry {
  serverId: string
  sessionId: string
  relativePath: string
  backupPath: string
  createdAt: string
  originalSize: number
}

export interface BackupSession {
  sessionId: string
  serverId: string
  serverName: string
  createdAt: string
  entries: BackupEntry[]
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

export interface TerminalConnectConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface TerminalSessionInfo {
  sessionId: string
  label: string
  startedAt: number   // Date.now() ms
  windowId: number    // BrowserWindow.id
}

// ─── SFTP File Browser ───────────────────────────────────────────────────────

export interface SftpEntry {
  name: string
  fullPath: string
  isDirectory: boolean
  size: number
  mtime: number        // Unix seconds
  permissions: number  // octal e.g. 0o755
}

export interface LocalEntry {
  name: string
  fullPath: string
  isDirectory: boolean
  size: number
  mtime: number  // Unix seconds
}

// ─── Server Info ──────────────────────────────────────────────────────────────

export interface ServerInfo {
  os: string
  hostname: string
  kernel: string
  arch: string
  uptime: string
  cpu: string
  cpuCores: number | null
  memTotal: string
  memUsed: string
  memFree: string
  memPercent: number | null
  diskTotal: string
  diskUsed: string
  diskPercent: string
  user: string
  shell: string
  load: string
}

// ─── Cloud Storage ────────────────────────────────────────────────────────────

export type CloudConnectionType = 'webdav' | 'gdrive' | 'dropbox' | 'onedrive'

export interface CloudConnection {
  id: string
  type: CloudConnectionType
  name: string
  webdavUrl?: string
  webdavUsername?: string
  clientId?: string
  hasTokens: boolean
  createdAt: string
}

export interface CloudConnectionFormData {
  type: CloudConnectionType
  name: string
  webdavUrl?: string
  webdavUsername?: string
  webdavPassword?: string
  clientId?: string
  clientSecret?: string
}

export interface CloudFile {
  name: string
  fullPath: string
  isDirectory: boolean
  size: number
  mtime: number
}

// ─── Updater ──────────────────────────────────────────────────────────────────

export interface UpdateInfo {
  version: string
  tagName: string
  changelog: string
  publishedAt: string
  downloadUrl: string
}

export interface UpdateProgress {
  percent: number
  bytesReceived: number
  totalBytes: number
}

// ─── IPC Response Wrapper ─────────────────────────────────────────────────────

export interface IpcResponse<T = undefined> {
  ok: boolean
  data?: T
  error?: string
}

// ─── Push event payloads ──────────────────────────────────────────────────────

export interface SyncProgressEvent {
  session: SyncSession
}

export interface SyncLogEvent {
  entry: LogEntry
}

export interface WatcherEvent {
  serverId: string
  path: string
  event: 'add' | 'change' | 'unlink'
}

// ─── Window API (exposed via contextBridge) ───────────────────────────────────

export interface ElectronAPI {
  servers: {
    list: () => Promise<IpcResponse<Server[]>>
    create: (data: ServerFormData) => Promise<IpcResponse<Server>>
    update: (id: string, data: Partial<ServerFormData>) => Promise<IpcResponse<Server>>
    delete: (id: string) => Promise<IpcResponse>
    testConnection: (id: string) => Promise<IpcResponse<{ ms: number }>>
    testNewConnection: (data: ServerFormData) => Promise<IpcResponse<{ ms: number }>>
    setWatch: (id: string, active: boolean) => Promise<IpcResponse>
    ping: (id: string) => Promise<IpcResponse<{ ms: number }>>
    info: (id: string) => Promise<IpcResponse<ServerInfo>>
  }
  sync: {
    start: (serverId: string, options?: { isDryRun?: boolean }) => Promise<IpcResponse<{ sessionId: string }>>
    cancel: (sessionId: string) => Promise<IpcResponse>
  }
  logs: {
    getHistory: (serverId: string, limit?: number) => Promise<IpcResponse<LogEntry[]>>
    clearHistory: (serverId: string) => Promise<IpcResponse>
  }
  fs: {
    pickFolder: () => Promise<IpcResponse<string>>
    pickKeyFile: () => Promise<IpcResponse<string>>
    readKeyFile: (path: string) => Promise<IpcResponse<string>>
    listFiles: (folderPath: string) => Promise<IpcResponse<FileEntry[]>>
    getTempDir: () => Promise<IpcResponse<string>>
  }
  settings: {
    get: () => Promise<IpcResponse<AppSettings>>
    update: (data: Partial<AppSettings>) => Promise<IpcResponse<AppSettings>>
  }
  backup: {
    listSessions: (serverId: string) => Promise<IpcResponse<BackupSession[]>>
    restoreSession: (serverId: string, sessionId: string) => Promise<IpcResponse<{ restored: number; failed: string[] }>>
    deleteSession: (serverId: string, sessionId: string) => Promise<IpcResponse>
  }
  terminal: {
    open: (serverId: string) => Promise<IpcResponse<{ sessionId: string }>>
    openDirect: (config: TerminalConnectConfig, label?: string) => Promise<IpcResponse<{ sessionId: string }>>
    write: (sessionId: string, data: string) => void
    resize: (sessionId: string, cols: number, rows: number) => void
    close: (sessionId: string) => void
    createWindow: () => Promise<IpcResponse<{ windowId: number }>>
    getSessions: () => Promise<IpcResponse<TerminalSessionInfo[]>>
  }
  sftpBrowser: {
    list: (serverId: string, path: string) => Promise<IpcResponse<SftpEntry[]>>
    listLocal: (path: string) => Promise<IpcResponse<LocalEntry[]>>
    upload: (serverId: string, localPath: string, remotePath: string) => Promise<IpcResponse>
    uploadFolder: (serverId: string, localPath: string, remotePath: string) => Promise<IpcResponse>
    download: (serverId: string, remotePath: string, localPath: string) => Promise<IpcResponse>
    deleteRemote: (serverId: string, path: string, isDirectory: boolean) => Promise<IpcResponse>
    rename: (serverId: string, oldPath: string, newPath: string) => Promise<IpcResponse>
    mkdir: (serverId: string, path: string) => Promise<IpcResponse>
    readFile: (serverId: string, path: string) => Promise<IpcResponse<string>>
    writeFile: (serverId: string, path: string, content: string) => Promise<IpcResponse>
    chmod: (serverId: string, path: string, mode: number) => Promise<IpcResponse>
    pickLocalFolder: () => Promise<IpcResponse<string>>
    openLocalFolder: (path: string) => Promise<IpcResponse>
    connectDirect: (config: { host: string; port: number; username: string; password?: string; authType: 'password' | 'key' }) => Promise<IpcResponse<string>>
    removeTemp: (id: string) => Promise<IpcResponse>
  }
  files: {
    createWindow: () => Promise<IpcResponse<{ windowId: number }>>
  }
  cloud: {
    list: () => Promise<IpcResponse<CloudConnection[]>>
    create: (data: CloudConnectionFormData) => Promise<IpcResponse<CloudConnection>>
    update: (id: string, data: Partial<CloudConnectionFormData>) => Promise<IpcResponse<CloudConnection>>
    delete: (id: string) => Promise<IpcResponse>
    startAuth: (id: string) => Promise<IpcResponse>
    browser: {
      list: (id: string, path: string) => Promise<IpcResponse<CloudFile[]>>
      upload: (id: string, localPath: string, remotePath: string) => Promise<IpcResponse>
      download: (id: string, remotePath: string, localPath: string) => Promise<IpcResponse>
      delete: (id: string, path: string, isDir: boolean) => Promise<IpcResponse>
      rename: (id: string, from: string, to: string) => Promise<IpcResponse>
      mkdir: (id: string, path: string) => Promise<IpcResponse>
    }
  }
  contextMenu: {
    isRegistered: () => Promise<IpcResponse<boolean>>
    register: () => Promise<IpcResponse>
    unregister: () => Promise<IpcResponse>
  }
  updater: {
    check: () => Promise<IpcResponse<UpdateInfo | null>>
    download: () => Promise<IpcResponse>
    install: () => Promise<IpcResponse>
  }
  on: {
    syncProgress: (cb: (data: SyncProgressEvent) => void) => void
    syncLog: (cb: (data: SyncLogEvent) => void) => void
    syncComplete: (cb: (session: SyncSession) => void) => void
    watcherEvent: (cb: (data: WatcherEvent) => void) => void
    terminalData: (cb: (data: { sessionId: string; data: string }) => void) => void
    terminalClosed: (cb: (data: { sessionId: string }) => void) => void
    uploadRequest: (cb: (data: { path: string }) => void) => void
    terminalSessionsUpdated: (cb: (sessions: TerminalSessionInfo[]) => void) => void
    updateProgress: (cb: (data: UpdateProgress) => void) => void
  }
  off: {
    syncProgress: (cb: (data: SyncProgressEvent) => void) => void
    syncLog: (cb: (data: SyncLogEvent) => void) => void
    syncComplete: (cb: (session: SyncSession) => void) => void
    watcherEvent: (cb: (data: WatcherEvent) => void) => void
    terminalData: (cb: (data: { sessionId: string; data: string }) => void) => void
    terminalClosed: (cb: (data: { sessionId: string }) => void) => void
    uploadRequest: (cb: (data: { path: string }) => void) => void
    terminalSessionsUpdated: (cb: (sessions: TerminalSessionInfo[]) => void) => void
    updateProgress: (cb: (data: UpdateProgress) => void) => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
