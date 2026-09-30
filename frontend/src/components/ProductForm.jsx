import { useState } from 'react'
import ErrorMessage from './ErrorMessage'
import LoadingSpinner from './LoadingSpinner'

function ProductForm({ initialValues, onSubmit, onCancel, submitLabel = 'Guardar' }) {
  const [values, setValues] = useState(() => ({
    name: initialValues?.name ?? '',
    sku: initialValues?.sku ?? '',
    price: initialValues?.price ?? '',
    stock: initialValues?.stock ?? '',
    category: initialValues?.category ?? '',
  }))
  const [error, setError] = useState(null)
  const [skuError, setSkuError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleChange(field) {
    return (event) => {
      setValues((current) => ({ ...current, [field]: event.target.value }))
      if (field === 'sku') {
        setSkuError(null)
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSkuError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({
        name: values.name,
        sku: values.sku,
        price: Number(values.price),
        stock: Number(values.stock),
        category: values.category || undefined,
      })
    } catch (err) {
      if (err.code === 'DUPLICATE_SKU') {
        setSkuError(err.message)
      } else {
        setError(err.message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-gray-700">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={values.name}
          onChange={handleChange('name')}
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sku" className="text-sm font-medium text-gray-700">
          SKU
        </label>
        <input
          id="sku"
          name="sku"
          type="text"
          value={values.sku}
          onChange={handleChange('sku')}
          required
          aria-invalid={Boolean(skuError)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {skuError && (
          <p role="alert" className="text-sm text-red-600">
            {skuError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="price" className="text-sm font-medium text-gray-700">
          Precio
        </label>
        <input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          value={values.price}
          onChange={handleChange('price')}
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="stock" className="text-sm font-medium text-gray-700">
          Stock
        </label>
        <input
          id="stock"
          name="stock"
          type="number"
          step="1"
          min="0"
          value={values.stock}
          onChange={handleChange('stock')}
          required
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-sm font-medium text-gray-700">
          Categoría
        </label>
        <input
          id="category"
          name="category"
          type="text"
          value={values.category}
          onChange={handleChange('category')}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <ErrorMessage message={error} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
        )}
        {isSubmitting && <LoadingSpinner />}
      </div>
    </form>
  )
}

export default ProductForm
