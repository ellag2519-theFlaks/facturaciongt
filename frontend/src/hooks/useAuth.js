import { createContext, createElement, useCallback, useContext, useState } from 'react'
import { loginRequest } from '../services/auth.api'

const STORAGE_KEY = 'facturacion_auth'

const AuthContext = createContext(undefined)

function readStoredAuth() {
  const stored = localStorage.getItem(STORAGE_KEY)

  if (!stored) {
    return null
  }

  try {
    const parsed = JSON.parse(stored)
    if (parsed?.token && parsed?.user) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  // Lazy initializer runs once on mount, hydrating from localStorage if present.
  const [auth, setAuth] = useState(() => readStoredAuth())

  const login = useCallback(async (username, password) => {
    const { token, user } = await loginRequest(username, password)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }))
    setAuth({ token, user })
    return { token, user }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuth(null)
  }, [])

  const value = {
    user: auth?.user ?? null,
    token: auth?.token ?? null,
    isAuthenticated: Boolean(auth?.token),
    login,
    logout,
  }

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
