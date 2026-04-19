import React, { useEffect, useState } from 'react'
import type { Server } from '../../../../shared/types'
import { useServerStore } from '../../store/server.store'
import { useSyncStore } from '../../store/sync.store'
import { useUIStore } from '../../store/ui.store'
import ServerTile from './ServerTile'
import ServerDialog from '../server/ServerDialog'
import SyncPanel from '../sync/SyncPanel'

export default function ServerGrid(): React.ReactElement {
  const { servers, fetchServers } = useServerStore()
  const { setView, setSelectedServer } = useUIStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editServer, setEditServer] = useState<Server | undefined>()
  const [syncPanelServerId, setSyncPanelServerId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Server | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  const handleSync = async (server: Server, isDryRun = false) => {
    setSyncPanelServerId(server.id)
    const res = await window.electronAPI.sync.start(server.id, { isDryRun })
    if (res.ok && res.data) {
      useSyncStore.getState().setActiveSession(res.data.sessionId)
    }
  }

  const handleSyncAll = async () => {
    if (syncingAll || servers.length === 0) return
    setSyncingAll(true)
    for (const server of servers) {
      const res = await window.electronAPI.sync.start(server.id, { isDryRun: false })
      if (res.ok && res.data) {
        useSyncStore.getState().setActiveSession(res.data.sessionId)
      }
    }
    setSyncingAll(false)
  }

  const handleDelete = (server: Server) => {
    setDeleteConfirm(server)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    const res = await window.electronAPI.servers.delete(deleteConfirm.id)
    if (res.ok) useServerStore.getState().removeServer(deleteConfirm.id)
    setDeleteConfirm(null)
  }

  const handleEdit = (server: Server) => {
    setEditServer(server)
    setDialogOpen(true)
  }

  const handleViewLogs = (server: Server) => {
    setSelectedServer(server.id)
    setView('logs')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">Server</h2>
        <div className="flex items-center gap-2">
          {servers.length > 1 && (
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              title="Alle Server gleichzeitig synchronisieren"
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 transition-colors text-slate-400"
            >
              {syncingAll ? 'Starte...' : '⟳ Alle syncen'}
            </button>
          )}
          <button
            onClick={() => { setEditServer(undefined); setDialogOpen(true) }}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors text-white"
          >
            + Server hinzufügen
          </button>
        </div>
      </div>

      {/* Main area — grid + optional panel side by side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Server grid */}
        <div className={`flex-1 overflow-y-auto p-6 ${syncPanelServerId ? 'max-w-2xl' : ''}`}>
          {servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <span className="text-4xl">🖥️</span>
              <p className="text-sm">Noch keine Server konfiguriert.</p>
              <button
                onClick={() => setDialogOpen(true)}
                className="text-sm text-indigo-400 hover:underline"
              >
                Ersten Server hinzufügen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {servers.map((server) => (
                <ServerTile
                  key={server.id}
                  server={server}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSync={handleSync}
                  onViewLogs={handleViewLogs}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sync panel */}
        {syncPanelServerId && (
          <div className="w-96 border-l border-slate-800 flex-shrink-0">
            <SyncPanel
              serverId={syncPanelServerId}
              onClose={() => setSyncPanelServerId(null)}
            />
          </div>
        )}
      </div>

      {/* Add/Edit server dialog */}
      {dialogOpen && (
        <ServerDialog
          key={editServer?.id ?? 'new'}
          server={editServer}
          onClose={() => setDialogOpen(false)}
          onSave={(saved) => {
            if (editServer) {
              useServerStore.getState().updateServer(saved)
            } else {
              useServerStore.getState().addServer(saved)
            }
            setDialogOpen(false)
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-80 p-5 space-y-4">
            <h3 className="text-white font-semibold">Server löschen</h3>
            <p className="text-sm text-slate-400">
              Server <span className="text-white font-medium">"{deleteConfirm.name}"</span> wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
