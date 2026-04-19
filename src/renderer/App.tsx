import React, { useEffect, useState } from 'react'
import { useUIStore } from './store/ui.store'
import { useSyncSession } from './hooks/useSyncSession'
import { loadAndApplyTheme } from './store/theme.store'
import { useServerStore } from './store/server.store'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import UpdateBanner from './components/updater/UpdateBanner'
import ServerGrid from './components/dashboard/ServerGrid'
import LogHistory from './components/history/LogHistory'
import SettingsView from './components/settings/SettingsView'
import BackupView from './components/backup/BackupView'
import TerminalView from './components/terminal/TerminalView'
import FilesView from './components/files/FilesView'

export default function App(): React.ReactElement {
  const { view, setView } = useUIStore()
  const { servers } = useServerStore()
  const [uploadRequest, setUploadRequest] = useState<{ path: string } | null>(null)

  // Apply saved theme on startup
  useEffect(() => { loadAndApplyTheme() }, [])

  // Subscribe to sync push events globally
  useSyncSession()

  // Listen for upload requests from context menu / second instance
  useEffect(() => {
    const handler = (data: { path: string }) => setUploadRequest(data)
    window.electronAPI.on.uploadRequest(handler)
    return () => window.electronAPI.off.uploadRequest(handler)
  }, [])

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <UpdateBanner />
        <main className="flex-1 overflow-hidden relative">
          {view === 'dashboard' && <ServerGrid />}
          {view === 'logs' && <LogHistory />}
          {view === 'backup' && <BackupView />}
          {view === 'settings' && <SettingsView />}
          {/* Always mounted so SFTP connection survives tab switches */}
          <FilesView isActive={view === 'files'} />
          {/* Always mounted so xterm + SSH session survive tab switches */}
          <TerminalView isActive={view === 'terminal'} />
        </main>
      </div>

      {/* Upload-request dialog (triggered from context menu / Explorer) */}
      {uploadRequest && (
        <UploadRequestDialog
          filePath={uploadRequest.path}
          servers={servers}
          onClose={() => setUploadRequest(null)}
          onNavigate={() => { setView('dashboard'); setUploadRequest(null) }}
        />
      )}
    </div>
  )
}

// ─── Upload Request Dialog ────────────────────────────────────────────────────

import type { Server } from '../../shared/types'

function UploadRequestDialog({
  filePath,
  servers,
  onClose,
  onNavigate
}: {
  filePath: string
  servers: Server[]
  onClose: () => void
  onNavigate: () => void
}) {
  const [selectedId, setSelectedId] = useState(servers[0]?.id ?? '')
  const [syncing, setSyncing] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = async () => {
    if (!selectedId) return
    setSyncing(true)
    setError(null)
    const res = await window.electronAPI.sync.start(selectedId)
    setSyncing(false)
    if (res.ok) {
      setDone(true)
      setTimeout(onClose, 1500)
      onNavigate()
    } else {
      setError(res.error ?? 'Fehler')
    }
  }

  const name = filePath.split(/[\\/]/).pop() ?? filePath

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-96 p-5 space-y-4">
        <div>
          <h3 className="text-white font-semibold">Upload via Kontextmenü</h3>
          <p className="text-xs text-slate-500 mt-1 truncate" title={filePath}>{name}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">Server auswählen</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.host}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {done && <p className="text-xs text-emerald-400">Upload gestartet</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedId || syncing || done}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-white"
          >
            {syncing ? 'Starte...' : 'Jetzt uploaden'}
          </button>
        </div>
      </div>
    </div>
  )
}
