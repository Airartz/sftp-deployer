import { create } from 'zustand'

type View = 'dashboard' | 'logs' | 'backup' | 'settings' | 'terminal' | 'files'

interface UIStore {
  view: View
  selectedServerId: string | null
  setView: (view: View) => void
  setSelectedServer: (id: string | null) => void
  navigateToBackup: (serverId: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  view: 'dashboard',
  selectedServerId: null,
  setView: (view) => set({ view }),
  setSelectedServer: (id) => set({ selectedServerId: id }),
  navigateToBackup: (serverId) => set({ view: 'backup', selectedServerId: serverId })
}))
