import { create } from 'zustand'
import type { SyncSession, LogEntry } from '../../../shared/types'

interface SyncStore {
  sessions: Map<string, SyncSession>
  logs: Map<string, LogEntry[]>        // sessionId -> entries
  activeSessionId: string | null
  setSession: (session: SyncSession) => void
  appendLog: (entry: LogEntry) => void
  setActiveSession: (id: string | null) => void
  clearSession: (sessionId: string) => void
}

export const useSyncStore = create<SyncStore>((set) => ({
  sessions: new Map(),
  logs: new Map(),
  activeSessionId: null,

  setSession: (session) =>
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.set(session.sessionId, session)
      return { sessions }
    }),

  appendLog: (entry) =>
    set((state) => {
      const logs = new Map(state.logs)
      const existing = logs.get(entry.sessionId) ?? []
      logs.set(entry.sessionId, [...existing, entry])
      return { logs }
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  clearSession: (sessionId) =>
    set((state) => {
      const sessions = new Map(state.sessions)
      const logs = new Map(state.logs)
      sessions.delete(sessionId)
      logs.delete(sessionId)
      return { sessions, logs }
    })
}))
