import { create } from 'zustand'

// Ephemeral client-only UI state. Domain data lives in Convex — never mirror it here.
interface UiState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))
