import { create } from 'zustand'
import type { Server } from '../../../shared/types'

interface ServerStore {
  servers: Server[]
  loading: boolean
  error: string | null
  fetchServers: () => Promise<void>
  addServer: (server: Server) => void
  updateServer: (server: Server) => void
  removeServer: (id: string) => void
}

export const useServerStore = create<ServerStore>((set) => ({
  servers: [],
  loading: false,
  error: null,

  fetchServers: async () => {
    set({ loading: true, error: null })
    try {
      const res = await window.electronAPI.servers.list()
      if (res.ok && res.data) {
        set({ servers: res.data, loading: false })
      } else {
        set({ error: res.error ?? 'Fehler', loading: false })
      }
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  addServer: (server) =>
    set((state) => ({ servers: [server, ...state.servers] })),

  updateServer: (server) =>
    set((state) => ({
      servers: state.servers.map((s) => (s.id === server.id ? server : s))
    })),

  removeServer: (id) =>
    set((state) => ({ servers: state.servers.filter((s) => s.id !== id) }))
}))
