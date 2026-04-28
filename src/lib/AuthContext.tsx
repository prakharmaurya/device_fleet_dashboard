import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { LoginResponse } from '../api/types'

interface AuthUser {
  id: number
  name: string
  email: string
  role: string
}

interface AuthCtx {
  user: AuthUser | null
  setAuth: (resp: LoginResponse) => void
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user')
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser)

  function setAuth(resp: LoginResponse) {
    localStorage.setItem('token', resp.token)
    const u: AuthUser = { id: resp.id, name: resp.name, email: resp.email, role: resp.role }
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return <Ctx.Provider value={{ user, setAuth, logout }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
