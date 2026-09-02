import { create } from 'zustand'
import { api, setOnUnauthorized } from '../api/client'
import type { User } from '../api/types'

let hostManagedAuth = false

export function setHostManagedAuth(enabled: boolean) {
  hostManagedAuth = enabled
}

interface AuthState {
  me: User | null
  loading: boolean
  booted: boolean
  isAuthenticated: () => boolean
  isAdmin: () => boolean
  quota: () => number
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  boot: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => {
  setOnUnauthorized(() => {
    if (hostManagedAuth) return
    set({ me: null })
  })

  return {
    me: null,
    loading: false,
    booted: false,

    isAuthenticated: () => !!get().me,
    isAdmin: () => get().me?.role === 'admin',
    quota: () => get().me?.quota_credits ?? 0,

    refresh: async () => {
      try {
        const me = await api<User>('GET', '/api/ppt/auth/me')
        set({ me })
      } catch {
        set({ me: null })
      }
    },

    login: async (email, password) => {
      set({ loading: true })
      try {
        const me = await api<User>('POST', '/api/ppt/auth/login', { email, password })
        set({ me })
      } finally {
        set({ loading: false })
      }
    },

    register: async (email, password) => {
      set({ loading: true })
      try {
        const me = await api<User>('POST', '/api/ppt/auth/register', { email, password })
        set({ me })
      } finally {
        set({ loading: false })
      }
    },

    logout: async () => {
      try {
        await api('POST', '/api/ppt/auth/logout')
      } catch {
        /* ignore */
      }
      set({ me: null })
    },

    boot: async () => {
      await get().refresh()
      set({ booted: true })
    },
  }
})
