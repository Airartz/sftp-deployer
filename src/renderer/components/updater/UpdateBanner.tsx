import React, { useEffect, useState, useCallback } from 'react'
import type { UpdateInfo, UpdateProgress } from '../../../../shared/types'

type Phase = 'idle' | 'checking' | 'available' | 'up_to_date' | 'downloading' | 'ready' | 'error'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UpdateBanner(): React.ReactElement | null {
  const [phase, setPhase]           = useState<Phase>('idle')
  const [info, setInfo]             = useState<UpdateInfo | null>(null)
  const [progress, setProgress]     = useState<UpdateProgress | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [changelogOpen, setChangelogOpen] = useState(false)

  // ─── Auto-check on mount ────────────────────────────────────────────────────

  const checkForUpdates = useCallback(async () => {
    setPhase('checking')
    setError(null)
    const res = await window.electronAPI.updater.check()
    if (!res.ok) {
      setError(res.error ?? 'Unbekannter Fehler')
      setPhase('error')
      return
    }
    if (res.data) {
      setInfo(res.data)
      setPhase('available')
    } else {
      setPhase('up_to_date')
      // Hide "up to date" hint after 5 s
      setTimeout(() => setPhase('idle'), 5000)
    }
  }, [])

  useEffect(() => {
    // Delay first check by 3 s so the app can fully load
    const t = setTimeout(checkForUpdates, 3000)
    return () => clearTimeout(t)
  }, [checkForUpdates])

  // ─── Progress events ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (p: UpdateProgress) => setProgress(p)
    window.electronAPI.on.updateProgress(handler)
    return () => window.electronAPI.off.updateProgress(handler)
  }, [])

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const handleDownloadAndInstall = async () => {
    setPhase('downloading')
    setProgress({ percent: 0, bytesReceived: 0, totalBytes: 0 })
    setError(null)

    const res = await window.electronAPI.updater.download()
    if (!res.ok) {
      setError(res.error ?? 'Download fehlgeschlagen')
      setPhase('available')
      return
    }

    setPhase('ready')
    // Short delay to show "ready" state, then install
    setTimeout(async () => {
      await window.electronAPI.updater.install()
    }, 800)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'idle') return null

  if (phase === 'up_to_date') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-950/60 border-b border-emerald-800/40 text-emerald-400 text-xs">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        App ist aktuell.
      </div>
    )
  }

  if (phase === 'checking') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 border-b border-slate-800 text-slate-500 text-xs">
        <Spinner />
        Suche nach Updates…
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-red-950/50 border-b border-red-800/40 text-red-400 text-xs">
        <span>Update-Prüfung fehlgeschlagen: {error}</span>
        <button
          onClick={checkForUpdates}
          className="ml-4 underline hover:text-red-300 transition-colors flex-shrink-0"
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  if (phase === 'downloading') {
    const pct = progress?.percent ?? 0
    const received = progress?.bytesReceived ?? 0
    const total = progress?.totalBytes ?? 0
    return (
      <div className="px-4 py-2.5 bg-indigo-950/60 border-b border-indigo-800/40">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-indigo-300 font-medium">
            Update wird heruntergeladen… {pct}%
          </span>
          {total > 0 && (
            <span className="text-xs text-slate-500">
              {formatBytes(received)} / {formatBytes(total)}
            </span>
          )}
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  if (phase === 'ready') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-950/60 border-b border-indigo-800/40 text-indigo-300 text-xs">
        <Spinner />
        Update bereit — App wird neu gestartet…
      </div>
    )
  }

  // phase === 'available'
  return (
    <div className="border-b border-indigo-800/40 bg-indigo-950/50">
      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-xs text-indigo-200 font-medium">
            Update verfügbar — v{info?.version}
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">
            {info?.publishedAt ? `(${new Date(info.publishedAt).toLocaleDateString('de-DE')})` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {info?.changelog && (
            <button
              onClick={() => setChangelogOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>Changelog</span>
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${changelogOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          <button
            onClick={handleDownloadAndInstall}
            className="px-3 py-1 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Jetzt installieren
          </button>

          <button
            onClick={() => setPhase('idle')}
            className="p-1 text-slate-600 hover:text-slate-400 transition-colors"
            title="Schließen"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable changelog */}
      {changelogOpen && info?.changelog && (
        <div className="px-4 pb-3 border-t border-indigo-900/50">
          <div className="mt-2 max-h-48 overflow-y-auto">
            <pre className="text-xs text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
              {info.changelog}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner(): React.ReactElement {
  return (
    <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
