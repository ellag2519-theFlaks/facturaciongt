import ErrorMessage from '../components/ErrorMessage'
import InvoiceForm from '../components/InvoiceForm'
import LoadingSpinner from '../components/LoadingSpinner'
import { useProducts } from '../hooks/useProducts'

function NewInvoicePage() {
  const { products, loading, error } = useProducts()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">Nueva factura</h1>
      </div>

      <ErrorMessage message={error} />

      {loading ? (
        <div className="mt-4">
          <LoadingSpinner />
        </div>
      ) : (
        <InvoiceForm products={products} />
      )}
    </div>
  )
}

export default NewInvoicePage
