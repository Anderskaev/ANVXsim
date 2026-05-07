import { create } from 'zustand'

interface User {
  id:         number
  email:      string
  name:       string
  avatar_url: string | null
}

interface Portfolio {
  id:           number
  name:         string
  cash:         number
  initial_cash: number
}

interface AuthState {
  user:      User | null
  portfolio: Portfolio | null
  isAuth:    boolean
  setAuth:   (user: User, portfolio: Portfolio) => void
  logout:    () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  portfolio: null,
  isAuth:    false,

  setAuth: (user, portfolio) => set({ user, portfolio, isAuth: true }),

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, portfolio: null, isAuth: false })
  },
}))