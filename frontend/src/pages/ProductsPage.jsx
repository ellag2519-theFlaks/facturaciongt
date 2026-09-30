import { useState } from 'react'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination from '../components/Pagination'
import ProductForm from '../components/ProductForm'
import ProductList from '../components/ProductList'
import { usePaginatedSearch } from '../hooks/usePaginatedSearch'
import { useProducts } from '../hooks/useProducts'
import { formatCurrency } from '../utils/formatCurrency'

function getSearchableText(product) {
  return [product.name, product.sku, product.category, formatCurrency(product.price), product.stock].join(' ')
}

function ProductsPage() {
  const { products, loading, error, create, update, remove } = useProducts()
  const [isCreating, setIsCreating] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const { searchTerm, setSearchTerm, page, setPage, totalPages, pageItems } = usePaginatedSearch(
    products,
    getSearchableText,
  )

  async function handleCreate(data) {
    await create(data)
    setIsCreating(false)
  }

  async function handleUpdate(data) {
    await update(editingProduct.id, data)
    setEditingProduct(null)
  }

  async function handleDelete(product) {
    const confirmed = window.confirm(`¿Eliminar el producto "${product.name}"?`)
    if (!confirmed) {
      return
    }

    setDeleteError(null)
    try {
      await remove(product.id)
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  function handleEdit(product) {
    setIsCreating(false)
    setEditingProduct(product)
  }

  function handleStartCreate() {
    setEditingProduct(null)
    setIsCreating(true)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Productos</h1>
        {!isCreating && !editingProduct && (
          <button
            type="button"
            onClick={handleStartCreate}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Nuevo producto
          </button>
        )}
      </div>

      {isCreating && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Nuevo producto</h2>
          <ProductForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreating(false)}
            submitLabel="Crear"
          />
        </div>
      )}

      {editingProduct && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Editar producto</h2>
          <ProductForm
            initialValues={editingProduct}
            onSubmit={handleUpdate}
            onCancel={() => setEditingProduct(null)}
            submitLabel="Guardar cambios"
          />
        </div>
      )}

      <ErrorMessage message={error} />
      <ErrorMessage message={deleteError} />

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
              placeholder="Buscar por nombre, SKU, categoría..."
              className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <ProductList products={pageItems} onEdit={handleEdit} onDelete={handleDelete} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}

export default ProductsPage
