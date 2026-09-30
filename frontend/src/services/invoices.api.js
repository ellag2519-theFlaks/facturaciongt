import { apiClient } from './api.client'

export async function listInvoices() {
  const response = await apiClient.get('/invoices')
  return response.data
}

export async function getInvoice(id) {
  const response = await apiClient.get(`/invoices/${id}`)
  return response.data
}

export async function createInvoice(data) {
  const response = await apiClient.post('/invoices', data)
  return response.data
}
