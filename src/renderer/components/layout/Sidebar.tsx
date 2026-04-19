import React from 'react'
import { useUIStore } from '../../store/ui.store'

const NAV = [
  {
    id: 'dashboard', label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <rect x="3" y="3" width="6" height="6" rx="1"/>
        <rect x="11" y="3" width="6" height="6" rx="1"/>
        <rect x="3" y="11" width="6" height="6" rx="1"/>
        <rect x="11" y="11" width="6" height="6" rx="1"/>
      </svg>
    )
  },
  {
    id: 'logs', label: 'Logs',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 010 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 010 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h4a1 1 0 010 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
      </svg>
    )
  },
  {
    id: 'backup', label: 'Backups',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v2H4V5zm0 4h4v2H4V9zm0 4h4v2H4v-2zm6-4h6v6h-6V9z"/>
      </svg>
    )
  },
  {
    id: 'files', label: 'Dateien',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clipRule="evenodd"/>
        <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z"/>
      </svg>
    )
  },
  {
    id: 'terminal', label: 'Terminal',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
      </svg>
    )
  },
  {
    id: 'settings', label: 'Einstellungen',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
      </svg>
    )
  }
] as const

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh')

export default function Sidebar(): React.ReactElement {
  const { view, setView } = useUIStore()

  return (
    <aside className={`w-14 flex flex-col items-center gap-1 bg-[var(--color-sidebar)] border-r border-slate-800 ${isMac ? 'pt-12 pb-4' : 'py-4'}`}>
      {/* Logo — on macOS sits below the traffic lights */}
      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center mb-4 text-sm font-bold">
        S
      </div>

      {NAV.map((item) => (
        <button
          key={item.id}
          onClick={() => setView(item.id)}
          title={item.label}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors
            ${view === item.id
              ? 'bg-indigo-600/20 text-indigo-400'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
        >
          {item.icon}
        </button>
      ))}
    </aside>
  )
}
