import React, { useEffect } from 'react'
import { loadAndApplyTheme } from './store/theme.store'
import { useServerStore } from './store/server.store'
import TerminalView from './components/terminal/TerminalView'

export default function TerminalStandalone(): React.ReactElement {
  useEffect(() => { loadAndApplyTheme() }, [])

  const { fetchServers } = useServerStore()
  useEffect(() => { fetchServers() }, [fetchServers])

  return (
    <div className="h-full relative bg-[var(--color-base)]">
      <TerminalView isActive={true} isStandalone={true} />
    </div>
  )
}
