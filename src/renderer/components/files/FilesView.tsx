import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { SftpEntry, LocalEntry, CloudConnection, CloudConnectionFormData, CloudFile } from '../../../../../shared/types'
import { useServerStore } from '../../store/server.store'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function getFileType(entry: { name: string; isDirectory: boolean }): string {
  if (entry.isDirectory) return 'Ordner'
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    js: 'JavaScript', ts: 'TypeScript', jsx: 'React JS', tsx: 'React TS',
    php: 'PHP-Datei', py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
    html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SASS',
    json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
    jpg: 'JPEG-Bild', jpeg: 'JPEG-Bild', png: 'PNG-Bild', gif: 'GIF-Bild',
    svg: 'SVG', webp: 'WebP', ico: 'Icon',
    pdf: 'PDF', txt: 'Textdatei', md: 'Markdown', csv: 'CSV',
    zip: 'ZIP-Archiv', tar: 'TAR-Archiv', gz: 'GZ-Archiv', '7z': '7-Zip',
    sh: 'Shell-Skript', bash: 'Bash-Skript', bat: 'Batch-Datei', ps1: 'PowerShell',
    sql: 'SQL-Datei', db: 'Datenbank', sqlite: 'SQLite',
    env: 'ENV-Datei', conf: 'Konfiguration', config: 'Konfiguration', ini: 'INI',
    log: 'Log-Datei', lock: 'Lockdatei',
  }
  return map[ext] ?? (ext ? ext.toUpperCase() + '-Datei' : 'Datei')
}

function fmtDate(unix: number): string {
  if (!unix) return '—'
  return new Date(unix * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function parentPath(p: string): string {
  const parts = p.replace(/\\/g, '/').replace(/\/$/, '').split('/')
  if (parts.length <= 1) return p
  return parts.slice(0, -1).join('/') || '/'
}

function joinPath(base: string, name: string): string {
  return base.replace(/\/$/, '') + '/' + name
}

function permStr(n: number): string {
  return [(n & 4) ? 'r' : '-', (n & 2) ? 'w' : '-', (n & 1) ? 'x' : '-'].join('')
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const FolderIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400 flex-shrink-0">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
  </svg>
)

const FileIcon = ({ name }: { name: string }) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const color =
    ['js', 'ts', 'jsx', 'tsx'].includes(ext) ? 'text-yellow-400' :
    ['php'].includes(ext) ? 'text-indigo-400' :
    ['css', 'scss', 'sass'].includes(ext) ? 'text-blue-400' :
    ['html', 'htm', 'xml'].includes(ext) ? 'text-orange-400' :
    ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'].includes(ext) ? 'text-pink-400' :
    ['json', 'yaml', 'yml', 'toml', 'env'].includes(ext) ? 'text-green-400' :
    'text-slate-500'
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 flex-shrink-0 ${color}`}>
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
    </svg>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaneEntry = (SftpEntry | LocalEntry) & { _type: 'remote' | 'local' }

type MenuItem =
  | { separator: true }
  | { label: string; icon?: React.ReactNode; action: () => void; danger?: boolean; disabled?: boolean }

// ─── Context Menu ─────────────────────────────────────────────────────────────

function ContextMenu({ x, y, items, onClose }: {
  x: number; y: number; items: MenuItem[]; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [adj, setAdj] = useState({ x, y })

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  useEffect(() => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setAdj({
      x: x + r.width > window.innerWidth ? Math.max(4, window.innerWidth - r.width - 4) : x,
      y: y + r.height > window.innerHeight ? Math.max(4, window.innerHeight - r.height - 4) : y
    })
  }, [x, y])

  return (
    <div
      ref={ref}
      style={{ left: adj.x, top: adj.y }}
      className="fixed z-[200] bg-[var(--color-elevated)] border border-slate-700 rounded-lg shadow-2xl py-1 min-w-52"
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map((item, i) =>
        'separator' in item ? (
          <div key={i} className="my-1 border-t border-slate-800" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => { item.action(); onClose() }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left disabled:opacity-30 transition-colors
              ${item.danger ? 'text-red-400 hover:bg-red-900/30' : 'text-slate-300 hover:bg-slate-700/70'}`}
          >
            {item.icon ? <span className="w-4 flex-shrink-0 text-slate-500">{item.icon}</span> : <span className="w-4 flex-shrink-0" />}
            {item.label}
          </button>
        )
      )}
    </div>
  )
}

// ─── File editor modal ────────────────────────────────────────────────────────

function FileEditor({ serverId, entry, onClose, onSaved }: {
  serverId: string; entry: SftpEntry; onClose: () => void; onSaved: () => void
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.sftpBrowser.readFile(serverId, entry.fullPath).then(res => {
      setLoading(false)
      if (res.ok && res.data !== undefined) setContent(res.data)
      else setError(res.error ?? 'Fehler beim Laden')
    })
  }, [serverId, entry.fullPath])

  const save = async () => {
    setSaving(true)
    const res = await window.electronAPI.sftpBrowser.writeFile(serverId, entry.fullPath, content)
    setSaving(false)
    if (res.ok) onSaved()
    else setError(res.error ?? 'Fehler beim Speichern')
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl flex flex-col w-full max-w-4xl h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
          <span className="text-sm text-slate-300 font-mono truncate">{entry.fullPath}</span>
          <div className="flex gap-2 flex-shrink-0">
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button onClick={onClose} className="text-xs px-3 py-1 rounded border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">Abbrechen</button>
            <button onClick={save} disabled={saving || loading}
              className="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors">
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
        {loading
          ? <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">Lade…</div>
          : <textarea value={content} onChange={e => setContent(e.target.value)}
              className="flex-1 bg-[#0d1117] text-slate-300 font-mono text-xs p-4 resize-none focus:outline-none rounded-b-xl"
              spellCheck={false} />
        }
      </div>
    </div>
  )
}

// ─── Rename dialog ────────────────────────────────────────────────────────────

function RenameDialog({ name, onConfirm, onClose }: {
  name: string; onConfirm: (n: string) => void; onClose: () => void
}) {
  const [value, setValue] = useState(name)
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-80 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Umbenennen</h3>
        <input autoFocus value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(value); if (e.key === 'Escape') onClose() }}
          className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"/>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors">Abbrechen</button>
          <button onClick={() => onConfirm(value)} className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">OK</button>
        </div>
      </div>
    </div>
  )
}

// ─── Properties dialog ────────────────────────────────────────────────────────

function PropertiesDialog({ entry, onClose }: { entry: SftpEntry; onClose: () => void }) {
  const owner = (entry.permissions >> 6) & 7
  const group = (entry.permissions >> 3) & 7
  const other = entry.permissions & 7
  const octal = entry.permissions.toString(8).padStart(3, '0')
  return (
    <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Eigenschaften</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>
        <div className="space-y-2.5 text-xs">
          {[
            ['Name', entry.name, true],
            ['Pfad', entry.fullPath, true],
            ['Typ', entry.isDirectory ? 'Ordner' : 'Datei', false],
            ...(!entry.isDirectory ? [['Größe', fmtSize(entry.size), false]] : []),
            ['Geändert', fmtDate(entry.mtime), false],
          ].map(([label, value, mono]) => (
            <div key={label as string} className="flex justify-between gap-3">
              <span className="text-slate-500 flex-shrink-0">{label}</span>
              <span className={`text-right text-slate-300 truncate max-w-48 ${mono ? 'font-mono' : ''}`} title={value as string}>{value}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-slate-500">Rechte</span>
            <span className="font-mono text-slate-300">{permStr(owner)}{permStr(group)}{permStr(other)} <span className="text-slate-500">({octal})</span></span>
          </div>
          <div className="pt-1 border-t border-slate-800 grid grid-cols-3 text-center gap-1">
            {[['Besitzer', owner], ['Gruppe', group], ['Andere', other]].map(([lbl, bits]) => (
              <div key={lbl as string}>
                <div className="text-xs text-slate-600 mb-0.5">{lbl}</div>
                <div className="font-mono text-xs text-slate-400">{permStr(bits as number)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ─── Chmod dialog ─────────────────────────────────────────────────────────────

function ChmodDialog({ entry, serverId, onClose, onDone }: {
  entry: SftpEntry; serverId: string; onClose: () => void; onDone: () => void
}) {
  const [mode, setMode] = useState(entry.permissions)
  const [octal, setOctal] = useState(entry.permissions.toString(8).padStart(3, '0'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bit = (shift: number, b: number) => !!(mode & (b << shift))
  const toggle = (shift: number, b: number) => setMode(prev => { const n = prev ^ (b << shift); setOctal(n.toString(8).padStart(3, '0')); return n })
  const handleOctal = (val: string) => { setOctal(val); if (/^[0-7]{3}$/.test(val)) setMode(parseInt(val, 8)) }

  const save = async () => {
    setSaving(true)
    const res = await window.electronAPI.sftpBrowser.chmod(serverId, entry.fullPath, mode)
    setSaving(false)
    if (res.ok) onDone(); else setError(res.error ?? 'Fehler')
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[90] flex items-center justify-center">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-72 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">Rechte setzen</h3>
        <p className="text-xs text-slate-500 font-mono truncate">{entry.fullPath}</p>
        <div className="space-y-2">
          <div className="grid grid-cols-4 text-xs text-slate-600 mb-1"><span/>{['r','w','x'].map(l => <span key={l} className="text-center">{l}</span>)}</div>
          {([['Besitzer', 6], ['Gruppe', 3], ['Andere', 0]] as const).map(([lbl, shift]) => (
            <div key={lbl} className="grid grid-cols-4 items-center">
              <span className="text-xs text-slate-400">{lbl}</span>
              {[4, 2, 1].map(b => (
                <label key={b} className="flex justify-center cursor-pointer">
                  <input type="checkbox" checked={bit(shift, b)} onChange={() => toggle(shift, b)} className="accent-indigo-500 w-3.5 h-3.5"/>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Oktal:</span>
          <input value={octal} onChange={e => handleOctal(e.target.value)} maxLength={3}
            className="w-16 bg-[var(--color-base)] border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500"/>
          <span className="text-xs text-slate-600 font-mono">{permStr((mode>>6)&7)}{permStr((mode>>3)&7)}{permStr(mode&7)}</span>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 text-slate-400 hover:text-slate-200 transition-colors">Abbrechen</button>
          <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors">
            {saving ? 'Speichere…' : 'Übernehmen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pane ─────────────────────────────────────────────────────────────────────

function Pane({
  title, path, entries, loading, error, selected,
  onSelect, onOpen, onNavigate, onGoUp, onRefresh,
  onPickFolder, onOpenInExplorer, onContextMenu, extraActions,
  onDragStartEntry, onDropOnPane
}: {
  title: React.ReactNode; path: string; entries: PaneEntry[]; loading: boolean; error: string | null
  selected: Set<string>; onSelect: (n: string, multi: boolean) => void; onOpen: (e: PaneEntry) => void
  onNavigate: (p: string) => void; onGoUp: () => void; onRefresh: () => void
  onPickFolder?: () => void; onOpenInExplorer?: () => void
  onContextMenu?: (entry: PaneEntry | null, x: number, y: number) => void
  extraActions?: React.ReactNode
  onDragStartEntry?: (entry: PaneEntry) => void
  onDropOnPane?: (entry: PaneEntry | null, e: React.DragEvent) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragEnterCount = useRef(0)
  const [paneHighlight, setPaneHighlight] = useState(false)
  const [entryHighlight, setEntryHighlight] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'type' | 'mtime'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const clearDragState = () => { dragEnterCount.current = 0; setPaneHighlight(false); setEntryHighlight(null) }

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    let cmp = 0
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortBy === 'size') cmp = (a.size ?? 0) - (b.size ?? 0)
    else if (sortBy === 'type') cmp = getFileType(a).localeCompare(getFileType(b))
    else if (sortBy === 'mtime') cmp = (a.mtime ?? 0) - (b.mtime ?? 0)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const selEntries = entries.filter(e => selected.has(e.name))
  const selSize = selEntries.reduce((s, e) => s + (e.size ?? 0), 0)
  const totalSize = entries.filter(e => !e.isDirectory).reduce((s, e) => s + (e.size ?? 0), 0)

  const SortHdr = ({ col, label, cls = '' }: { col: typeof sortBy; label: string; cls?: string }) => (
    <button onClick={() => toggleSort(col)}
      className={`flex items-center gap-1 hover:text-slate-300 transition-colors ${sortBy === col ? 'text-indigo-400' : 'text-slate-600'} ${cls}`}>
      {label}
      {sortBy === col && <span className="text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  )

  return (
    <div className="flex flex-col flex-1 min-w-0 border border-slate-800 rounded-xl overflow-hidden bg-[var(--color-surface)]">
      {/* Pane header: title + path navigation */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-[var(--color-elevated)] flex-shrink-0">
        <div className="flex-shrink-0 w-auto">{typeof title === 'string'
          ? <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
          : title}
        </div>
        <div className="w-px h-4 bg-slate-800 flex-shrink-0"/>
        <button onClick={onGoUp} title="Übergeordneter Ordner (Backspace)"
          className="flex items-center justify-center w-6 h-6 rounded flex-shrink-0 text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M7.293 3.293a1 1 0 011.414 0l5 5a1 1 0 01-1.414 1.414L9 6.414V13a1 1 0 11-2 0V6.414L3.707 9.707a1 1 0 01-1.414-1.414l5-5z" clipRule="evenodd"/>
          </svg>
        </button>
        <input ref={inputRef} defaultValue={path} key={path}
          onKeyDown={e => { if (e.key === 'Enter') onNavigate(inputRef.current?.value ?? path) }}
          title="Pfad eingeben und Enter drücken"
          className="flex-1 min-w-0 bg-[var(--color-base)] border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-indigo-500"/>
        <button onClick={onRefresh} title="Aktualisieren (F5)" className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 flex-shrink-0">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4v1L6 3l2-2v1z" clipRule="evenodd"/></svg>
        </button>
        {onPickFolder && (
          <button onClick={onPickFolder} title="Lokalen Ordner auswählen" className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 flex-shrink-0">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M1 3.5A1.5 1.5 0 012.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/></svg>
          </button>
        )}
        {onOpenInExplorer && (
          <button onClick={onOpenInExplorer} title="Im Windows Explorer öffnen" className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 flex-shrink-0">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M1.5 1h6v1.5h-4v11h11v-4H16V14a1 1 0 01-1 1H1a1 1 0 01-1-1V2a1 1 0 011-1zm8 0H16v6.5l-2-2-3.5 3.5-1.5-1.5L12.5 4l-2-2H9.5V1z" clipRule="evenodd"/></svg>
          </button>
        )}
        {extraActions}
      </div>

      {/* Sortable column headers */}
      <div className="grid text-xs px-3 py-1 border-b border-slate-800 bg-[var(--color-elevated)] flex-shrink-0 select-none"
        style={{ gridTemplateColumns: '1fr 70px 110px 130px' }}>
        <SortHdr col="name" label="Name"/>
        <SortHdr col="size" label="Größe" cls="justify-end"/>
        <SortHdr col="type" label="Typ" cls="justify-start pl-2"/>
        <SortHdr col="mtime" label="Geändert" cls="justify-end"/>
      </div>

      {/* File list */}
      <div
        className={`flex-1 overflow-y-auto transition-colors ${paneHighlight ? 'bg-indigo-900/10 ring-2 ring-inset ring-indigo-500/40' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); dragEnterCount.current++; setPaneHighlight(true) }}
        onDragLeave={() => { dragEnterCount.current--; if (dragEnterCount.current <= 0) { dragEnterCount.current = 0; setPaneHighlight(false) } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); clearDragState(); onDropOnPane?.(null, e) }}
        onContextMenu={e => {
          if (!(e.target as HTMLElement).closest('[data-entry]')) { e.preventDefault(); onContextMenu?.(null, e.clientX, e.clientY) }
        }}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            <span className="text-xs">Lade…</span>
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8 text-red-500/60"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            <p className="text-red-400 text-xs text-center">{error}</p>
            <button onClick={onRefresh} className="text-xs px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">Erneut versuchen</button>
          </div>
        )}
        {!loading && !error && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/></svg>
            <span className="text-xs">Ordner ist leer</span>
          </div>
        )}
        {!loading && !error && sorted.map(entry => (
          <div key={entry.name} data-entry="1"
            draggable
            onDragStart={(e) => { e.stopPropagation(); onDragStartEntry?.(entry) }}
            onDragEnd={() => clearDragState()}
            onDragEnter={entry.isDirectory ? (e) => { e.preventDefault(); e.stopPropagation(); setEntryHighlight(entry.name) } : undefined}
            onDragLeave={entry.isDirectory ? (e) => { e.stopPropagation(); setEntryHighlight(null) } : undefined}
            onDragOver={entry.isDirectory ? (e) => { e.preventDefault(); e.stopPropagation() } : undefined}
            onDrop={entry.isDirectory ? (e) => { e.preventDefault(); e.stopPropagation(); clearDragState(); onDropOnPane?.(entry, e) } : undefined}
            onClick={e => onSelect(entry.name, e.ctrlKey || e.metaKey)}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!selected.has(entry.name)) onSelect(entry.name, false); onContextMenu?.(entry, e.clientX, e.clientY) }}
            title={`${entry.name}${entry.isDirectory ? '' : ' — ' + fmtSize(entry.size)}`}
            className={`grid items-center px-3 py-0.5 cursor-pointer select-none text-xs transition-colors gap-2
              ${entryHighlight === entry.name && entry.isDirectory ? 'bg-indigo-500/25 ring-1 ring-inset ring-indigo-400/60 text-white' : ''}
              ${selected.has(entry.name) ? 'bg-indigo-600/20 text-slate-200' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'}`}
            style={{ gridTemplateColumns: '1fr 70px 110px 130px' }}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              {entry.isDirectory ? <FolderIcon /> : <FileIcon name={entry.name} />}
              <span className="truncate">{entry.name}</span>
            </span>
            <span className="text-right tabular-nums text-slate-600">{entry.isDirectory ? '' : fmtSize(entry.size)}</span>
            <span className="text-slate-600 pl-2 truncate">{getFileType(entry)}</span>
            <span className="text-right tabular-nums text-slate-600">{fmtDate(entry.mtime)}</span>
          </div>
        ))}
      </div>

      {/* Status bar — WinSCP style */}
      <div className="px-3 py-1 border-t border-slate-800 text-xs text-slate-600 flex-shrink-0 flex items-center justify-between">
        <span>
          {selected.size > 0
            ? `${fmtSize(selSize)} in ${selected.size} von ${entries.length}`
            : `${entries.length} Einträge`}
        </span>
        <span className="text-slate-700">{fmtSize(totalSize)} gesamt</span>
      </div>
    </div>
  )
}

// ─── New name input ───────────────────────────────────────────────────────────

function NewNameInput({ placeholder, onConfirm, onCancel }: {
  placeholder: string; onConfirm: (v: string) => void; onCancel: () => void
}) {
  const [v, setV] = useState('')
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-slate-800 bg-[var(--color-base)] flex-shrink-0">
      <span className="text-xs text-slate-500">{placeholder}:</span>
      <input autoFocus value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(v); if (e.key === 'Escape') onCancel() }}
        className="flex-1 max-w-xs bg-[var(--color-surface)] border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"/>
      <button onClick={() => onConfirm(v)} className="text-xs px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">OK</button>
      <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Abbrechen</button>
    </div>
  )
}

// ─── Files Session (one per tab) ──────────────────────────────────────────────

type LeftSource = { type: 'local' } | { type: 'cloud'; conn: CloudConnection } | { type: 'sftp'; id: string; name: string }

function FilesSession({ serverId, isActive }: { serverId: string; isActive: boolean }) {
  const { servers } = useServerStore()
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connError, setConnError] = useState<string | null>(null)

  const [remotePath, setRemotePath] = useState('/')
  const [remoteEntries, setRemoteEntries] = useState<PaneEntry[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [remoteSelected, setRemoteSelected] = useState<Set<string>>(new Set())

  const [localPath, setLocalPath] = useState(typeof process !== 'undefined' && process.platform === 'win32' ? 'C:\\' : '/')
  const [localEntries, setLocalEntries] = useState<PaneEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set())

  // ── Left pane source ──
  const [leftSource, setLeftSource] = useState<LeftSource>({ type: 'local' })
  const [cloudConns, setCloudConns] = useState<CloudConnection[]>([])
  const [leftPickerOpen, setLeftPickerOpen] = useState(false)
  const leftSourceRef = useRef<LeftSource>({ type: 'local' })
  useEffect(() => { leftSourceRef.current = leftSource }, [leftSource])

  const [busy, setBusy] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [editEntry, setEditEntry] = useState<SftpEntry | null>(null)
  const [renameEntry, setRenameEntry] = useState<SftpEntry | null>(null)
  const [pendingInput, setPendingInput] = useState<'folder' | 'file' | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<SftpEntry[] | null>(null)
  const [propsEntry, setPropsEntry] = useState<SftpEntry | null>(null)
  const [chmodEntry, setChmodEntry] = useState<SftpEntry | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const dragSrcRef = useRef<{ entries: PaneEntry[]; fromPane: 'local' | 'remote' } | null>(null)

  const server = servers.find(s => s.id === serverId)

  const status = (text: string, ok = true) => {
    setStatusMsg({ text, ok })
    setTimeout(() => setStatusMsg(null), 4000)
  }

  // Auto-connect on mount + load cloud connections
  useEffect(() => {
    doConnect()
    window.electronAPI.cloud.list().then(r => { if (r.ok && r.data) setCloudConns(r.data) })
  }, [])

  const loadRemote = useCallback(async (path: string) => {
    setRemoteLoading(true); setRemoteError(null); setRemoteSelected(new Set())
    const res = await window.electronAPI.sftpBrowser.list(serverId, path)
    setRemoteLoading(false)
    if (res.ok && res.data) { setRemoteEntries(res.data.map(e => ({ ...e, _type: 'remote' as const }))); setRemotePath(path) }
    else setRemoteError(res.error ?? 'Fehler')
  }, [serverId])

  const silentLoadRemote = useCallback(async (path: string) => {
    const res = await window.electronAPI.sftpBrowser.list(serverId, path)
    if (res.ok && res.data) setRemoteEntries(res.data.map(e => ({ ...e, _type: 'remote' as const })))
  }, [serverId])

  const loadLocal = useCallback(async (path: string) => {
    setLocalLoading(true); setLocalError(null); setLocalSelected(new Set())
    const src = leftSourceRef.current
    if (src.type === 'local') {
      const res = await window.electronAPI.sftpBrowser.listLocal(path)
      setLocalLoading(false)
      if (res.ok && res.data) { setLocalEntries(res.data.map(e => ({ ...e, _type: 'local' as const }))); setLocalPath(path) }
      else setLocalError(res.error ?? 'Fehler')
    } else if (src.type === 'cloud') {
      const res = await window.electronAPI.cloud.browser.list(src.conn.id, path)
      setLocalLoading(false)
      if (res.ok && res.data) {
        setLocalEntries(res.data.map(e => ({ name: e.name, fullPath: e.fullPath, absolutePath: e.fullPath, isDirectory: e.isDirectory, size: e.size, mtime: e.mtime, _type: 'local' as const })))
        setLocalPath(path)
      } else setLocalError(res.error ?? 'Fehler')
    } else if (src.type === 'sftp') {
      const res = await window.electronAPI.sftpBrowser.list(src.id, path)
      setLocalLoading(false)
      if (res.ok && res.data) { setLocalEntries(res.data.map(e => ({ ...e, _type: 'local' as const }))); setLocalPath(path) }
      else setLocalError(res.error ?? 'Fehler')
    }
  }, [])

  const silentLoadLocal = useCallback(async (path: string) => {
    if (leftSourceRef.current.type !== 'local') return // only auto-refresh local filesystem
    const res = await window.electronAPI.sftpBrowser.listLocal(path)
    if (res.ok && res.data) setLocalEntries(res.data.map(e => ({ ...e, _type: 'local' as const })))
  }, [])

  // Auto-refresh — real-time polling
  const autoRefreshRef   = useRef(autoRefresh)
  const connectedRef     = useRef(connected)
  const remotePathRef    = useRef(remotePath)
  const localPathRef     = useRef(localPath)
  const remoteLoadingRef = useRef(remoteLoading)
  const localLoadingRef  = useRef(localLoading)
  useEffect(() => { autoRefreshRef.current   = autoRefresh   }, [autoRefresh])
  useEffect(() => { connectedRef.current     = connected     }, [connected])
  useEffect(() => { remotePathRef.current    = remotePath    }, [remotePath])
  useEffect(() => { localPathRef.current     = localPath     }, [localPath])
  useEffect(() => { remoteLoadingRef.current = remoteLoading }, [remoteLoading])
  useEffect(() => { localLoadingRef.current  = localLoading  }, [localLoading])
  useEffect(() => {
    // Local: every 2s (cheap fs.readdir) — silent, no loading state
    const localId = setInterval(() => {
      if (!autoRefreshRef.current || localLoadingRef.current) return
      silentLoadLocal(localPathRef.current)
    }, 2000)
    // Remote: every 3s (SFTP list) — silent, no loading state
    const remoteId = setInterval(() => {
      if (!autoRefreshRef.current || !connectedRef.current || remoteLoadingRef.current) return
      silentLoadRemote(remotePathRef.current)
    }, 3000)
    return () => { clearInterval(localId); clearInterval(remoteId) }
  }, [silentLoadRemote, silentLoadLocal])

  const doConnect = async () => {
    setConnecting(true); setConnError(null)
    const res = await window.electronAPI.sftpBrowser.list(serverId, '/')
    setConnecting(false)
    if (res.ok && res.data) {
      setConnected(true)
      setRemoteEntries(res.data.map(e => ({ ...e, _type: 'remote' as const })))
      setRemotePath('/')
      const s = servers.find(s => s.id === serverId)
      loadLocal(s?.localPath || (typeof process !== 'undefined' && process.platform === 'win32' ? 'C:\\' : '/'))
    } else {
      setConnError(res.error ?? 'Verbindung fehlgeschlagen')
    }
  }

  const selectRemote = (name: string, multi: boolean) => setRemoteSelected(prev => { const n = multi ? new Set(prev) : new Set<string>(); if (prev.has(name) && !multi) n.delete(name); else n.add(name); return n })
  const selectLocal  = (name: string, multi: boolean) => setLocalSelected(prev => { const n = multi ? new Set(prev) : new Set<string>(); if (prev.has(name) && !multi) n.delete(name); else n.add(name); return n })

  // Reload left pane when source changes
  useEffect(() => {
    const defaultPath = leftSource.type === 'local' ? localPath : '/'
    setLocalPath(defaultPath)
    loadLocal(defaultPath)
  }, [leftSource]) // eslint-disable-line react-hooks/exhaustive-deps

  const openRemote = (entry: PaneEntry) => { if (entry.isDirectory) loadRemote(entry.fullPath); else setEditEntry(entry as SftpEntry) }
  const openLocal  = (entry: PaneEntry) => { if (entry.isDirectory) loadLocal(entry.fullPath) }

  const upload = async (names?: Set<string>) => {
    const sel = names ?? localSelected; if (!sel.size) return
    setBusy(true); let ok = 0, fail = 0
    const src = leftSourceRef.current
    if (src.type === 'local') {
      for (const name of sel) {
        const e = localEntries.find(e => e.name === name)!
        const res = e.isDirectory
          ? await window.electronAPI.sftpBrowser.uploadFolder(serverId, e.fullPath, joinPath(remotePath, name))
          : await window.electronAPI.sftpBrowser.upload(serverId, e.fullPath, joinPath(remotePath, name))
        if (res.ok) ok++; else fail++
      }
    } else if (src.type === 'cloud') {
      const tmpRes = await window.electronAPI.fs.getTempDir(); if (!tmpRes.ok) { setBusy(false); status('Temp-Verzeichnis nicht verfügbar', false); return }
      const tmp = tmpRes.data!
      for (const name of sel) {
        const e = localEntries.find(e => e.name === name)!
        if (e.isDirectory) { fail++; continue }
        const tmpPath = tmp + '/' + name
        const dl = await window.electronAPI.cloud.browser.download(src.conn.id, e.fullPath, tmpPath)
        if (!dl.ok) { fail++; continue }
        const ul = await window.electronAPI.sftpBrowser.upload(serverId, tmpPath, joinPath(remotePath, name))
        if (ul.ok) ok++; else fail++
      }
    } else if (src.type === 'sftp') {
      const tmpRes = await window.electronAPI.fs.getTempDir(); if (!tmpRes.ok) { setBusy(false); status('Temp-Verzeichnis nicht verfügbar', false); return }
      const tmp = tmpRes.data!
      for (const name of sel) {
        const e = localEntries.find(e => e.name === name)!
        if (e.isDirectory) { fail++; continue }
        const tmpPath = tmp + '/' + name
        const dl = await window.electronAPI.sftpBrowser.download(src.id, e.fullPath, tmpPath)
        if (!dl.ok) { fail++; continue }
        const ul = await window.electronAPI.sftpBrowser.upload(serverId, tmpPath, joinPath(remotePath, name))
        if (ul.ok) ok++; else fail++
      }
    }
    setBusy(false); status(fail ? `${ok} hochgeladen, ${fail} Fehler` : `${ok} Datei(en) hochgeladen`, !fail); loadRemote(remotePath)
  }

  const download = async (names?: Set<string>) => {
    const sel = names ?? remoteSelected; if (!sel.size) return
    setBusy(true); let ok = 0, fail = 0
    const src = leftSourceRef.current
    const sep = localPath.includes('\\') ? '\\' : '/'
    if (src.type === 'local') {
      for (const name of sel) {
        const e = remoteEntries.find(e => e.name === name)!
        if (e.isDirectory) { fail++; continue }
        const res = await window.electronAPI.sftpBrowser.download(serverId, e.fullPath, localPath.replace(/[/\\]$/, '') + sep + name)
        if (res.ok) ok++; else fail++
      }
    } else if (src.type === 'cloud') {
      const tmpRes = await window.electronAPI.fs.getTempDir(); if (!tmpRes.ok) { setBusy(false); status('Temp-Verzeichnis nicht verfügbar', false); return }
      const tmp = tmpRes.data!
      for (const name of sel) {
        const e = remoteEntries.find(e => e.name === name)!
        if (e.isDirectory) { fail++; continue }
        const tmpPath = tmp + '/' + name
        const dl = await window.electronAPI.sftpBrowser.download(serverId, e.fullPath, tmpPath)
        if (!dl.ok) { fail++; continue }
        const cloudDest = localPath.replace(/\/$/, '') + '/' + name
        const ul = await window.electronAPI.cloud.browser.upload(src.conn.id, tmpPath, cloudDest)
        if (ul.ok) ok++; else fail++
      }
    } else if (src.type === 'sftp') {
      const tmpRes = await window.electronAPI.fs.getTempDir(); if (!tmpRes.ok) { setBusy(false); status('Temp-Verzeichnis nicht verfügbar', false); return }
      const tmp = tmpRes.data!
      for (const name of sel) {
        const e = remoteEntries.find(e => e.name === name)!
        if (e.isDirectory) { fail++; continue }
        const tmpPath = tmp + '/' + name
        const dl = await window.electronAPI.sftpBrowser.download(serverId, e.fullPath, tmpPath)
        if (!dl.ok) { fail++; continue }
        const ul = await window.electronAPI.sftpBrowser.upload(src.id, tmpPath, localPath.replace(/\/$/, '') + '/' + name)
        if (ul.ok) ok++; else fail++
      }
    }
    setBusy(false); status(fail ? `${ok} heruntergeladen, ${fail} Fehler` : `${ok} Datei(en) heruntergeladen`, !fail); loadLocal(localPath)
  }

  const startDelete = (entries?: SftpEntry[]) => {
    const sel = entries ?? (remoteEntries.filter(e => remoteSelected.has(e.name)) as SftpEntry[])
    if (sel.length) setDeleteConfirm(sel)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    setBusy(true)
    for (const e of deleteConfirm) await window.electronAPI.sftpBrowser.deleteRemote(serverId, e.fullPath, e.isDirectory)
    setBusy(false); setDeleteConfirm(null); status(`${deleteConfirm.length} Element(e) gelöscht`); loadRemote(remotePath)
  }

  const doRename = async (newName: string) => {
    if (!renameEntry || !newName || newName === renameEntry.name) { setRenameEntry(null); return }
    setBusy(true)
    const res = await window.electronAPI.sftpBrowser.rename(serverId, renameEntry.fullPath, joinPath(parentPath(renameEntry.fullPath), newName))
    setBusy(false); setRenameEntry(null)
    if (res.ok) { status('Umbenannt'); loadRemote(remotePath) } else status(res.error ?? 'Fehler', false)
  }

  const doMkdir = async (name: string) => {
    if (!name) { setPendingInput(null); return }
    setBusy(true)
    const res = await window.electronAPI.sftpBrowser.mkdir(serverId, joinPath(remotePath, name))
    setBusy(false); setPendingInput(null)
    if (res.ok) { status('Ordner erstellt'); loadRemote(remotePath) } else status(res.error ?? 'Fehler', false)
  }

  const doMkfile = async (name: string) => {
    if (!name) { setPendingInput(null); return }
    setBusy(true)
    const res = await window.electronAPI.sftpBrowser.writeFile(serverId, joinPath(remotePath, name), '')
    setBusy(false); setPendingInput(null)
    if (res.ok) { status('Datei erstellt'); loadRemote(remotePath) } else status(res.error ?? 'Fehler', false)
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragStart = (entry: PaneEntry, fromPane: 'local' | 'remote', currentSelected: Set<string>, allEntries: PaneEntry[]) => {
    const toDrag = currentSelected.has(entry.name)
      ? allEntries.filter(e => currentSelected.has(e.name))
      : [entry]
    dragSrcRef.current = { entries: toDrag, fromPane }
  }

  const handleDrop = async (targetPane: 'local' | 'remote', targetEntry: PaneEntry | null, e: React.DragEvent) => {
    const src = dragSrcRef.current
    dragSrcRef.current = null

    // OS → Remote: files dragged from Windows Explorer / Finder
    if (!src && e.dataTransfer.files.length > 0 && targetPane === 'remote') {
      const targetDir = targetEntry?.isDirectory ? targetEntry.fullPath : remotePath
      setBusy(true); let ok = 0, fail = 0
      for (const file of Array.from(e.dataTransfer.files)) {
        const filePath = (file as File & { path?: string }).path
        if (!filePath) continue
        const dest = targetDir.replace(/\/$/, '') + '/' + file.name
        const res = await window.electronAPI.sftpBrowser.upload(serverId, filePath, dest)
        if (res.ok) ok++; else fail++
      }
      setBusy(false)
      status(fail ? `${ok} hochgeladen, ${fail} Fehler` : `${ok} Datei(en) hochgeladen`, !fail)
      loadRemote(remotePath)
      return
    }

    if (!src) return

    if (src.fromPane === 'local' && targetPane === 'remote') {
      // Local → Remote: upload
      const targetDir = targetEntry?.isDirectory ? targetEntry.fullPath : remotePath
      setBusy(true); let ok = 0, fail = 0
      for (const entry of src.entries) {
        const dest = targetDir.replace(/\/$/, '') + '/' + entry.name
        const res = entry.isDirectory
          ? await window.electronAPI.sftpBrowser.uploadFolder(serverId, entry.fullPath, dest)
          : await window.electronAPI.sftpBrowser.upload(serverId, entry.fullPath, dest)
        if (res.ok) ok++; else fail++
      }
      setBusy(false)
      status(fail ? `${ok} hochgeladen, ${fail} Fehler` : `${ok} Datei(en) hochgeladen`, !fail)
      loadRemote(remotePath)

    } else if (src.fromPane === 'remote' && targetPane === 'local') {
      // Remote → Local: download
      const targetDir = targetEntry?.isDirectory ? targetEntry.fullPath : localPath
      const sep = targetDir.includes('\\') ? '\\' : '/'
      setBusy(true); let ok = 0, fail = 0
      for (const entry of src.entries) {
        if (entry.isDirectory) { fail++; continue }
        const dest = targetDir.replace(/[/\\]$/, '') + sep + entry.name
        const res = await window.electronAPI.sftpBrowser.download(serverId, entry.fullPath, dest)
        if (res.ok) ok++; else fail++
      }
      setBusy(false)
      status(fail ? `${ok} heruntergeladen, ${fail} Fehler` : `${ok} Datei(en) heruntergeladen`, !fail)
      loadLocal(localPath)

    } else if (src.fromPane === 'remote' && targetPane === 'remote' && targetEntry?.isDirectory) {
      // Remote → Remote folder: move
      if (src.entries.some(e => e.fullPath === targetEntry.fullPath)) return
      setBusy(true); let ok = 0, fail = 0
      for (const entry of src.entries) {
        const dest = targetEntry.fullPath.replace(/\/$/, '') + '/' + entry.name
        const res = await window.electronAPI.sftpBrowser.rename(serverId, entry.fullPath, dest)
        if (res.ok) ok++; else fail++
      }
      setBusy(false)
      status(fail ? `${ok} verschoben, ${fail} Fehler` : `${ok} Element(e) verschoben`, !fail)
      loadRemote(remotePath)
    }
  }

  // ── Context menus ────────────────────────────────────────────────────────

  const openRemoteCtx = (entry: PaneEntry | null, x: number, y: number) => {
    const sftp = entry as SftpEntry | null
    const items: MenuItem[] = []
    if (sftp) {
      if (!sftp.isDirectory) items.push({ label: 'Bearbeiten', icon: <EditIcon />, action: () => setEditEntry(sftp) })
      items.push({ label: 'Herunterladen', icon: <DownloadIcon />, disabled: sftp.isDirectory, action: () => download(new Set([sftp.name])) })
      items.push({ separator: true })
      items.push({ label: 'Umbenennen', icon: <RenameIcon />, action: () => setRenameEntry(sftp) })
      items.push({ label: 'Löschen', danger: true, icon: <TrashIcon />, action: () => startDelete([sftp]) })
      items.push({ separator: true })
    }
    items.push({ label: 'Neue Datei', icon: <PlusIcon />, action: () => setPendingInput('file') })
    items.push({ label: 'Neuer Ordner', icon: <FolderPlusIcon />, action: () => setPendingInput('folder') })
    items.push({ separator: true })
    items.push({ label: 'Aktualisieren', icon: <RefreshIcon />, action: () => loadRemote(remotePath) })
    if (sftp) {
      items.push({ separator: true })
      items.push({ label: 'Rechte setzen', icon: <LockIcon />, action: () => setChmodEntry(sftp) })
      items.push({ label: 'Eigenschaften', icon: <InfoIcon />, action: () => setPropsEntry(sftp) })
    }
    setCtxMenu({ x, y, items })
  }

  const openLocalCtx = (entry: PaneEntry | null, x: number, y: number) => {
    const items: MenuItem[] = []
    if (entry) items.push({ label: 'Hochladen', icon: <UploadIcon />, action: () => upload(new Set([entry.name])) })
    if (entry) items.push({ separator: true })
    if (leftSourceRef.current.type === 'local') {
      items.push({ label: 'Im Explorer öffnen', icon: <FolderIcon />, action: () => window.electronAPI.sftpBrowser.openLocalFolder(localPath) })
    }
    items.push({ label: 'Aktualisieren', icon: <RefreshIcon />, action: () => loadLocal(localPath) })
    setCtxMenu({ x, y, items })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const selectedRemoteEntries = remoteEntries.filter(e => remoteSelected.has(e.name))

  return (
    <div className="flex-1 flex-col min-h-0 overflow-hidden" style={{ display: isActive ? 'flex' : 'none' }}>
      {/* Connecting / error state */}
      {(connecting || !connected) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[var(--color-base)]">
          {connecting
            ? <p className="text-slate-500 text-sm animate-pulse">Verbinde mit {server?.name ?? serverId}…</p>
            : <>
                {connError && <p className="text-red-400 text-sm text-center px-6">{connError}</p>}
                <button onClick={doConnect} className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                  Erneut verbinden
                </button>
              </>
          }
        </div>
      )}

      {/* Main browser UI */}
      {connected && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-[var(--color-elevated)] flex-shrink-0">
            <span className="text-xs text-slate-500 flex items-center gap-1.5 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />{server?.name}
            </span>
            <div className="w-px h-4 bg-slate-800 flex-shrink-0" />

            <button onClick={() => upload()} disabled={busy || !localSelected.size}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 transition-colors">
              <UploadIcon className="w-3.5 h-3.5 text-emerald-400" /> Hochladen
            </button>
            <button onClick={() => download()} disabled={busy || !remoteSelected.size || selectedRemoteEntries.some(e => e.isDirectory)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 transition-colors">
              <DownloadIcon className="w-3.5 h-3.5 text-blue-400" /> Herunterladen
            </button>

            <div className="w-px h-4 bg-slate-800 flex-shrink-0" />

            <button onClick={() => { const e = selectedRemoteEntries[0]; if (e && !e.isDirectory) setEditEntry(e as SftpEntry) }}
              disabled={selectedRemoteEntries.length !== 1 || selectedRemoteEntries[0]?.isDirectory}
              className="px-3 py-1 text-xs rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 transition-colors">Bearbeiten</button>
            <button onClick={() => { const e = selectedRemoteEntries[0]; if (e) setRenameEntry(e as SftpEntry) }}
              disabled={selectedRemoteEntries.length !== 1}
              className="px-3 py-1 text-xs rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-30 transition-colors">Umbenennen</button>
            <button onClick={() => setPendingInput('file')}
              className="px-3 py-1 text-xs rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">Neue Datei</button>
            <button onClick={() => setPendingInput('folder')}
              className="px-3 py-1 text-xs rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">Neuer Ordner</button>
            <button onClick={() => startDelete()} disabled={!remoteSelected.size}
              className="px-3 py-1 text-xs rounded border border-red-900 text-red-500 hover:bg-red-900/20 disabled:opacity-30 transition-colors">Löschen</button>

            <div className="flex-1" />
            {busy && <span className="text-xs text-indigo-400 animate-pulse">Übertrage…</span>}
            {statusMsg && !busy && <span className={`text-xs ${statusMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{statusMsg.text}</span>}
            <button onClick={() => setAutoRefresh(p => !p)}
              title={autoRefresh ? 'Auto-Refresh aktiv (alle 30s) — klicken zum Deaktivieren' : 'Auto-Refresh deaktiviert — klicken zum Aktivieren'}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors
                ${autoRefresh
                  ? 'border-emerald-700 text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/40'
                  : 'border-slate-700 text-slate-600 hover:text-slate-400 hover:border-slate-600'}`}>
              <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 ${autoRefresh ? 'animate-spin [animation-duration:3s]' : ''}`}>
                <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4v1L6 3l2-2v1z" clipRule="evenodd"/>
              </svg>
              Auto
            </button>
            <button onClick={() => setConnected(false)}
              className="ml-2 px-2 py-1 text-xs rounded border border-slate-800 text-slate-600 hover:text-slate-400 hover:border-slate-700 transition-colors">Trennen</button>
          </div>

          {pendingInput === 'folder' && <NewNameInput placeholder="Ordnername" onConfirm={doMkdir} onCancel={() => setPendingInput(null)} />}
          {pendingInput === 'file'   && <NewNameInput placeholder="Dateiname"  onConfirm={doMkfile} onCancel={() => setPendingInput(null)} />}

          <div className="flex flex-1 gap-2 p-2 min-h-0">
            <Pane
              title={
                <div className="relative flex-shrink-0">
                  <button onClick={() => setLeftPickerOpen(p => !p)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors">
                    {leftSource.type === 'local' ? 'Lokal' : leftSource.type === 'cloud' ? (CLOUD_LABELS[leftSource.conn.type]?.icon + ' ' + leftSource.conn.name) : ('⇄ ' + leftSource.name)}
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 mt-px"><path fillRule="evenodd" d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z" clipRule="evenodd"/></svg>
                  </button>
                  {leftPickerOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--color-elevated)] border border-slate-700 rounded-lg shadow-2xl py-1 min-w-48"
                      onMouseLeave={() => setLeftPickerOpen(false)}>
                      <div className="px-2 py-1 text-xs text-slate-600 uppercase tracking-wider">Quelle wählen</div>
                      <button onClick={() => { setLeftSource({ type: 'local' }); setLeftPickerOpen(false) }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-800 flex items-center gap-2 ${leftSource.type === 'local' ? 'text-indigo-400' : 'text-slate-300'}`}>
                        🖥 Lokales Dateisystem
                      </button>
                      {cloudConns.length > 0 && <div className="border-t border-slate-800 my-1"/>}
                      {cloudConns.map(c => (
                        <button key={c.id} onClick={() => { setLeftSource({ type: 'cloud', conn: c }); setLeftPickerOpen(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-800 flex items-center gap-2 ${leftSource.type === 'cloud' && leftSource.conn.id === c.id ? 'text-indigo-400' : 'text-slate-300'}`}>
                          {CLOUD_LABELS[c.type]?.icon} {c.name}
                        </button>
                      ))}
                      {servers.filter(s => s.id !== serverId).length > 0 && <div className="border-t border-slate-800 my-1"/>}
                      {servers.filter(s => s.id !== serverId).map(s => (
                        <button key={s.id} onClick={() => { setLeftSource({ type: 'sftp', id: s.id, name: s.name }); setLeftPickerOpen(false) }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-800 flex items-center gap-2 ${leftSource.type === 'sftp' && leftSource.id === s.id ? 'text-indigo-400' : 'text-slate-300'}`}>
                          ⇄ {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              }
              path={localPath} entries={localEntries} loading={localLoading} error={localError}
              selected={localSelected} onSelect={selectLocal} onOpen={openLocal}
              onNavigate={loadLocal} onGoUp={() => loadLocal(parentPath(localPath))} onRefresh={() => loadLocal(localPath)}
              onContextMenu={openLocalCtx}
              onPickFolder={leftSource.type === 'local' ? async () => { const r = await window.electronAPI.sftpBrowser.pickLocalFolder(); if (r.ok && r.data) loadLocal(r.data) } : undefined}
              onOpenInExplorer={leftSource.type === 'local' ? () => window.electronAPI.sftpBrowser.openLocalFolder(localPath) : undefined}
              onDragStartEntry={(entry) => handleDragStart(entry, 'local', localSelected, localEntries)}
              onDropOnPane={(targetEntry, e) => handleDrop('local', targetEntry, e)}
            />
            <Pane title="Remote" path={remotePath} entries={remoteEntries} loading={remoteLoading} error={remoteError}
              selected={remoteSelected} onSelect={selectRemote} onOpen={openRemote}
              onNavigate={loadRemote} onGoUp={() => loadRemote(parentPath(remotePath))} onRefresh={() => loadRemote(remotePath)}
              onContextMenu={openRemoteCtx}
              onDragStartEntry={(entry) => handleDragStart(entry, 'remote', remoteSelected, remoteEntries)}
              onDropOnPane={(targetEntry, e) => handleDrop('remote', targetEntry, e)}
            />
          </div>
        </>
      )}

      {/* Context menu */}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}

      {/* Modals */}
      {editEntry && <FileEditor serverId={serverId} entry={editEntry} onClose={() => setEditEntry(null)} onSaved={() => { setEditEntry(null); status('Datei gespeichert'); loadRemote(remotePath) }} />}
      {renameEntry && <RenameDialog name={renameEntry.name} onConfirm={doRename} onClose={() => setRenameEntry(null)} />}
      {propsEntry && <PropertiesDialog entry={propsEntry} onClose={() => setPropsEntry(null)} />}
      {chmodEntry && <ChmodDialog entry={chmodEntry} serverId={serverId} onClose={() => setChmodEntry(null)} onDone={() => { setChmodEntry(null); status('Rechte gesetzt'); loadRemote(remotePath) }} />}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-80 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Löschen bestätigen</h3>
            <p className="text-xs text-slate-400">
              {deleteConfirm.length === 1 ? <>„<span className="text-white">{deleteConfirm[0].name}</span>" wirklich löschen?</> : <>{deleteConfirm.length} Elemente wirklich löschen?</>}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="text-xs px-3 py-1.5 text-slate-400 hover:text-slate-200">Abbrechen</button>
              <button onClick={confirmDelete} className="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white transition-colors">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Small icon helpers ───────────────────────────────────────────────────────

const EditIcon      = () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.854.146a.5.5 0 00-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 000-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.5h.5a.5.5 0 01.5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 016 13.5V13h-.5a.5.5 0 01-.5-.5V12h-.5a.5.5 0 01-.5-.5V11h-.5a.5.5 0 01-.5-.5V10h-.5a.499.499 0 01-.175-.032l-.179.178a.5.5 0 00-.11.168l-2 5a.5.5 0 00.65.65l5-2a.5.5 0 00.168-.11l.178-.178z"/></svg>
const TrashIcon     = () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h4a1 1 0 011-1h2a1 1 0 011 1h4a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3a.5.5 0 000 1h11a.5.5 0 000-1h-11z" clipRule="evenodd"/></svg>
const RenameIcon    = () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M0 4.5A2.5 2.5 0 012.5 2H3v1h-.5A1.5 1.5 0 001 4.5v7A1.5 1.5 0 002.5 13H3v1h-.5A2.5 2.5 0 010 11.5v-7zm13 0V2h.5A2.5 2.5 0 0116 4.5v7a2.5 2.5 0 01-2.5 2.5H13v-1h.5a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0013.5 3H13v-1h.5z"/></svg>
const RefreshIcon   = () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4v1L6 3l2-2v1z" clipRule="evenodd"/></svg>
const PlusIcon      = () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z" clipRule="evenodd"/></svg>
const FolderPlusIcon= () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M9.828 3h3.982a2 2 0 011.992 2.181l-.637 7A2 2 0 0113.174 14H2.825a2 2 0 01-1.991-1.819l-.637-7a1.99 1.99 0 01.342-1.31L.5 3a2 2 0 012-2h3.672a2 2 0 011.414.586l.828.828A2 2 0 009.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 006.172 2H2.5a1 1 0 00-1 1v.12z"/></svg>
const LockIcon      = () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 1a2 2 0 012 2v4H6V3a2 2 0 012-2zm3 6V3a3 3 0 00-6 0v4a2 2 0 00-2 2v5a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2H11z"/></svg>
const InfoIcon      = () => <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/><path d="M8.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588z"/><circle cx="8" cy="4.5" r="1"/></svg>
const UploadIcon    = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => <svg viewBox="0 0 16 16" fill="currentColor" className={className}><path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/><path d="M7.646 1.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 2.707V11.5a.5.5 0 01-1 0V2.707L5.354 4.854a.5.5 0 11-.708-.708l3-3z"/></svg>
const DownloadIcon  = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => <svg viewBox="0 0 16 16" fill="currentColor" className={className}><path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/><path d="M7.646 11.854a.5.5 0 00.708 0l3-3a.5.5 0 00-.708-.708L8.5 10.293V1.5a.5.5 0 00-1 0v8.793L5.354 8.146a.5.5 0 10-.708.708l3 3z"/></svg>

// ─── Cloud provider icons / labels ───────────────────────────────────────────

const CLOUD_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  webdav:   { label: 'WebDAV',    color: 'text-sky-400',    icon: '🌐' },
  gdrive:   { label: 'Google Drive', color: 'text-yellow-400', icon: '📂' },
  dropbox:  { label: 'Dropbox',   color: 'text-blue-400',   icon: '📦' },
  onedrive: { label: 'OneDrive',  color: 'text-blue-300',   icon: '☁️'  },
}

// ─── Connection Hub (unified connection manager) ─────────────────────────────

function ConnectionHub({ onOpenSftp, onOpenCloud, onClose }: {
  onOpenSftp: (id: string, name: string) => void
  onOpenCloud: (conn: CloudConnection) => void
  onClose?: () => void
}) {
  const { servers } = useServerStore()
  const [cloudConns, setCloudConns] = useState<CloudConnection[]>([])
  const [form, setForm] = useState<'sftp' | 'cloud' | null>(null)

  // sftp form
  const [sHost, setSHost] = useState('')
  const [sPort, setSPort] = useState('22')
  const [sUser, setSUser] = useState('')
  const [sPass, setSPass] = useState('')
  const [sConnecting, setSConnecting] = useState(false)
  const [sError, setSError] = useState<string | null>(null)

  // cloud form
  const [cForm, setCForm] = useState<CloudConnectionFormData>({ type: 'webdav', name: '' })
  const [cSaving, setCSaving] = useState(false)
  const [cAuthing, setCAuthing] = useState<string | null>(null)
  const [cError, setCError] = useState<string | null>(null)

  const cf = (k: keyof CloudConnectionFormData, v: string) => setCForm(p => ({ ...p, [k]: v }))

  const reloadCloud = async () => {
    const res = await window.electronAPI.cloud.list()
    if (res.ok && res.data) setCloudConns(res.data)
  }

  useEffect(() => { reloadCloud() }, [])

  const connectSftp = async () => {
    if (!sHost || !sUser) { setSError('Host und Benutzername sind erforderlich'); return }
    setSConnecting(true); setSError(null)
    const res = await window.electronAPI.sftpBrowser.connectDirect({
      host: sHost, port: parseInt(sPort) || 22,
      username: sUser, password: sPass || undefined, authType: 'password'
    })
    setSConnecting(false)
    if (res.ok && res.data) { setForm(null); onOpenSftp(res.data, sUser + '@' + sHost) }
    else setSError(res.error ?? 'Verbindung fehlgeschlagen')
  }

  const saveCloud = async () => {
    if (!cForm.name) { setCError('Name ist erforderlich'); return }
    setCSaving(true); setCError(null)
    const res = await window.electronAPI.cloud.create(cForm)
    setCSaving(false)
    if (res.ok && res.data) {
      await reloadCloud()
      setForm(null)
      setCForm({ type: 'webdav', name: '' })
    } else setCError(res.error ?? 'Fehler beim Speichern')
  }

  const doAuth = async (c: CloudConnection) => {
    setCAuthing(c.id)
    const res = await window.electronAPI.cloud.startAuth(c.id)
    setCAuthing(null)
    if (res.ok) reloadCloud()
    else setCError(res.error ?? 'Authentifizierung fehlgeschlagen')
  }

  const inputCls = 'w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors'

  const openForm = (type: 'sftp' | 'cloud') => {
    setSHost(''); setSPort('22'); setSUser(''); setSPass(''); setSError(null)
    setCForm({ type: 'webdav', name: '' }); setCError(null)
    setForm(type)
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-base)]">
      {/* Title bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[var(--color-elevated)] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-indigo-400">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7"/>
          </svg>
          <h2 className="text-sm font-semibold text-white">Verbindungen</h2>
        </div>
        {onClose && <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>}
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">

        {/* ── SFTP ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-slate-600"><path d="M0 4a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H2a2 2 0 01-2-2V4zm2-1a1 1 0 00-1 1v1h14V4a1 1 0 00-1-1H2zm13 4H1v5a1 1 0 001 1h12a1 1 0 001-1V7z"/></svg>
              SFTP
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {servers.map(s => (
              <button key={s.id} onClick={() => onOpenSftp(s.id, s.name)}
                className="flex items-start gap-3 p-4 rounded-xl border border-slate-800 bg-[var(--color-surface)] hover:border-indigo-700 hover:bg-indigo-600/5 transition-all text-left group">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-indigo-600/30 transition-colors">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-indigo-400"><path d="M0 4a2 2 0 012-2h12a2 2 0 012 2v1H0V4zm0 3h16v5a2 2 0 01-2 2H2a2 2 0 01-2-2V7z"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{s.username}@{s.host}:{s.port}</p>
                </div>
              </button>
            ))}
            <button onClick={() => openForm('sftp')}
              className="flex items-start gap-3 p-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-600 hover:bg-indigo-600/5 transition-all text-left group">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-indigo-600/20 transition-colors">
                <span className="text-slate-400 group-hover:text-indigo-400 text-lg leading-none transition-colors">+</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500 group-hover:text-slate-300 transition-colors">Direkt verbinden</p>
                <p className="text-xs text-slate-600 mt-0.5">Ohne Speichern verbinden</p>
              </div>
            </button>
          </div>
        </div>

        {/* ── Cloud ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-slate-600"><path d="M4.406 3.342A5.53 5.53 0 0111.5 9H12a4 4 0 010 8H2.5a3.5 3.5 0 01-.5-6.965V9a4 4 0 014-4 3.984 3.984 0 01-.594 2.658z"/></svg>
              Cloud
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {cloudConns.map(c => {
              const meta = CLOUD_LABELS[c.type]
              const authed = c.hasTokens || c.type === 'webdav'
              return (
                <button key={c.id}
                  onClick={() => authed ? onOpenCloud(c) : doAuth(c)}
                  disabled={cAuthing === c.id}
                  className={'flex items-start gap-3 p-4 rounded-xl border transition-all text-left group ' +
                    (authed
                      ? 'border-slate-800 bg-[var(--color-surface)] hover:border-indigo-700 hover:bg-indigo-600/5'
                      : 'border-amber-900/40 bg-[var(--color-surface)] hover:border-amber-600/60 hover:bg-amber-600/5')}>
                  <div className={'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-base transition-colors ' +
                    (authed ? 'bg-indigo-600/20 group-hover:bg-indigo-600/30' : 'bg-amber-900/30 group-hover:bg-amber-600/20')}>
                    {meta.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">{c.name}</p>
                    <p className={'text-xs mt-0.5 truncate ' + (authed ? 'text-slate-500' : 'text-amber-600')}>
                      {cAuthing === c.id ? 'Warte…' : authed ? meta.label : '⚠ Anmelden erforderlich'}
                    </p>
                  </div>
                </button>
              )
            })}
            <button onClick={() => openForm('cloud')}
              className="flex items-start gap-3 p-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-600 hover:bg-indigo-600/5 transition-all text-left group">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-indigo-600/20 transition-colors">
                <span className="text-slate-400 group-hover:text-indigo-400 text-lg leading-none transition-colors">+</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500 group-hover:text-slate-300 transition-colors">Cloud hinzufügen</p>
                <p className="text-xs text-slate-600 mt-0.5">Drive, Dropbox, OneDrive…</p>
              </div>
            </button>
          </div>
          {cError && <p className="text-xs text-red-400 mt-2">{cError}</p>}
        </div>
      </div>

      {/* ── SFTP form modal ── */}
      {form === 'sftp' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          onClick={() => setForm(null)}>
          <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-indigo-400"><path d="M0 4a2 2 0 012-2h12a2 2 0 012 2v1H0V4zm0 3h16v5a2 2 0 01-2 2H2a2 2 0 01-2-2V7z"/></svg>
                </div>
                <h3 className="text-sm font-semibold text-white">SFTP verbinden</h3>
              </div>
              <button onClick={() => setForm(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Host / IP-Adresse</label>
                  <input autoFocus value={sHost} onChange={e => setSHost(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && connectSftp()} placeholder="192.168.1.1"
                    className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"/>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Port</label>
                  <input value={sPort} onChange={e => setSPort(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && connectSftp()}
                    className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Benutzername</label>
                  <input value={sUser} onChange={e => setSUser(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && connectSftp()} placeholder="root"
                    className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"/>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Passwort</label>
                  <input type="password" value={sPass} onChange={e => setSPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && connectSftp()}
                    className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"/>
                </div>
              </div>
              {sError && <p className="text-xs text-red-400">{sError}</p>}
              <p className="text-xs text-slate-600">Gespeicherte Server lassen sich in den Einstellungen anlegen.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800">
              <button onClick={() => setForm(null)} className="text-xs px-4 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">Abbrechen</button>
              <button onClick={connectSftp} disabled={sConnecting || !sHost || !sUser}
                className="text-xs px-5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors flex items-center gap-1.5">
                {sConnecting ? 'Verbinde…' : 'Verbinden'}
                {!sConnecting && <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M4 8a.5.5 0 01.5-.5h5.793L8.146 5.354a.5.5 0 11.708-.708l3 3a.5.5 0 010 .708l-3 3a.5.5 0 01-.708-.708L10.293 8.5H4.5A.5.5 0 014 8z" clipRule="evenodd"/></svg>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cloud form modal ── */}
      {form === 'cloud' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          onClick={() => setForm(null)}>
          <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-sky-600/20 flex items-center justify-center text-base">☁️</div>
                <h3 className="text-sm font-semibold text-white">Cloud-Speicher verbinden</h3>
              </div>
              <button onClick={() => setForm(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Typ</label>
                  <select value={cForm.type} onChange={e => cf('type', e.target.value as CloudConnectionFormData['type'])}
                    className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500">
                    <option value="webdav">🌐 WebDAV / Nextcloud</option>
                    <option value="gdrive">📂 Google Drive</option>
                    <option value="dropbox">📦 Dropbox</option>
                    <option value="onedrive">☁️ Microsoft OneDrive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Anzeigename</label>
                  <input value={cForm.name} onChange={e => cf('name', e.target.value)} placeholder="Mein Drive"
                    className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"/>
                </div>
              </div>
              {cForm.type === 'webdav' && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Server-URL</label>
                    <input value={cForm.webdavUrl ?? ''} onChange={e => cf('webdavUrl', e.target.value)}
                      placeholder="https://nextcloud.example.com/remote.php/dav/files/user/"
                      className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Benutzername</label>
                      <input value={cForm.webdavUsername ?? ''} onChange={e => cf('webdavUsername', e.target.value)}
                        className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Passwort</label>
                      <input type="password" value={cForm.webdavPassword ?? ''} onChange={e => cf('webdavPassword', e.target.value)}
                        className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"/>
                    </div>
                  </div>
                </>
              )}
              {(cForm.type === 'gdrive' || cForm.type === 'dropbox' || cForm.type === 'onedrive') && (
                <>
                  <div className="text-xs text-slate-600 bg-slate-900/60 rounded-lg p-3 leading-relaxed border border-slate-800">
                    {cForm.type === 'gdrive' && 'Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Typ: Desktop App). Drive API aktivieren.'}
                    {cForm.type === 'dropbox' && 'Dropbox App Console → Create App → App key = Client ID, App secret = Client Secret. Permissions: files.content aktivieren.'}
                    {cForm.type === 'onedrive' && 'Azure Portal → App-Registrierungen → Redirect URI: http://localhost:7842/callback'}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Client ID</label>
                      <input value={cForm.clientId ?? ''} onChange={e => cf('clientId', e.target.value)}
                        className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"/>
                    </div>
                    {cForm.type !== 'onedrive' && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Client Secret</label>
                        <input type="password" value={cForm.clientSecret ?? ''} onChange={e => cf('clientSecret', e.target.value)}
                          className="w-full bg-[var(--color-base)] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"/>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">Nach dem Speichern auf „Anmelden" klicken, um die OAuth-Verbindung herzustellen.</p>
                </>
              )}
              {cError && <p className="text-xs text-red-400">{cError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800">
              <button onClick={() => setForm(null)} className="text-xs px-4 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">Abbrechen</button>
              <button onClick={saveCloud} disabled={cSaving || !cForm.name}
                className="text-xs px-5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors">
                {cSaving ? 'Speichere…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Tab manager ──────────────────────────────────────────────────────────────

interface TabInfo {
  id: string
  type: 'sftp' | 'cloud'
  connectionId: string
  label: string
  cloudConn?: CloudConnection
}

export default function FilesView({ isStandalone = false, isActive = true }: { isStandalone?: boolean; isActive?: boolean }) {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingTab, setAddingTab] = useState(false)

  const addSftpTab = (serverId: string, label: string) => {
    const id = Date.now().toString()
    setTabs(prev => [...prev, { id, type: 'sftp', connectionId: serverId, label }])
    setActiveId(id); setAddingTab(false)
  }

  const addCloudTab = (conn: CloudConnection) => {
    const id = Date.now().toString()
    const meta = CLOUD_LABELS[conn.type]
    setTabs(prev => [...prev, { id, type: 'cloud', connectionId: conn.id, label: `${meta.icon} ${conn.name}`, cloudConn: conn }])
    setActiveId(id); setAddingTab(false)
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTabs(prev => {
      const tab = prev.find(t => t.id === id)
      if (tab?.type === 'sftp' && tab.connectionId.startsWith('temp_')) {
        window.electronAPI.sftpBrowser.removeTemp(tab.connectionId)
      }
      const next = prev.filter(t => t.id !== id)
      if (activeId === id) {
        const idx = prev.findIndex(t => t.id === id)
        setActiveId(next[Math.min(idx, next.length - 1)]?.id ?? null)
      }
      return next
    })
  }

  const hasTabs = tabs.length > 0

  const popoutBtn = !isStandalone && (
    <button onClick={() => window.electronAPI.files.createWindow()} title="Als externes Fenster öffnen"
      className="px-2.5 h-full text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0 border-l border-slate-800">
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M1.5 1a1.5 1.5 0 00-1.5 1.5v11A1.5 1.5 0 001.5 15h8a1.5 1.5 0 001.5-1.5v-2a.5.5 0 00-1 0v2a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5h8a.5.5 0 01.5.5v2a.5.5 0 001 0v-2A1.5 1.5 0 009.5 1h-8z"/>
        <path d="M15.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L14.293 7.5H5.5a.5.5 0 000 1h8.793l-2.147 2.146a.5.5 0 00.708.708l3-3z"/>
      </svg>
    </button>
  )

  return (
    <div className="absolute inset-0 flex flex-col" style={{ display: isActive ? 'flex' : 'none' }}>

      {/* ── Empty state ── */}
      {!hasTabs && (
        <div className="flex-1 flex flex-col min-h-0">
          <ConnectionHub
            onOpenSftp={addSftpTab}
            onOpenCloud={addCloudTab}
          />
          {!isStandalone && (
            <div className="flex justify-center py-2 border-t border-slate-800 bg-[var(--color-elevated)] flex-shrink-0">
              <button onClick={() => window.electronAPI.files.createWindow()}
                className="text-xs text-slate-700 hover:text-slate-500 transition-colors flex items-center gap-1.5">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M1.5 1a1.5 1.5 0 00-1.5 1.5v11A1.5 1.5 0 001.5 15h8a1.5 1.5 0 001.5-1.5v-2a.5.5 0 00-1 0v2a.5.5 0 01-.5.5h-8a.5.5 0 01-.5-.5v-11a.5.5 0 01.5-.5h8a.5.5 0 01.5.5v2a.5.5 0 001 0v-2A1.5 1.5 0 009.5 1h-8z"/>
                  <path d="M15.854 8.354a.5.5 0 000-.708l-3-3a.5.5 0 00-.708.708L14.293 7.5H5.5a.5.5 0 000 1h8.793l-2.147 2.146a.5.5 0 00.708.708l3-3z"/>
                </svg>
                In externem Fenster öffnen
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab bar + sessions ── */}
      {hasTabs && (
        <>
          <div className="flex items-center h-9 border-b border-slate-800 bg-[var(--color-elevated)] flex-shrink-0">
            <div className="flex items-center flex-1 overflow-x-auto min-w-0">
              {tabs.map(tab => (
                <div key={tab.id}
                  onClick={() => { setActiveId(tab.id); setAddingTab(false) }}
                  className={`flex items-center gap-2 px-3 h-full text-xs cursor-pointer border-b-2 whitespace-nowrap flex-shrink-0 transition-colors
                    ${activeId === tab.id
                      ? 'border-indigo-500 text-slate-200'
                      : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                  {tab.type === 'cloud'
                    ? <span className="text-xs flex-shrink-0">{CLOUD_LABELS[tab.cloudConn!.type]?.icon ?? '☁'}</span>
                    : <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-70 flex-shrink-0" />
                  }
                  <span>{tab.label}</span>
                  <button onClick={e => closeTab(tab.id, e)}
                    className="text-slate-600 hover:text-red-400 transition-colors ml-0.5 text-base leading-none">×</button>
                </div>
              ))}
              <button onClick={() => setAddingTab(true)} title="Neue Verbindung"
                className="px-3 h-full text-lg leading-none flex-shrink-0 text-slate-600 hover:text-slate-300 transition-colors">
                +
              </button>
            </div>
            {popoutBtn}
          </div>

          {/* Sessions — always mounted, shown/hidden with CSS */}
          {tabs.map(tab => (
            tab.type === 'cloud'
              ? <CloudSession key={tab.id} conn={tab.cloudConn!} isActive={activeId === tab.id} />
              : <FilesSession key={tab.id} serverId={tab.connectionId} isActive={activeId === tab.id} />
          ))}
        </>
      )}

      {/* ── Add-tab modal ── */}
      {addingTab && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setAddingTab(false)}>
          <div className="bg-[var(--color-surface)] border border-slate-700 rounded-xl shadow-2xl w-[660px] h-[460px] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}>
            <ConnectionHub
              onOpenSftp={(id, name) => { addSftpTab(id, name); setAddingTab(false) }}
              onOpenCloud={(conn) => { addCloudTab(conn); setAddingTab(false) }}
              onClose={() => setAddingTab(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
