import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { Server, SyncSession, WatcherEvent, ServerInfo } from '../../../../shared/types'
import { useSyncStore } from '../../store/sync.store'
import { useServerStore } from '../../store/server.store'
import { useUIStore } from '../../store/ui.store'

type PingStatus = 'unknown' | 'ok' | 'slow' | 'error'

function usePing(serverId: string): { status: PingStatus; ms: number | null } {
  const [status, setStatus] = useState<PingStatus>('unknown')
  const [ms, setMs] = useState<number | null>(null)

  const doCheck = useCallback(async () => {
    const res = await window.electronAPI.servers.ping(serverId)
    if (res.ok && res.data) {
      setMs(res.data.ms)
      setStatus(res.data.ms < 150 ? 'ok' : 'slow')
    } else {
      setMs(null)
      setStatus('error')
    }
  }, [serverId])

  useEffect(() => {
    doCheck()
    const id = setInterval(doCheck, 30_000)
    return () => clearInterval(id)
  }, [doCheck])

  return { status, ms }
}

interface Props {
  server: Server
  onEdit: (server: Server) => void
  onDelete: (server: Server) => void
  onSync: (server: Server, isDryRun?: boolean) => void
  onViewLogs: (server: Server) => void
}

function StatusDot({ session, watching }: { session?: SyncSession; watching: boolean }): React.ReactElement {
  if (session && !['done', 'dry_run_done', 'error', 'cancelled', 'idle'].includes(session.status)) {
    return <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse inline-block" title="Sync läuft" />
  }
  if (session?.status === 'done') {
    return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" title="Zuletzt erfolgreich" />
  }
  if (session?.status === 'error') {
    return <span className="w-2 h-2 rounded-full bg-red-400 inline-block" title="Fehler" />
  }
  if (watching) {
    return <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" title="Auto-Watch aktiv" />
  }
  return <span className="w-2 h-2 rounded-full bg-slate-700 inline-block" title="Bereit" />
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

function Bar({ pct, color }: { pct: number | null; color: string }) {
  if (pct === null) return null
  return (
    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-slate-500 text-xs flex-shrink-0">{label}</span>
      <span className={`text-xs text-right text-slate-300 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function ServerInfoModal({ server, onClose }: { server: Server; onClose: () => void }) {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.servers.info(server.id).then(res => {
      setLoading(false)
      if (res.ok && res.data) setInfo(res.data)
      else setError(res.error ?? 'Fehler beim Abrufen')
    })
  }, [server.id])

  const osIcon = (os: string) => {
    const l = os.toLowerCase()
    if (l.includes('ubuntu')) return '🟠'
    if (l.includes('debian')) return '🔴'
    if (l.includes('centos') || l.includes('rocky') || l.includes('alma')) return '🟣'
    if (l.includes('fedora')) return '🔵'
    if (l.includes('arch')) return '🔷'
    if (l.includes('darwin') || l.includes('mac')) return '🍎'
    return '🐧'
  }

  const memPct = info?.memPercent ?? null
  const diskPct = info ? parseInt(info.diskPercent) || null : null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">{server.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{server.host}:{server.port}</p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xl leading-none transition-colors">×</button>
        </div>

        <div className="px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Verbinde…
            </div>
          )}
          {error && <p className="text-red-400 text-sm text-center py-6">{error}</p>}
          {info && (
            <div className="space-y-0">
              {/* OS banner */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-800/40 rounded-xl">
                <span className="text-2xl">{osIcon(info.os)}</span>
                <div>
                  <p className="text-sm font-medium text-white">{info.os}</p>
                  <p className="text-xs text-slate-500">{info.kernel} · {info.arch}</p>
                </div>
              </div>

              <InfoRow label="Hostname" value={info.hostname} mono />
              <InfoRow label="Benutzer" value={`${info.user} (${info.shell})`} mono />
              <InfoRow label="Laufzeit" value={info.uptime} />
              <InfoRow label="Loadavg" value={info.load} mono />

              {/* CPU */}
              <div className="py-1.5 border-b border-slate-800/60">
                <div className="flex justify-between items-start gap-3">
                  <span className="text-slate-500 text-xs flex-shrink-0">CPU</span>
                  <span className="text-xs text-right text-slate-300 max-w-[200px] truncate" title={info.cpu}>
                    {info.cpu}{info.cpuCores ? ` · ${info.cpuCores} Kerne` : ''}
                  </span>
                </div>
              </div>

              {/* Memory */}
              <div className="py-1.5 border-b border-slate-800/60 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-xs">Arbeitsspeicher</span>
                  <span className="text-xs text-slate-300">
                    {info.memUsed} / {info.memTotal}
                    {memPct !== null && <span className={`ml-1.5 font-mono ${memPct > 85 ? 'text-red-400' : memPct > 60 ? 'text-yellow-400' : 'text-emerald-400'}`}>({memPct}%)</span>}
                  </span>
                </div>
                <Bar pct={memPct} color={memPct !== null && memPct > 85 ? 'bg-red-500' : memPct !== null && memPct > 60 ? 'bg-yellow-500' : 'bg-emerald-500'} />
                <p className="text-xs text-slate-600">Verfügbar: {info.memFree}</p>
              </div>

              {/* Disk */}
              <div className="py-1.5 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-xs">Festplatte (/)</span>
                  <span className="text-xs text-slate-300">
                    {info.diskUsed} / {info.diskTotal}
                    {diskPct !== null && <span className={`ml-1.5 font-mono ${diskPct > 85 ? 'text-red-400' : diskPct > 60 ? 'text-yellow-400' : 'text-emerald-400'}`}>({info.diskPercent})</span>}
                  </span>
                </div>
                <Bar pct={diskPct} color={diskPct !== null && diskPct > 85 ? 'bg-red-500' : diskPct !== null && diskPct > 60 ? 'bg-yellow-500' : 'bg-indigo-500'} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ServerTile({ server, onEdit, onDelete, onSync, onViewLogs }: Props): React.ReactElement {
  const { sessions } = useSyncStore()
  const { updateServer } = useServerStore()
  const { navigateToBackup } = useUIStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [lastWatchEvent, setLastWatchEvent] = useState<string | null>(null)
  const [watching, setWatching] = useState(server.autoWatch)
  const menuRef = useRef<HTMLDivElement>(null)

  const session = [...sessions.values()].find((s) => s.serverId === server.id)
  const ping = usePing(server.id)
  const isActive = session && !['done', 'dry_run_done', 'error', 'cancelled', 'idle'].includes(session.status)

  const progress = session && session.changedFiles > 0
    ? Math.round((session.uploadedFiles / session.changedFiles) * 100)
    : 0

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Listen for watcher events for this server
  useEffect(() => {
    const handler = (data: WatcherEvent) => {
      if (data.serverId !== server.id) return
      const filename = data.path.split(/[\\/]/).pop() ?? data.path
      setLastWatchEvent(`${data.event}: ${filename}`)
    }
    window.electronAPI.on.watcherEvent(handler)
    return () => window.electronAPI.off.watcherEvent(handler)
  }, [server.id])

  const handleToggleWatch = async () => {
    const next = !watching
    setWatching(next)
    const res = await window.electronAPI.servers.setWatch(server.id, next)
    if (res.ok) {
      updateServer({ ...server, autoWatch: next })
    } else {
      setWatching(!next)  // revert
    }
  }

  return (
    <div className="relative bg-[var(--color-surface)] border border-slate-800 rounded-xl p-5 flex flex-col gap-3 hover:border-slate-700 transition-colors group">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusDot session={session} watching={watching} />
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate leading-tight">{server.name}</h3>
            <p className="text-xs text-slate-500 truncate">{server.projectName}</p>
          </div>
        </div>

        {/* Context menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 w-44 bg-[var(--color-elevated)] border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
              {[
                { label: 'Bearbeiten', action: () => { onEdit(server); setMenuOpen(false) } },
                { label: 'Logs anzeigen', action: () => { onViewLogs(server); setMenuOpen(false) } },
                ...(server.backup ? [{ label: 'Backups anzeigen', action: () => { navigateToBackup(server.id); setMenuOpen(false) } }] : []),
                { label: 'Server löschen', action: () => { onDelete(server); setMenuOpen(false) }, danger: true }
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 transition-colors
                    ${item.danger ? 'text-red-400' : 'text-slate-300'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Server details */}
      <div className="text-xs text-slate-600 space-y-0.5">
        <div className="flex items-center gap-1.5 truncate text-slate-500">
          <span
            title={ping.status === 'ok' ? `${ping.ms}ms` : ping.status === 'slow' ? `${ping.ms}ms (langsam)` : ping.status === 'error' ? 'Nicht erreichbar' : 'Prüfe...'}
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              ping.status === 'ok' ? 'bg-emerald-500' :
              ping.status === 'slow' ? 'bg-yellow-500' :
              ping.status === 'error' ? 'bg-red-500' :
              'bg-slate-700'
            }`}
          />
          <span className="truncate">{server.host}:{server.port}</span>
          {ping.ms !== null && (
            <span className={`flex-shrink-0 font-mono ${ping.status === 'slow' ? 'text-yellow-600' : 'text-slate-700'}`}>
              {ping.ms}ms
            </span>
          )}
        </div>
        <p className="truncate">{server.localPath.split(/[\\/]/).pop()} → {server.remotePath}</p>
      </div>

      {/* Active sync progress */}
      {isActive && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span className="truncate max-w-[80%]">{session.currentFile ?? 'Analysiere...'}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-700 capitalize">{session.status}…</p>
        </div>
      )}

      {/* Last sync result */}
      {!isActive && session?.status === 'done' && (
        <p className="text-xs text-emerald-500">
          ✓ {session.uploadedFiles} hochgeladen
          {(session.deletedFiles ?? 0) > 0 && ` · ${session.deletedFiles} gelöscht`}
          {' '}· {elapsed(session.finishedAt! - session.startedAt)} · {session.skippedFiles} gleich
        </p>
      )}
      {!isActive && session?.status === 'dry_run_done' && (
        <p className="text-xs text-sky-400">
          ○ Dry Run: {session.changedFiles} würden hochgeladen
        </p>
      )}
      {!isActive && session?.status === 'error' && (
        <p className="text-xs text-red-400 truncate">✗ {session.error}</p>
      )}

      {/* Watcher live event */}
      {watching && lastWatchEvent && !isActive && (
        <p className="text-xs text-sky-600 truncate">👁 {lastWatchEvent}</p>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => onSync(server)}
          disabled={!!isActive}
          className="flex-1 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white"
        >
          {isActive ? 'Läuft...' : 'Upload'}
        </button>

        {/* Dry Run */}
        <button
          onClick={() => onSync(server, true)}
          disabled={!!isActive}
          title="Dry Run – simuliert Upload ohne Änderungen"
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-40 transition-colors text-slate-500"
        >
          DR
        </button>

        {/* Auto-Watch toggle */}
        <button
          onClick={handleToggleWatch}
          title={watching ? 'Auto-Watch deaktivieren' : 'Auto-Watch aktivieren'}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors
            ${watching
              ? 'border-sky-800 bg-sky-900/30 text-sky-400'
              : 'border-slate-700 text-slate-600 hover:text-slate-400 hover:border-slate-600'
            }`}
        >
          {watching ? '👁' : '○'}
        </button>

        {/* Info */}
        <button
          onClick={() => setShowInfo(true)}
          title="Server-Informationen"
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-600 hover:text-slate-300 hover:border-slate-500 transition-colors"
        >
          ℹ
        </button>

        {/* Cancel */}
        {isActive && (
          <button
            onClick={() => {
              const s = [...useSyncStore.getState().sessions.values()].find(x => x.serverId === server.id)
              if (s) window.electronAPI.sync.cancel(s.sessionId)
            }}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-900 hover:bg-red-900/20 transition-colors text-red-500"
          >
            ✕
          </button>
        )}
      </div>

      {showInfo && <ServerInfoModal server={server} onClose={() => setShowInfo(false)} />}
    </div>
  )
}
