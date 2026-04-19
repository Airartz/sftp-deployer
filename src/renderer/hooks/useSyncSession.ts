import { useEffect } from 'react'
import { useSyncStore } from '../store/sync.store'
import type { SyncProgressEvent, SyncLogEvent, SyncSession } from '../../../shared/types'

export function useSyncSession(): void {
  const { setSession, appendLog } = useSyncStore()

  useEffect(() => {
    const onProgress = (data: SyncProgressEvent) => {
      setSession(data.session)
    }

    const onLog = (data: SyncLogEvent) => {
      appendLog(data.entry)
    }

    const onComplete = (session: SyncSession) => {
      setSession(session)
    }

    window.electronAPI.on.syncProgress(onProgress)
    window.electronAPI.on.syncLog(onLog)
    window.electronAPI.on.syncComplete(onComplete)

    return () => {
      window.electronAPI.off.syncProgress(onProgress)
      window.electronAPI.off.syncLog(onLog)
      window.electronAPI.off.syncComplete(onComplete)
    }
  }, [setSession, appendLog])
}
