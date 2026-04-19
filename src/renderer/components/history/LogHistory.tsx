import React, { useEffect, useState } from 'react'
import type { LogEntry } from '../../../../shared/types'
import { useServerStore } from '../../store/server.store'
import { useUIStore } from '../../store/ui.store'

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-slate-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-indigo-400'
}

const LEVEL_BADGE: Record<string, string> = {
  info: 'bg-slate-800 text-slate-400',
  warn: 'bg-yellow-900/40 text-yellow-400',
  error: 'bg-red-900/40 text-red-400',
  debug: 'bg-indigo-900/40 text-indigo-400'
}

export default function LogHistory(): React.ReactElement {
  const { servers } = useServerStore()
  const { selectedServerId, setSelectedServer } = useUIStore()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  const activeServerId = selectedServerId ?? servers[0]?.id

  useEffect(() => {
    if (!activeServerId) return
    setLoading(true)
    window.electronAPI.logs.getHistory(activeServerId, 1000).then((res) => {
      setLogs(res.ok && res.data ? res.data : [])
      setLoading(false)
    })
  }, [activeServerId])

  const filteredLogs = filter === 'all' ? logs : logs.filter((l) => l.level === filter)

  const handleClear = async () => {
    if (!activeServerId) return
    if (!confirm('Alle Logs für diesen Server löschen?')) return
    await window.electronAPI.logs.clearHistory(activeServerId)
    setLogs([])
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 flex-shrink-0 flex-wrap">
        {/* Server selector */}
        <select
          value={activeServerId ?? ''}
          onChange={(e) => setSelectedServer(e.target.value)}
          className="bg-[var(--color-surface)] border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Level filter */}
        <div className="flex gap-1">
          {['all', 'info', 'warn', 'error'].map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors
                ${filter === level ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-600">{filteredLogs.length} Einträge</span>
          <button
            onClick={handleClear}
            className="text-xs text-red-500 hover:text-red-400"
          >
            Löschen
          </button>
        </div>
      </div>

      {/* Log table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">Lade...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-700 text-sm">Keine Logs vorhanden</div>
        ) : (
          <div className="font-mono text-xs">
            {filteredLogs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-6 py-1.5 hover:bg-slate-900/50 border-b border-slate-900 transition-colors"
              >
                <span className="text-slate-700 flex-shrink-0 tabular-nums pt-px">
                  {entry.timestamp.slice(0, 19).replace('T', ' ')}
                </span>
                <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase ${LEVEL_BADGE[entry.level]}`}>
                  {entry.level}
                </span>
                <span className={`flex-1 break-all ${LEVEL_COLORS[entry.level]}`}>
                  {entry.filePath && (
                    <span className="text-slate-600 mr-2">{entry.filePath}</span>
                  )}
                  {entry.message}
                </span>
                {entry.bytesTransferred !== undefined && (
                  <span className="text-slate-700 flex-shrink-0">
                    {(entry.bytesTransferred / 1024).toFixed(1)}KB
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
