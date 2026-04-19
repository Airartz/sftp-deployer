import React, { useEffect, useRef } from 'react'
import { useSyncStore } from '../../store/sync.store'
import type { SyncSession } from '../../../../shared/types'

interface Props {
  serverId: string
  onClose: () => void
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Bereit',
  connecting: 'Verbinde...',
  scanning: 'Scanne Dateien...',
  hashing: 'Prüfe Hashes...',
  uploading: 'Lädt hoch...',
  done: 'Abgeschlossen',
  dry_run_done: 'Dry Run abgeschlossen',
  error: 'Fehler',
  cancelled: 'Abgebrochen'
}

const LOG_COLORS: Record<string, string> = {
  info: 'text-slate-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-indigo-400'
}

export default function SyncPanel({ serverId, onClose }: Props): React.ReactElement {
  const { sessions, logs, activeSessionId } = useSyncStore()
  const logRef = useRef<HTMLDivElement>(null)

  // Find latest session for this server
  const session = [...sessions.values()].reverse().find((s) => s.serverId === serverId)
  const sessionLogs = session ? (logs.get(session.sessionId) ?? []) : []

  const isActive = session && !['done', 'dry_run_done', 'error', 'cancelled'].includes(session.status)

  const progress = session && session.changedFiles > 0
    ? Math.round((session.uploadedFiles / session.changedFiles) * 100)
    : 0

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [sessionLogs.length])

  const duration = session?.finishedAt
    ? ((session.finishedAt - session.startedAt) / 1000).toFixed(1)
    : session
      ? ((Date.now() - session.startedAt) / 1000).toFixed(1)
      : null

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-alt)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <div>
          <p className="text-sm font-medium text-white">
            {session ? STATUS_LABELS[session.status] ?? session.status : 'Sync-Panel'}
          </p>
          {duration && <p className="text-xs text-slate-600">{duration}s</p>}
        </div>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400 text-lg">✕</button>
      </div>

      {/* Stats */}
      {session && (
        <div className="grid grid-cols-3 gap-px bg-slate-800 border-b border-slate-800 flex-shrink-0">
          <Stat label="Gesamt" value={session.totalFiles} />
          <Stat label="Geändert" value={session.changedFiles} highlight />
          <Stat label="Übersprungen" value={session.skippedFiles} />
        </div>
      )}

      {/* Progress bar */}
      {isActive && session.changedFiles > 0 && (
        <div className="px-4 py-2 flex-shrink-0 space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span className="truncate max-w-[80%]">{session.currentFile}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Log stream */}
      <div
        ref={logRef}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs space-y-0.5"
      >
        {sessionLogs.length === 0 ? (
          <p className="text-slate-700 text-center py-8">Keine Logs</p>
        ) : (
          sessionLogs.map((entry, i) => (
            <div key={entry.id ?? i} className={`flex gap-2 ${LOG_COLORS[entry.level] ?? 'text-slate-400'}`}>
              <span className="text-slate-700 flex-shrink-0 tabular-nums">
                {entry.timestamp.slice(11, 19)}
              </span>
              <span className="break-all">{entry.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Cancel button */}
      {isActive && (
        <div className="px-4 py-3 border-t border-slate-800 flex-shrink-0">
          <button
            onClick={() => window.electronAPI.sync.cancel(session.sessionId)}
            className="w-full py-2 text-sm text-red-400 border border-red-900 rounded-lg hover:bg-red-900/20 transition-colors"
          >
            Abbrechen
          </button>
        </div>
      )}

      {/* Done summary */}
      {session && ['done', 'dry_run_done'].includes(session.status) && (
        <div className="px-4 py-3 border-t border-slate-800 flex-shrink-0">
          <p className={`text-xs text-center ${session.errorFiles > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {session.uploadedFiles} hochgeladen · {session.errorFiles} Fehler · {session.skippedFiles} unverändert
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-[var(--color-surface-alt)] px-3 py-2 text-center">
      <p className={`text-lg font-mono font-semibold ${highlight ? 'text-indigo-400' : 'text-white'}`}>
        {value}
      </p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  )
}
