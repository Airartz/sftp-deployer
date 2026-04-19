import React, { useEffect, useState, useCallback } from 'react'
import type { BackupSession } from '../../../../../shared/types'
import { useUIStore } from '../../store/ui.store'
import { useServerStore } from '../../store/server.store'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function BackupView(): React.ReactElement {
  const { selectedServerId, setSelectedServer } = useUIStore()
  const { servers } = useServerStore()

  const [sessions, setSessions] = useState<BackupSession[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [restoreResult, setRestoreResult] = useState<{ sessionId: string; restored: number; failed: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const serversWithBackup = servers.filter((s) => s.backup)
  const activeServerId = selectedServerId ?? serversWithBackup[0]?.id ?? null
  const activeServer = servers.find((s) => s.id === activeServerId)

  const loadSessions = useCallback(async (serverId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.electronAPI.backup.listSessions(serverId)
      if (res.ok && res.data) {
        setSessions(res.data)
      } else {
        setError(res.error ?? 'Unbekannter Fehler')
        setSessions([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeServerId) {
      loadSessions(activeServerId)
      setExpandedSession(null)
      setRestoreResult(null)
    }
  }, [activeServerId, loadSessions])

  async function handleRestore(sessionId: string) {
    if (!activeServerId) return
    setRestoring(sessionId)
    setRestoreResult(null)
    setError(null)
    try {
      const res = await window.electronAPI.backup.restoreSession(activeServerId, sessionId)
      if (res.ok && res.data) {
        setRestoreResult({ sessionId, ...res.data })
      } else {
        setError(res.error ?? 'Wiederherstellung fehlgeschlagen')
      }
    } finally {
      setRestoring(null)
    }
  }

  async function handleDelete(sessionId: string) {
    if (!activeServerId) return
    setDeleting(sessionId)
    try {
      const res = await window.electronAPI.backup.deleteSession(activeServerId, sessionId)
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
        if (expandedSession === sessionId) setExpandedSession(null)
        if (restoreResult?.sessionId === sessionId) setRestoreResult(null)
      } else {
        setError(res.error ?? 'Löschen fehlgeschlagen')
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex h-full">
      {/* Server sidebar */}
      <div className="w-56 border-r border-slate-800 flex flex-col bg-[var(--color-surface-alt)]">
        <div className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
          Server
        </div>
        {serversWithBackup.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500 text-center">
            Kein Server hat Backup aktiviert
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-2">
            {serversWithBackup.map((server) => (
              <button
                key={server.id}
                onClick={() => setSelectedServer(server.id)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                  ${activeServerId === server.id
                    ? 'bg-indigo-600/20 text-indigo-300 border-r-2 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
              >
                <div className="font-medium truncate">{server.name}</div>
                <div className="text-xs text-slate-500 truncate">{server.host}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {activeServer ? `Backups — ${activeServer.name}` : 'Backups'}
            </h2>
            {!loading && sessions.length > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">{sessions.length} Session(s)</p>
            )}
          </div>
          {activeServerId && (
            <button
              onClick={() => loadSessions(activeServerId)}
              disabled={loading}
              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded border border-slate-700 hover:border-slate-600 transition-colors disabled:opacity-50"
            >
              Aktualisieren
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
              {error}
            </div>
          )}

          {restoreResult && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-900/30 border border-emerald-800 text-sm">
              <span className="text-emerald-300 font-medium">
                Wiederhergestellt: {restoreResult.restored} Datei(en)
              </span>
              {restoreResult.failed.length > 0 && (
                <div className="mt-1 text-red-300">
                  Fehlgeschlagen: {restoreResult.failed.join(', ')}
                </div>
              )}
            </div>
          )}

          {!activeServerId && (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
              Wähle einen Server aus
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && activeServerId && sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 mb-3 opacity-40">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span className="text-sm">Keine Backups vorhanden</span>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <div className="space-y-3">
              {sessions.map((session) => {
                const isExpanded = expandedSession === session.sessionId
                const isRestoring = restoring === session.sessionId
                const isDeleting = deleting === session.sessionId
                const totalSize = session.entries.reduce((s, e) => s + e.originalSize, 0)

                return (
                  <div
                    key={session.sessionId}
                    className="rounded-xl border border-slate-800 bg-[var(--color-surface-alt)] overflow-hidden"
                  >
                    {/* Session header */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpandedSession(isExpanded ? null : session.sessionId)}
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                        </svg>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-200">
                            {formatDate(session.createdAt)}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {session.entries.length} Datei(en) · {formatBytes(totalSize)}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRestore(session.sessionId)}
                          disabled={isRestoring || isDeleting}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isRestoring ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin inline-block"/>
                              Wiederherstellen...
                            </span>
                          ) : 'Wiederherstellen'}
                        </button>
                        <button
                          onClick={() => handleDelete(session.sessionId)}
                          disabled={isRestoring || isDeleting}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-slate-700 hover:border-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDeleting ? '...' : 'Löschen'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded file list */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 bg-slate-900/30">
                        <div className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800/50">
                          Gesicherte Dateien
                        </div>
                        <div className="divide-y divide-slate-800/50 max-h-64 overflow-y-auto">
                          {session.entries.map((entry) => (
                            <div
                              key={entry.relativePath}
                              className="flex items-center justify-between px-4 py-2 text-xs"
                            >
                              <span className="text-slate-300 font-mono truncate flex-1 mr-4">
                                {entry.relativePath}
                              </span>
                              <span className="text-slate-500 flex-shrink-0">
                                {formatBytes(entry.originalSize)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
