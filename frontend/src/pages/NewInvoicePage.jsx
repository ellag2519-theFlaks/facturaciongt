import { useEffect, useState } from 'react'
import ErrorMessage from '../components/ErrorMessage'
import InvoiceForm from '../components/InvoiceForm'
import LoadingSpinner from '../components/LoadingSpinner'
import { useProducts } from '../hooks/useProducts'

function NewInvoicePage() {
  const { products, loading, error, reload } = useProducts()
  // `loading` flips true again on every reload() call, including the one
  // InvoiceForm triggers right after creating an invoice (to refresh stock).
  // Gating the whole form on `loading` would unmount InvoiceForm -- and its
  // just-set success banner -- during that refresh. Only gate on the
  // initial fetch; subsequent reloads update `products` in place instead.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  useEffect(() => {
    if (!loading) {
      setHasLoadedOnce(true)
    }
  }, [loading])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Nueva factura</h1>
      </div>

      <ErrorMessage message={error} />

      {!hasLoadedOnce && loading ? (
        <div className="mt-4">
          <LoadingSpinner />
        </div>
      ) : (
        <InvoiceForm products={products} onInvoiceCreated={reload} />
      )}
    </div>
  )
}

export default NewInvoicePage
