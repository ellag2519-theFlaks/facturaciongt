import { useCallback, useEffect, useState } from 'react'
import {
  adjustStock as adjustStockRequest,
  createProduct,
  deleteProduct,
  listProducts,
  updateProduct,
} from '../services/products.api'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listProducts()
      setProducts(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const create = useCallback(async (data) => {
    const product = await createProduct(data)
    setProducts((current) => [...current, product])
    return product
  }, [])

  const update = useCallback(async (id, data) => {
    const product = await updateProduct(id, data)
    setProducts((current) => current.map((item) => (item.id === id ? product : item)))
    return product
  }, [])

  const remove = useCallback(async (id) => {
    await deleteProduct(id)
    setProducts((current) => current.filter((item) => item.id !== id))
  }, [])

  const adjustStock = useCallback(async (id, delta) => {
    const product = await adjustStockRequest(id, delta)
    setProducts((current) => current.map((item) => (item.id === id ? product : item)))
    return product
  }, [])

  return { products, loading, error, reload, create, update, remove, adjustStock }
}
