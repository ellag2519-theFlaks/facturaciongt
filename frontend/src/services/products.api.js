import { apiClient } from './api.client'

export async function listProducts() {
  const response = await apiClient.get('/products')
  return response.data
}

export async function createProduct(data) {
  const response = await apiClient.post('/products', data)
  return response.data
}

export async function updateProduct(id, data) {
  const response = await apiClient.put(`/products/${id}`, data)
  return response.data
}

export async function deleteProduct(id) {
  await apiClient.delete(`/products/${id}`)
}

export async function adjustStock(id, delta) {
  const response = await apiClient.patch(`/products/${id}/stock`, { delta })
  return response.data
}
