import fs from 'fs'
import path from 'path'
import pLimit from 'p-limit'
import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow, Notification } from 'electron'
import type { Server, SyncSession, LocalFile, LogEntry } from '../../../shared/types'
import { sftpService, SftpConnection } from './sftp.service'
import { createIgnoreFilter, isIgnored } from './ignore.service'
import { computeLocalHash } from './hash.service'
import { backupService, BackupEntry } from './backup.service'
import { syncStateRepo } from '../db/repositories/syncstate.repo'
import { logRepo } from '../db/repositories/log.repo'
import { persistDb } from '../db/index'

// Active sessions keyed by sessionId
const activeSessions = new Map<string, { cancelled: boolean }>()

// Created remote directories per session (to avoid duplicate mkdir)
const createdDirs = new Map<string, Set<string>>()

function emit(win: BrowserWindow, channel: string, data: unknown): void {
  if (!win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

function makeLog(
  serverId: string,
  sessionId: string,
  level: LogEntry['level'],
  message: string,
  extras?: Partial<LogEntry>
): LogEntry {
  return {
    serverId,
    sessionId,
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extras
  }
}

function log(
  win: BrowserWindow,
  serverId: string,
  sessionId: string,
  level: LogEntry['level'],
  message: string,
  extras?: Partial<LogEntry>
): void {
  const entry = makeLog(serverId, sessionId, level, message, extras)
  logRepo.insert(entry)
  emit(win, 'sync:log', { entry })
}

// ─── Phase 1: Scan local files ─────────────────────────────────────────────

async function scanLocalFiles(
  basePath: string,
  ignorePatterns: string[]
): Promise<{ files: LocalFile[], emptyDirs: string[] }> {
  const ig = createIgnoreFilter(basePath, ignorePatterns)
  const files: LocalFile[] = []
  const emptyDirs: string[] = []

  async function walk(currentPath: string): Promise<void> {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    let hasVisibleContent = false

    for (const entry of entries) {
      const abs = path.join(currentPath, entry.name)
      const rel = path.relative(basePath, abs).replace(/\\/g, '/')

      if (isIgnored(ig, rel)) continue
      hasVisibleContent = true

      if (entry.isDirectory()) {
        await walk(abs)
      } else if (entry.isFile()) {
        const stats = fs.statSync(abs)
        files.push({
          relativePath: rel,
          absolutePath: abs,
          size: stats.size,
          mtime: Math.floor(stats.mtimeMs / 1000)
        })
      }
    }

    if (!hasVisibleContent && currentPath !== basePath) {
      emptyDirs.push(path.relative(basePath, currentPath).replace(/\\/g, '/'))
    }
  }

  await walk(basePath)
  return { files, emptyDirs }
}

// ─── Phase 2: Fast diff pass ───────────────────────────────────────────────

function fastPassDiff(
  serverId: string,
  localFiles: LocalFile[]
): { toUpload: LocalFile[]; needsHash: LocalFile[]; unchanged: LocalFile[] } {
  const toUpload: LocalFile[] = []
  const needsHash: LocalFile[] = []
  const unchanged: LocalFile[] = []

  for (const file of localFiles) {
    const state = syncStateRepo.findByServerAndPath(serverId, file.relativePath)

    if (!state) {
      // New file — never synced
      toUpload.push(file)
      continue
    }

    if (file.size !== state.localSize) {
      // Size changed — definitely upload
      toUpload.push(file)
      continue
    }

    if (file.mtime !== state.localMtime) {
      // Timestamp changed — need hash check to be sure
      needsHash.push(file)
      continue
    }

    unchanged.push(file)
  }

  return { toUpload, needsHash, unchanged }
}

// ─── Phase 3: Precise hash pass ────────────────────────────────────────────

async function precisePassDiff(
  serverId: string,
  files: LocalFile[]
): Promise<{ toUpload: LocalFile[]; unchanged: LocalFile[] }> {
  const toUpload: LocalFile[] = []
  const unchanged: LocalFile[] = []

  for (const file of files) {
    const localHash = await computeLocalHash(file.absolutePath)
    const state = syncStateRepo.findByServerAndPath(serverId, file.relativePath)

    if (!state || state.localHash !== localHash) {
      toUpload.push(file)
    } else {
      unchanged.push(file)
    }

    // Update local hash in state even if we won't upload
    if (state) {
      syncStateRepo.upsert({
        ...state,
        localSize: file.size,
        localMtime: file.mtime,
        localHash
      })
    }
  }

  return { toUpload, unchanged }
}

// ─── Phase 4: Upload ────────────────────────────────────────────────────────

async function uploadFiles(
  win: BrowserWindow,
  server: Server,
  session: SyncSession,
  filesToUpload: LocalFile[],
  isDryRun: boolean
): Promise<void> {
  const control = activeSessions.get(session.sessionId)
  if (!control) return

  const limit = pLimit(3)
  const sessionDirs = new Set<string>()
  createdDirs.set(session.sessionId, sessionDirs)

  const conn = isDryRun ? null : await sftpService.getConnection(server)
  const backupEntries: BackupEntry[] = []

  const tasks = filesToUpload.map((file) =>
    limit(async () => {
      if (control.cancelled) return

      session.currentFile = file.relativePath
      emit(win, 'sync:progress', { session: { ...session } })

      const remotePath = `${server.remotePath}/${file.relativePath}`.replace(/\/+/g, '/')

      if (isDryRun) {
        log(win, server.id, session.sessionId, 'info',
          `[Dry Run] Would upload: ${file.relativePath}`, { filePath: file.relativePath })
        session.uploadedFiles++
        return
      }

      try {
        // Ensure remote directory exists
        const remoteDir = remotePath.substring(0, remotePath.lastIndexOf('/'))
        if (!sessionDirs.has(remoteDir)) {
          await conn!.mkdir(remoteDir, true)
          sessionDirs.add(remoteDir)
        }

        // Backup remote file before overwriting
        if (server.backup) {
          try {
            const entry = await backupService.backupFile(
              conn!,
              server.id,
              session.sessionId,
              file.relativePath,
              remotePath
            )
            if (entry) backupEntries.push(entry)
          } catch (backupErr: unknown) {
            const msg = backupErr instanceof Error ? backupErr.message : String(backupErr)
            log(win, server.id, session.sessionId, 'warn',
              `Backup fehlgeschlagen für ${file.relativePath}: ${msg}`,
              { filePath: file.relativePath })
          }
        }

        // Upload — track incremental bytes to accumulate across all files
        let prevTransferred = 0
        await conn!.put(file.absolutePath, remotePath, (transferred, _total) => {
          if (control.cancelled) return
          const delta = transferred - prevTransferred
          prevTransferred = transferred
          session.uploadedBytes = (session.uploadedBytes ?? 0) + delta
          emit(win, 'sync:progress', { session: { ...session } })
        })

        // Get remote stat after upload for SyncState
        const remoteStat = await conn!.stat(remotePath)
        const localHash = await computeLocalHash(file.absolutePath)

        syncStateRepo.upsert({
          serverId: server.id,
          relativePath: file.relativePath,
          localSize: file.size,
          localMtime: file.mtime,
          localHash,
          remoteSize: remoteStat?.size ?? file.size,
          remoteMtime: remoteStat?.mtime ?? file.mtime,
          remoteHash: null,
          lastSyncedAt: new Date().toISOString(),
          status: 'synced'
        })

        log(win, server.id, session.sessionId, 'info',
          `Uploaded: ${file.relativePath} (${(file.size / 1024).toFixed(1)} KB)`,
          { filePath: file.relativePath, bytesTransferred: file.size })

        session.uploadedFiles++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        log(win, server.id, session.sessionId, 'error',
          `Failed: ${file.relativePath} — ${msg}`,
          { filePath: file.relativePath })
        session.errorFiles++
      }

      emit(win, 'sync:progress', { session: { ...session } })
    })
  )

  await Promise.all(tasks)

  // Persist backup session if any files were backed up
  if (server.backup && backupEntries.length > 0) {
    try {
      await backupService.saveSession(server.id, server.name, session.sessionId, backupEntries)
      log(win, server.id, session.sessionId, 'info',
        `Backup gespeichert: ${backupEntries.length} Datei(en)`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log(win, server.id, session.sessionId, 'warn', `Backup-Manifest Fehler: ${msg}`)
    }
  }

  createdDirs.delete(session.sessionId)
}

// ─── Post-Deploy SSH command ───────────────────────────────────────────────

async function runPostDeployCommand(
  win: BrowserWindow,
  server: Server,
  sessionId: string
): Promise<void> {
  if (!server.postDeployCommand?.trim()) return

  log(win, server.id, sessionId, 'info', `Post-Deploy: ${server.postDeployCommand}`)

  return new Promise((resolve) => {
    const conn = sftpService.getRawClient(server.id)
    if (!conn) {
      log(win, server.id, sessionId, 'warn', 'Post-Deploy: Keine aktive Verbindung')
      return resolve()
    }

    conn.exec(server.postDeployCommand!, (err, stream) => {
      if (err) {
        log(win, server.id, sessionId, 'warn', `Post-Deploy Fehler: ${err.message}`)
        return resolve()
      }

      let output = ''
      stream.on('data', (chunk: Buffer) => { output += chunk.toString() })
      stream.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
      stream.on('close', () => {
        const lines = output.trim().split('\n').filter(Boolean)
        lines.forEach((line) => log(win, server.id, sessionId, 'info', `  > ${line}`))
        if (!lines.length) log(win, server.id, sessionId, 'info', 'Post-Deploy: Befehl ausgeführt')
        resolve()
      })
    })
  })
}

// ─── Main entry ────────────────────────────────────────────────────────────

export async function startSync(
  win: BrowserWindow,
  server: Server,
  options: {
    isDryRun?: boolean
    deletedLocalPaths?: string[]
    deletedLocalDirs?: string[]
    onComplete?: (session: SyncSession) => void
  } = {}
): Promise<string> {
  const sessionId = uuidv4()
  const isDryRun = options.isDryRun ?? false
  const deletedLocalPaths = options.deletedLocalPaths ?? []
  const deletedLocalDirs = options.deletedLocalDirs ?? []
  const { onComplete } = options

  const session: SyncSession = {
    sessionId,
    serverId: server.id,
    isDryRun,
    status: 'connecting',
    totalFiles: 0,
    changedFiles: 0,
    uploadedFiles: 0,
    skippedFiles: 0,
    errorFiles: 0,
    totalBytes: 0,
    uploadedBytes: 0,
    deletedFiles: 0,
    startedAt: Date.now()
  }

  activeSessions.set(sessionId, { cancelled: false })

  // Run async without blocking the IPC return
  ;(async () => {
    try {
      log(win, server.id, sessionId, 'info',
        isDryRun ? 'Dry Run gestartet' : 'Sync gestartet')

      // Verbindung testen
      if (!isDryRun) {
        session.status = 'connecting'
        emit(win, 'sync:progress', { session: { ...session } })
        await sftpService.getConnection(server)
        log(win, server.id, sessionId, 'info', `Verbunden mit ${server.host}:${server.port}`)
      }

      // Phase 1: Scan
      session.status = 'scanning'
      emit(win, 'sync:progress', { session: { ...session } })
      log(win, server.id, sessionId, 'info', 'Scanne lokale Dateien...')

      const { files: localFiles, emptyDirs } = await scanLocalFiles(server.localPath, server.ignorePatterns)
      session.totalFiles = localFiles.length
      session.totalBytes = localFiles.reduce((s, f) => s + f.size, 0)
      log(win, server.id, sessionId, 'info', `${localFiles.length} Dateien gefunden${emptyDirs.length > 0 ? `, ${emptyDirs.length} leere Ordner` : ''}`)

      // Phase 2: Fast pass
      const { toUpload: directUpload, needsHash, unchanged } = fastPassDiff(server.id, localFiles)
      session.skippedFiles = unchanged.length
      log(win, server.id, sessionId, 'info',
        `Fast-Pass: ${directUpload.length} neu/geändert, ${needsHash.length} Hash-Prüfung, ${unchanged.length} unverändert`)

      // Phase 3: Hash pass
      let finalUpload = directUpload
      if (needsHash.length > 0) {
        session.status = 'hashing'
        emit(win, 'sync:progress', { session: { ...session } })
        log(win, server.id, sessionId, 'info', `Hash-Prüfung für ${needsHash.length} Dateien...`)
        const { toUpload: hashUpload, unchanged: hashUnchanged } = await precisePassDiff(server.id, needsHash)
        finalUpload = [...directUpload, ...hashUpload]
        session.skippedFiles += hashUnchanged.length
        log(win, server.id, sessionId, 'info',
          `Hash-Pass: ${hashUpload.length} geändert, ${hashUnchanged.length} unverändert`)
      }

      session.changedFiles = finalUpload.length
      log(win, server.id, sessionId, 'info',
        `${finalUpload.length} Dateien werden ${isDryRun ? 'simuliert' : 'hochgeladen'}`)

      // Phase 4: Upload
      session.status = 'uploading'
      emit(win, 'sync:progress', { session: { ...session } })

      await uploadFiles(win, server, session, finalUpload, isDryRun)

      // Phase 4b: Create empty remote directories
      if (!isDryRun && emptyDirs.length > 0) {
        const conn = await sftpService.getConnection(server)
        for (const relDir of emptyDirs) {
          const remoteDirPath = `${server.remotePath}/${relDir}`.replace(/\/+/g, '/')
          try {
            await conn.mkdir(remoteDirPath, true)
            log(win, server.id, sessionId, 'info', `Ordner erstellt: ${relDir}`)
          } catch {
            // Directory may already exist — not an error
          }
        }
      } else if (isDryRun && emptyDirs.length > 0) {
        for (const relDir of emptyDirs) {
          log(win, server.id, sessionId, 'info', `[Dry Run] Würde Ordner erstellen: ${relDir}`)
        }
      }

      // Phase 5: Delete remote files/dirs for locally deleted paths
      if (server.deleteOrphans && !isDryRun) {
        if (deletedLocalPaths.length > 0) {
          const conn = await sftpService.getConnection(server)
          const parentDirsToCheck = new Set<string>()
          for (const absPath of deletedLocalPaths) {
            const relativePath = path.relative(server.localPath, absPath).replace(/\\/g, '/')
            const remotePath = `${server.remotePath}/${relativePath}`.replace(/\/+/g, '/')
            try {
              await conn.delete(remotePath)
              syncStateRepo.deleteByServerAndPath(server.id, relativePath)
              log(win, server.id, sessionId, 'info',
                `Gelöscht: ${relativePath}`, { filePath: relativePath })
              session.deletedFiles++
              emit(win, 'sync:progress', { session: { ...session } })
              // Collect parent dir for empty-dir cleanup below
              const parentRemote = remotePath.substring(0, remotePath.lastIndexOf('/'))
              if (parentRemote && parentRemote !== server.remotePath) {
                parentDirsToCheck.add(parentRemote)
              }
            } catch {
              log(win, server.id, sessionId, 'debug',
                `Remote nicht vorhanden (skip): ${relativePath}`, { filePath: relativePath })
            }
          }
          // Remove remote dirs that became empty after file deletions (deepest first)
          const sortedParents = [...parentDirsToCheck].sort((a, b) => b.length - a.length)
          for (const dir of sortedParents) {
            try {
              await conn.rmdir(dir, false)  // non-recursive — only removes if empty
              log(win, server.id, sessionId, 'debug', `Leerer Ordner entfernt: ${dir}`)
            } catch {
              // Not empty or doesn't exist — skip silently
            }
          }
        }
        if (deletedLocalDirs.length > 0) {
          const conn = await sftpService.getConnection(server)
          for (const absPath of deletedLocalDirs) {
            const relativePath = path.relative(server.localPath, absPath).replace(/\\/g, '/')
            const remotePath = `${server.remotePath}/${relativePath}`.replace(/\/+/g, '/')
            try {
              await conn.rmdir(remotePath, true)
              log(win, server.id, sessionId, 'info',
                `Ordner gelöscht: ${relativePath}`, { filePath: relativePath })
              session.deletedFiles++
              emit(win, 'sync:progress', { session: { ...session } })
            } catch {
              log(win, server.id, sessionId, 'debug',
                `Remote-Ordner nicht vorhanden (skip): ${relativePath}`, { filePath: relativePath })
            }
          }
        }
      } else if (server.deleteOrphans && isDryRun) {
        for (const absPath of [...deletedLocalPaths, ...deletedLocalDirs]) {
          const relativePath = path.relative(server.localPath, absPath).replace(/\\/g, '/')
          log(win, server.id, sessionId, 'info',
            `[Dry Run] Würde löschen: ${relativePath}`, { filePath: relativePath })
        }
      }

      const control = activeSessions.get(sessionId)
      if (control?.cancelled) {
        session.status = 'cancelled'
        log(win, server.id, sessionId, 'warn', 'Sync abgebrochen')
      } else {
        // Post-deploy command
        if (!isDryRun) {
          await runPostDeployCommand(win, server, sessionId)
        }

        session.status = isDryRun ? 'dry_run_done' : 'done'
        const duration = ((Date.now() - session.startedAt) / 1000).toFixed(1)
        log(win, server.id, sessionId, 'info',
          `Sync abgeschlossen in ${duration}s — ${session.uploadedFiles} hochgeladen, ${session.deletedFiles} gelöscht, ${session.errorFiles} Fehler`)

        // Windows toast notification
        if (!isDryRun && Notification.isSupported()) {
          new Notification({
            title: `✓ ${server.name} synchronisiert`,
            body: `${session.uploadedFiles} Datei(en) hochgeladen in ${duration}s`
          }).show()
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      session.status = 'error'
      session.error = msg
      log(win, server.id, sessionId, 'error', `Sync-Fehler: ${msg}`)
    } finally {
      session.finishedAt = Date.now()
      persistDb()
      emit(win, 'sync:complete', session)
      activeSessions.delete(sessionId)
      if (!isDryRun) {
        await sftpService.disconnect(server.id)
      }
      onComplete?.(session)
    }
  })()

  return sessionId
}

export function cancelSync(sessionId: string): boolean {
  const control = activeSessions.get(sessionId)
  if (!control) return false
  control.cancelled = true
  return true
}
