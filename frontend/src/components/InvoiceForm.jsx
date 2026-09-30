import { useMemo, useState } from 'react'
import { createInvoice } from '../services/invoices.api'
import { formatCurrency } from '../utils/formatCurrency'
import ErrorMessage from './ErrorMessage'
import InvoiceItemRow from './InvoiceItemRow'
import LoadingSpinner from './LoadingSpinner'

function round2(value) {
  return Math.round(value * 100) / 100
}

function InvoiceForm({ products }) {
  const [customerName, setCustomerName] = useState('')
  const [customerNit, setCustomerNit] = useState('')
  const [cart, setCart] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [addQuantity, setAddQuantity] = useState(1)
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdInvoice, setCreatedInvoice] = useState(null)

  const productsById = useMemo(() => {
    const map = new Map()
    products.forEach((product) => map.set(product.id, product))
    return map
  }, [products])

  const subtotal = useMemo(
    () =>
      round2(
        cart.reduce((sum, item) => {
          const product = productsById.get(item.product_id)
          return sum + (product?.price ?? 0) * item.quantity
        }, 0),
      ),
    [cart, productsById],
  )
  const tax = round2(subtotal * 0.12)
  const total = round2(subtotal + tax)

  const isCartEmpty = cart.length === 0
  const hasStockIssue = cart.some((item) => {
    const product = productsById.get(item.product_id)
    return item.quantity > (product?.stock ?? 0)
  })
  const canSubmit = !isCartEmpty && !hasStockIssue && !isSubmitting

  function handleAddProduct(event) {
    event.preventDefault()
    if (!selectedProductId || addQuantity <= 0) {
      return
    }

    const productId = Number(selectedProductId)

    setCart((current) => {
      const existing = current.find((item) => item.product_id === productId)
      if (existing) {
        return current.map((item) =>
          item.product_id === productId
            ? { ...item, quantity: item.quantity + addQuantity }
            : item,
        )
      }
      return [...current, { product_id: productId, quantity: addQuantity }]
    })
    setSelectedProductId('')
    setAddQuantity(1)
  }

  function handleQuantityChange(productId, quantity) {
    setCart((current) =>
      current.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: Math.max(1, quantity || 1) }
          : item,
      ),
    )
  }

  function handleRemove(productId) {
    setCart((current) => current.filter((item) => item.product_id !== productId))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setCreatedInvoice(null)
    setIsSubmitting(true)

    try {
      const invoice = await createInvoice({
        customer_name: customerName,
        customer_nit: customerNit || undefined,
        items: cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      })
      setCreatedInvoice(invoice)
      setCart([])
      setCustomerName('')
      setCustomerNit('')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {createdInvoice && (
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          Factura {createdInvoice.invoice_number} creada. Total: {formatCurrency(createdInvoice.total)}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="customer_name" className="text-sm font-medium text-gray-700">
              Cliente
            </label>
            <input
              id="customer_name"
              name="customer_name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="customer_nit" className="text-sm font-medium text-gray-700">
              NIT (opcional)
            </label>
            <input
              id="customer_nit"
              name="customer_nit"
              type="text"
              value={customerNit}
              onChange={(event) => setCustomerNit(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Agregar producto</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="product_id" className="text-sm font-medium text-gray-700">
                Producto
              </label>
              <select
                id="product_id"
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Seleccione un producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} — {formatCurrency(product.price)} (stock: {product.stock})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add_quantity" className="text-sm font-medium text-gray-700">
                Cantidad
              </label>
              <input
                id="add_quantity"
                type="number"
                min="1"
                step="1"
                value={addQuantity}
                onChange={(event) => setAddQuantity(Math.max(1, Number(event.target.value) || 1))}
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleAddProduct}
              disabled={!selectedProductId}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Agregar
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Detalle de la factura</h2>
          {isCartEmpty ? (
            <p className="text-sm text-gray-500">No hay productos agregados.</p>
          ) : (
            <table className="w-full table-auto border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4 font-medium">Producto</th>
                  <th className="py-2 pr-4 font-medium">Precio</th>
                  <th className="py-2 pr-4 font-medium">Cantidad</th>
                  <th className="py-2 pr-4 font-medium">Subtotal</th>
                  <th className="py-2 pr-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <InvoiceItemRow
                    key={item.product_id}
                    item={item}
                    product={productsById.get(item.product_id)}
                    onQuantityChange={handleQuantityChange}
                    onRemove={handleRemove}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 text-sm text-gray-700">
          <div>Subtotal: {formatCurrency(subtotal)}</div>
          <div>IVA (12%): {formatCurrency(tax)}</div>
          <div className="text-base font-semibold text-gray-900">Total: {formatCurrency(total)}</div>
        </div>

        <ErrorMessage message={error} />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Crear factura
          </button>
          {isSubmitting && <LoadingSpinner />}
        </div>
      </form>
    </div>
  )
}

export default InvoiceForm
