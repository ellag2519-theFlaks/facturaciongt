import { useEffect, useState } from 'react'
import ErrorMessage from '../components/ErrorMessage'
import InvoiceList from '../components/InvoiceList'
import LoadingSpinner from '../components/LoadingSpinner'
import { listInvoices } from '../services/invoices.api'

function InvoiceHistoryPage() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
          <InvoiceList invoices={invoices} />
        </div>
      )}
    </div>
  )
}

export default InvoiceHistoryPage
