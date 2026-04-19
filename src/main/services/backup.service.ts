import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { SftpConnection } from './sftp.service'

export interface BackupEntry {
  serverId: string
  sessionId: string
  relativePath: string
  backupPath: string   // absolute local path to backup file
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

const BACKUP_DIR = (): string => path.join(app.getPath('userData'), 'backups')
const MANIFEST_FILE = (serverId: string): string =>
  path.join(BACKUP_DIR(), serverId, 'manifest.json')

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readManifest(serverId: string): BackupSession[] {
  const file = MANIFEST_FILE(serverId)
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
}

function writeManifest(serverId: string, sessions: BackupSession[]): void {
  const file = MANIFEST_FILE(serverId)
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(sessions, null, 2))
}

export const backupService = {
  // Download remote file and store locally before overwriting
  async backupFile(
    conn: SftpConnection,
    serverId: string,
    sessionId: string,
    relativePath: string,
    remotePath: string
  ): Promise<BackupEntry | null> {
    try {
      const stat = await conn.stat(remotePath)
      if (!stat || stat.isDirectory) return null

      const now = new Date().toISOString()
      const safeRelPath = relativePath.replace(/[/\\:*?"<>|]/g, '_')
      const backupDir = path.join(BACKUP_DIR(), serverId, sessionId)
      ensureDir(backupDir)

      const backupPath = path.join(backupDir, safeRelPath)
      ensureDir(path.dirname(backupPath))

      // Download file
      await conn.get(remotePath, backupPath)

      return {
        serverId,
        sessionId,
        relativePath,
        backupPath,
        createdAt: now,
        originalSize: stat.size
      }
    } catch {
      // File might not exist on remote yet — that's fine, nothing to backup
      return null
    }
  },

  // Finalize and persist a backup session
  saveSession(
    serverId: string,
    serverName: string,
    sessionId: string,
    entries: BackupEntry[]
  ): void {
    if (entries.length === 0) return

    const sessions = readManifest(serverId)
    sessions.unshift({
      sessionId,
      serverId,
      serverName,
      createdAt: new Date().toISOString(),
      entries
    })

    // Keep only last 10 sessions per server
    const toDelete = sessions.splice(10)
    for (const old of toDelete) {
      const dir = path.join(BACKUP_DIR(), serverId, old.sessionId)
      fs.rmSync(dir, { recursive: true, force: true })
    }

    writeManifest(serverId, sessions)
  },

  listSessions(serverId: string): BackupSession[] {
    return readManifest(serverId)
  },

  // Restore a single file from backup
  async restoreFile(
    conn: SftpConnection,
    entry: BackupEntry,
    remotePath: string
  ): Promise<void> {
    if (!fs.existsSync(entry.backupPath)) {
      throw new Error(`Backup-Datei nicht gefunden: ${entry.backupPath}`)
    }
    await conn.put(entry.backupPath, remotePath)
  },

  // Restore all files from a session
  async restoreSession(
    conn: SftpConnection,
    session: BackupSession,
    remoteBasePath: string
  ): Promise<{ restored: number; failed: string[] }> {
    let restored = 0
    const failed: string[] = []

    for (const entry of session.entries) {
      try {
        const remotePath = `${remoteBasePath}/${entry.relativePath}`.replace(/\/+/g, '/')
        await this.restoreFile(conn, entry, remotePath)
        restored++
      } catch (err) {
        failed.push(`${entry.relativePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return { restored, failed }
  },

  deleteSession(serverId: string, sessionId: string): void {
    const sessions = readManifest(serverId)
    const idx = sessions.findIndex((s) => s.sessionId === sessionId)
    if (idx === -1) return

    const dir = path.join(BACKUP_DIR(), serverId, sessionId)
    fs.rmSync(dir, { recursive: true, force: true })
    sessions.splice(idx, 1)
    writeManifest(serverId, sessions)
  }
}
