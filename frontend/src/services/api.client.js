import axios from 'axios'

// Resolves the API host from wherever the page was actually loaded from,
// rather than a hardcoded VITE_API_URL -- that env var bakes in
// "localhost" at build time, which breaks the moment the page is opened
// from another device on the LAN (e.g. a phone/tablet testing
// compatibility), since "localhost" on that device means the device
// itself, not this machine. VITE_API_URL still works as an explicit
// override if ever set.
const apiBaseUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001/api`

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
})

apiClient.interceptors.request.use((config) => {
  const stored = localStorage.getItem('facturacion_auth')

  if (stored) {
    try {
      const { token } = JSON.parse(stored)
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // Ignore malformed stored auth data; request proceeds unauthenticated.
    }
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = error.response?.data?.error

    const normalizedError = new Error(
      apiError?.message ?? 'An unexpected error occurred. Please try again.',
    )
    normalizedError.code = apiError?.code ?? 'UNKNOWN_ERROR'

    return Promise.reject(normalizedError)
  },
)
