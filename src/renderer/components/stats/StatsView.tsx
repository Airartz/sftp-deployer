import React, { useEffect, useState, useCallback } from 'react'
import type { DeployStats, DailyStats } from '../../../../shared/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ─── Bar Chart (last 30 days uploads) ────────────────────────────────────────

function BarChart({ data }: { data: DailyStats[] }): React.ReactElement {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        Noch keine Daten
      </div>
    )
  }

  const maxUploads = Math.max(...data.map((d) => d.uploads), 1)
  const maxBytes = Math.max(...data.map((d) => d.bytesTransferred), 1)

  const width = 560
  const height = 120
  const barWidth = Math.max(4, Math.floor((width - 40) / data.length) - 2)
  const gap = Math.floor((width - 40) / data.length)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full" style={{ minWidth: 320 }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={pct}
            x1={0} y1={height - height * pct}
            x2={width} y2={height - height * pct}
            stroke="#1e293b" strokeWidth={1}
          />
        ))}

        {/* Bars */}
        {data.map((day, i) => {
          const x = 20 + i * gap
          const uploadH = Math.max(2, (day.uploads / maxUploads) * height)
          const bytesH = Math.max(2, (day.bytesTransferred / maxBytes) * height * 0.6)
          const dateLabel = day.date.slice(5) // MM-DD

          return (
            <g key={day.date}>
              {/* Bytes bar (background) */}
              <rect
                x={x} y={height - bytesH}
                width={barWidth} height={bytesH}
                rx={2} fill="#312e81" opacity={0.6}
              />
              {/* Upload bar */}
              <rect
                x={x} y={height - uploadH}
                width={barWidth} height={uploadH}
                rx={2} fill="#6366f1"
              >
                <title>{day.date}: {day.uploads} Uploads, {formatBytes(day.bytesTransferred)}{day.errors > 0 ? `, ${day.errors} Fehler` : ''}</title>
              </rect>
              {/* Error dot */}
              {day.errors > 0 && (
                <circle cx={x + barWidth / 2} cy={height - uploadH - 4} r={3} fill="#f87171" />
              )}
              {/* Date label every ~7 days */}
              {i % 7 === 0 && (
                <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" fontSize={9} fill="#475569">
                  {dateLabel}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-500 rounded inline-block" /> Uploads</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-900 rounded inline-block" /> Datenmenge</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-full inline-block" /> Fehler</span>
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'indigo' }: {
  label: string
  value: string
  sub?: string
  color?: 'indigo' | 'emerald' | 'red' | 'sky'
}) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    sky: 'text-sky-400'
  }
  return (
    <div className="bg-[var(--color-surface)] border border-slate-800 rounded-xl p-5">
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Top Servers ──────────────────────────────────────────────────────────────

function TopServers({ servers }: { servers: DeployStats['topServers'] }): React.ReactElement {
  if (!servers.length) {
    return <p className="text-slate-600 text-sm">Noch keine Daten</p>
  }
  const max = servers[0].syncs
  return (
    <div className="space-y-2">
      {servers.map((s) => (
        <div key={s.serverId}>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span className="truncate max-w-[70%]">{s.name}</span>
            <span className="text-slate-500">{s.syncs} Syncs</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all"
              style={{ width: `${(s.syncs / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function StatsView(): React.ReactElement {
  const [stats, setStats] = useState<DeployStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await window.electronAPI.logs.getStats()
    setLoading(false)
    if (res.ok && res.data) setStats(res.data)
    else setError(res.error ?? 'Fehler')
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm gap-2">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Lade Statistiken…
      </div>
    )
  }

  if (error) {
    return <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
  }

  if (!stats) return <></>

  const avgUploadsPerSync = stats.totalSyncs > 0
    ? (stats.totalUploads / stats.totalSyncs).toFixed(1)
    : '0'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">Statistiken</h2>
        <button
          onClick={load}
          className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors"
        >
          Aktualisieren
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Gesamt-Syncs"
            value={stats.totalSyncs.toLocaleString('de-DE')}
            sub={`Ø ${avgUploadsPerSync} Uploads pro Sync`}
            color="indigo"
          />
          <StatCard
            label="Uploads gesamt"
            value={stats.totalUploads.toLocaleString('de-DE')}
            color="emerald"
          />
          <StatCard
            label="Übertragen"
            value={formatBytes(stats.totalBytesTransferred)}
            color="sky"
          />
          <StatCard
            label="Fehler gesamt"
            value={stats.totalErrors.toLocaleString('de-DE')}
            color={stats.totalErrors > 0 ? 'red' : 'emerald'}
          />
        </div>

        {/* Chart */}
        <div className="bg-[var(--color-surface)] border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Uploads der letzten 30 Tage</h3>
          <BarChart data={stats.last30Days} />
        </div>

        {/* Top Servers */}
        <div className="bg-[var(--color-surface)] border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Aktivste Server</h3>
          <TopServers servers={stats.topServers} />
        </div>
      </div>
    </div>
  )
}
