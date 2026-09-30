import { apiClient } from './api.client'

export async function loginRequest(username, password) {
  const response = await apiClient.post('/auth/login', { username, password })
  return response.data
}
