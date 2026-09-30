import { useEffect, useState } from 'react'
import ErrorMessage from '../components/ErrorMessage'
import InvoiceList from '../components/InvoiceList'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination from '../components/Pagination'
import { usePaginatedSearch } from '../hooks/usePaginatedSearch'
import { listInvoices } from '../services/invoices.api'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/formatDate'

function getSearchableText(invoice) {
  return [
    invoice.invoice_number,
    invoice.customer_name,
    invoice.customer_nit,
    formatDate(invoice.created_at),
    invoice.created_by_username,
    formatCurrency(invoice.total),
  ].join(' ')
}

function InvoiceHistoryPage() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { searchTerm, setSearchTerm, page, setPage, totalPages, pageItems } = usePaginatedSearch(
    invoices,
    getSearchableText,
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await listInvoices()
        if (!cancelled) {
          setInvoices(data)
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
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Historial de facturas</h1>
      </div>

      <ErrorMessage message={error} />

      {loading ? (
        <div className="mt-4">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por factura, cliente, NIT, vendedor..."
              className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <InvoiceList invoices={pageItems} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}

export default InvoiceHistoryPage
