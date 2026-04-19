import React from 'react'
import { useUIStore } from '../../store/ui.store'

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  logs: 'Upload-Logs',
  backup: 'Backups',
  stats: 'Statistiken',
  files: 'Datei-Browser',
  terminal: 'Terminal',
  settings: 'Einstellungen'
}

export default function TopBar(): React.ReactElement {
  const { view } = useUIStore()

  return (
    <header className="titlebar-drag h-8 flex items-center px-4 bg-[var(--color-sidebar)] border-b border-slate-800 flex-shrink-0">
      <span className="titlebar-no-drag text-xs font-semibold text-slate-400 uppercase tracking-widest">
        SFTP Deployer — {TITLES[view] ?? view}
      </span>
    </header>
  )
}
