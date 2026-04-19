import React, { useEffect } from 'react'
import { loadAndApplyTheme } from './store/theme.store'
import { useServerStore } from './store/server.store'
import FilesView from './components/files/FilesView'

export default function FilesStandalone(): React.ReactElement {
  useEffect(() => { loadAndApplyTheme() }, [])

  const { fetchServers } = useServerStore()
  useEffect(() => { fetchServers() }, [fetchServers])

  return (
    <div className="h-full relative bg-[var(--color-base)]">
      <FilesView isStandalone={true} />
    </div>
  )
}
