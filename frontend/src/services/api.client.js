import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
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
