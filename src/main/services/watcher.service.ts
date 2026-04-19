import fs from 'fs'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow, Notification } from 'electron'
import type { Server } from '../../../shared/types'
import { startSync } from './sync.service'
import { serverRepo } from '../db/repositories/server.repo'
import { syncStateRepo } from '../db/repositories/syncstate.repo'
import { sftpService } from './sftp.service'

interface WatchEntry {
  watcher: FSWatcher
  serverId: string
  debounceTimer: ReturnType<typeof setTimeout> | null
  pendingPaths: Set<string>
  pendingDeletes: Set<string>     // absolute paths of deleted files
  pendingDeleteDirs: Set<string>  // absolute paths of deleted directories
  reverseTimer: ReturnType<typeof setInterval> | null
}

// Active watchers keyed by serverId
const watchers = new Map<string, WatchEntry>()

const DEBOUNCE_MS = 2000
const REVERSE_INTERVAL_MS = 30000

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function removeEmptyDirs(basePath: string): void {
  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) { if (e.isDirectory()) walk(path.join(dir, e.name)) }
    try {
      if (dir !== basePath && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
    } catch { /* ignore */ }
  }
  walk(basePath)
}

export const watcherService = {
  start(server: Server): void {
    if (watchers.has(server.id)) return  // already watching

    const watcher = chokidar.watch(server.localPath, {
      ignored: /(^|[/\\])\../,  // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    })

    const entry: WatchEntry = {
      watcher,
      serverId: server.id,
      debounceTimer: null,
      pendingPaths: new Set(),
      pendingDeletes: new Set(),
      pendingDeleteDirs: new Set(),
      reverseTimer: null
    }

    const triggerSync = async () => {
      const win = getMainWindow()
      if (!win) return
      const freshServer = serverRepo.findById(server.id)
      if (!freshServer || !freshServer.autoWatch) return

      const paths = [...entry.pendingPaths]
      const deletedPaths = [...entry.pendingDeletes]
      const deletedDirPaths = [...entry.pendingDeleteDirs]
      entry.pendingPaths.clear()
      entry.pendingDeletes.clear()
      entry.pendingDeleteDirs.clear()
      entry.debounceTimer = null

      console.log(`[Watcher] Auto-sync triggered for ${freshServer.name} (${paths.length} changes, ${deletedPaths.length} file deletions, ${deletedDirPaths.length} dir deletions)`)
      await startSync(win, freshServer, {
        deletedLocalPaths: deletedPaths,
        deletedLocalDirs: deletedDirPaths,
        onComplete: (session) => {
          if (!Notification.isSupported()) return
          if (session.status === 'done') {
            const deleted = session.deletedFiles ?? 0
            const parts = []
            if (session.uploadedFiles > 0) parts.push(`${session.uploadedFiles} hochgeladen`)
            if (deleted > 0) parts.push(`${deleted} gelöscht`)
            new Notification({
              title: freshServer.name,
              body: `Auto-Sync: ${parts.join(', ') || 'keine Änderungen'}`
            }).show()
          } else if (session.status === 'error') {
            new Notification({
              title: `${freshServer.name} — Sync-Fehler`,
              body: session.error ?? 'Unbekannter Fehler'
            }).show()
          }
        }
      })
    }

    const scheduleSync = () => {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
      entry.debounceTimer = setTimeout(triggerSync, DEBOUNCE_MS)
    }

    const handleChange = (eventType: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir', filePath: string) => {
      if (eventType === 'unlink') {
        entry.pendingDeletes.add(filePath)
      } else if (eventType === 'unlinkDir') {
        entry.pendingDeleteDirs.add(filePath)
      } else {
        entry.pendingPaths.add(filePath)
      }

      // Notify renderer
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('watcher:change', {
          serverId: server.id,
          path: filePath,
          event: eventType === 'unlinkDir' ? 'unlink' : eventType === 'addDir' ? 'add' : eventType
        })
      }

      scheduleSync()
    }

    watcher
      .on('add',       (p) => handleChange('add', p))
      .on('change',    (p) => handleChange('change', p))
      .on('unlink',    (p) => handleChange('unlink', p))
      .on('addDir',    (p) => handleChange('addDir', p))
      .on('unlinkDir', (p) => handleChange('unlinkDir', p))
      .on('error', (err) => console.error(`[Watcher] Error for ${server.name}:`, err))

    watchers.set(server.id, entry)

    // Catch-up sync: detect all changes made while watcher was inactive
    setTimeout(async () => {
      if (!watchers.has(server.id)) return  // watcher was stopped before timeout fired
      const freshServer = serverRepo.findById(server.id)
      if (!freshServer || !freshServer.autoWatch) return
      const win = getMainWindow()
      if (!win) return
      console.log(`[Watcher] Catch-up sync on activation for "${freshServer.name}"`)
      await startSync(win, freshServer, {
        onComplete: (session) => {
          if (!Notification.isSupported()) return
          if (session.status === 'done' && (session.uploadedFiles > 0 || (session.deletedFiles ?? 0) > 0)) {
            const parts = []
            if (session.uploadedFiles > 0) parts.push(`${session.uploadedFiles} hochgeladen`)
            if ((session.deletedFiles ?? 0) > 0) parts.push(`${session.deletedFiles} gelöscht`)
            new Notification({
              title: freshServer.name,
              body: `Catch-up Sync: ${parts.join(', ')}`
            }).show()
          }
        }
      })
    }, 1000)
    // Reverse sync: detect remote deletions and delete matching local files
    const checkRemoteDeletions = async () => {
      const freshServer = serverRepo.findById(server.id)
      if (!freshServer || !freshServer.autoWatch) return
      try {
        const conn = await sftpService.getConnection(freshServer)
        const remoteFiles = await conn.listAll(freshServer.remotePath)
        const remoteSet = new Set(remoteFiles.map(f => f.relativePath))

        const toDelete = syncStateRepo
          .listByServer(freshServer.id)
          .filter(s => s.status === 'synced' && !remoteSet.has(s.relativePath))

        if (!toDelete.length) return

        console.log(`[Watcher] Reverse sync: ${toDelete.length} remote deletion(s) for "${freshServer.name}"`)
        let deleted = 0
        for (const state of toDelete) {
          const absPath = path.join(freshServer.localPath, state.relativePath)
          try {
            if (fs.existsSync(absPath)) { fs.unlinkSync(absPath); deleted++ }
            syncStateRepo.deleteByServerAndPath(freshServer.id, state.relativePath)
          } catch (err) {
            console.error(`[Watcher] Could not delete local file ${state.relativePath}:`, err)
          }
        }

        removeEmptyDirs(freshServer.localPath)

        if (deleted > 0 && Notification.isSupported()) {
          new Notification({
            title: freshServer.name,
            body: `Remote-Sync: ${deleted} lokal gelöscht`
          }).show()
        }
      } catch (err) {
        console.error(`[Watcher] Reverse sync error for "${server.name}":`, err)
      }
    }

    entry.reverseTimer = setInterval(checkRemoteDeletions, REVERSE_INTERVAL_MS)

    console.log(`[Watcher] Started watching ${server.localPath} for server "${server.name}"`)
  },

  stop(serverId: string): void {
    const entry = watchers.get(serverId)
    if (!entry) return

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    if (entry.reverseTimer) clearInterval(entry.reverseTimer)
    entry.watcher.close()
    watchers.delete(serverId)
    console.log(`[Watcher] Stopped watching server ${serverId}`)
  },

  stopAll(): void {
    for (const [id] of watchers) {
      this.stop(id)
    }
  },

  isWatching(serverId: string): boolean {
    return watchers.has(serverId)
  },

  // Sync watcher state with server's autoWatch flag
  syncWithServer(server: Server): void {
    if (server.autoWatch && !this.isWatching(server.id)) {
      this.start(server)
    } else if (!server.autoWatch && this.isWatching(server.id)) {
      this.stop(server.id)
    }
  },

  // Called on app start: start watchers for all autoWatch servers
  initAll(): void {
    const servers = serverRepo.list()
    for (const server of servers) {
      if (server.autoWatch) {
        this.start(server)
      }
    }
    console.log(`[Watcher] Initialized ${watchers.size} file watcher(s)`)
  }
}
