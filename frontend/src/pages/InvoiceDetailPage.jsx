import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import { getInvoice } from '../services/invoices.api'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/formatDate'

function InvoiceDetailPage() {
  const { id } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getInvoice(id)
        if (!cancelled) {
          setInvoice(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Detalle de factura</h1>
        <Link to="/invoices" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Volver al historial
        </Link>
      </div>

      <ErrorMessage message={error} />

      {loading ? (
        <div className="mt-4">
          <LoadingSpinner />
        </div>
      ) : invoice ? (
        <div className="mt-4 space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">No. Factura</dt>
                <dd className="font-medium text-gray-800">{invoice.invoice_number}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Fecha</dt>
                <dd className="font-medium text-gray-800">{formatDate(invoice.created_at)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Cliente</dt>
                <dd className="font-medium text-gray-800">{invoice.customer_name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">NIT</dt>
                <dd className="font-medium text-gray-800">{invoice.customer_nit}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Vendedor</dt>
                <dd className="font-medium text-gray-800">{invoice.created_by_username}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-4 font-medium">Producto</th>
                    <th className="py-2 pr-4 font-medium">Cantidad</th>
                    <th className="py-2 pr-4 font-medium">Precio unitario</th>
                    <th className="py-2 pr-4 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 text-gray-800">{item.product_name}</td>
                      <td className="py-2 pr-4 text-gray-600">{item.quantity}</td>
                      <td className="py-2 pr-4 text-gray-600">{formatCurrency(item.unit_price)}</td>
                      <td className="py-2 pr-4 text-gray-800">{formatCurrency(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 ml-auto w-48 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>IVA (12%)</span>
                <span>{formatCurrency(invoice.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-800">
                <span>Total</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
              {invoice.payment_currency === 'USD' && (
                <div className="flex justify-between text-gray-600">
                  <span>Equivalente</span>
                  <span>
                    ${invoice.total_usd.toFixed(2)} USD (tasa: {invoice.exchange_rate})
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default InvoiceDetailPage
