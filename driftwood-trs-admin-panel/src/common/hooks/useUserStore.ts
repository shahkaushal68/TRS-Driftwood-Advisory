import { create } from 'zustand'

import type { UserProfile } from '../api/auth'

type UserDetails = UserProfile

interface UserStore {
  user: UserDetails | null
  setUser: (user: UserDetails) => void
  clearUser: () => void
}

const useUserStore = create<UserStore>()((set) => ({
  user: null,
  setUser: (user) => {
    set({ user })
  },
  clearUser: () => {
    set({ user: null })
  },
}))

export { useUserStore, type UserDetails }
