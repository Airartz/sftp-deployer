import React, { useEffect, useState } from 'react'
import type { FileEntry } from '../../../../../shared/types'

interface Props {
  folderPath: string
  blacklisted: string[]
  onClose: () => void
  onSave: (patterns: string[]) => void
}

export default function FileBlacklist({ folderPath, blacklisted, onClose, onSave }: Props): React.ReactElement {
  const [tree, setTree] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set(blacklisted))

  useEffect(() => {
    window.electronAPI.fs.listFiles(folderPath).then((res) => {
      if (res.ok && res.data) {
        setTree(res.data)
      } else {
        setError(res.error ?? 'Fehler beim Lesen des Ordners')
      }
      setLoading(false)
    })
  }, [folderPath])

  function toggle(relativePath: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(relativePath)) {
        next.delete(relativePath)
      } else {
        next.add(relativePath)
      }
      return next
    })
  }

  function toggleDir(entry: FileEntry) {
    const allPaths = collectPaths(entry)
    const allSelected = allPaths.every((p) => selected.has(p))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        allPaths.forEach((p) => next.delete(p))
      } else {
        allPaths.forEach((p) => next.add(p))
      }
      return next
    })
  }

  function collectPaths(entry: FileEntry): string[] {
    if (!entry.isDirectory) return [entry.relativePath]
    return (entry.children ?? []).flatMap(collectPaths)
  }

  function handleSave() {
    onSave([...selected])
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-[var(--color-surface)] border border-slate-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-semibold text-white">Dateien blacklisten</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{folderPath}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
        </div>

        {/* Info */}
        <div className="px-6 py-2 text-xs text-slate-500 border-b border-slate-800/50">
          Klick auf Datei oder Ordner = wird nie hochgeladen.
          {selected.size > 0 && (
            <span className="ml-2 text-indigo-400">{selected.size} ausgewählt</span>
          )}
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-red-400 text-sm px-2">{error}</p>
          )}
          {!loading && !error && (
            <FileTree entries={tree} selected={selected} onToggle={toggle} onToggleDir={toggleDir} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Alle abwählen
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-300">
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white transition-colors"
            >
              Übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FileTree({
  entries,
  selected,
  onToggle,
  onToggleDir,
  depth = 0
}: {
  entries: FileEntry[]
  selected: Set<string>
  onToggle: (path: string) => void
  onToggleDir: (entry: FileEntry) => void
  depth?: number
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggleCollapse(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div>
      {entries.map((entry) => {
        const isCollapsed = collapsed.has(entry.relativePath)
        const name = entry.relativePath.split('/').pop()!

        if (entry.isDirectory) {
          const children = entry.children ?? []
          const childPaths = collectAllPaths(entry)
          const allSelected = childPaths.length > 0 && childPaths.every((p) => selected.has(p))
          const someSelected = childPaths.some((p) => selected.has(p))

          return (
            <div key={entry.relativePath}>
              <div
                className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer group"
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
              >
                {/* Collapse toggle */}
                <button
                  onClick={() => toggleCollapse(entry.relativePath)}
                  className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-slate-400 flex-shrink-0"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                  </svg>
                </button>

                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
                  onChange={() => onToggleDir(entry)}
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 flex-shrink-0 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />

                {/* Folder icon + name */}
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-yellow-600 flex-shrink-0">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                </svg>
                <span
                  className={`text-sm truncate ${allSelected ? 'line-through text-slate-600' : 'text-slate-300'}`}
                  onClick={() => toggleCollapse(entry.relativePath)}
                >
                  {name}
                </span>
                {someSelected && !allSelected && (
                  <span className="text-xs text-indigo-400 flex-shrink-0">({childPaths.filter((p) => selected.has(p)).length})</span>
                )}
              </div>

              {!isCollapsed && children.length > 0 && (
                <FileTree
                  entries={children}
                  selected={selected}
                  onToggle={onToggle}
                  onToggleDir={onToggleDir}
                  depth={depth + 1}
                />
              )}
            </div>
          )
        }

        const isSelected = selected.has(entry.relativePath)
        return (
          <div
            key={entry.relativePath}
            className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-800/50 cursor-pointer"
            style={{ paddingLeft: `${depth * 16 + 28}px` }}
            onClick={() => onToggle(entry.relativePath)}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(entry.relativePath)}
              className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 flex-shrink-0 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-600 flex-shrink-0">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
            </svg>
            <span className={`text-sm truncate ${isSelected ? 'line-through text-slate-600' : 'text-slate-400'}`}>
              {name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function collectAllPaths(entry: FileEntry): string[] {
  if (!entry.isDirectory) return [entry.relativePath]
  return (entry.children ?? []).flatMap(collectAllPaths)
}
