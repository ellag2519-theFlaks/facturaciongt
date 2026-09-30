import { formatCurrency } from '../utils/formatCurrency'

function InvoiceItemRow({ item, product, onQuantityChange, onRemove }) {
  const exceedsStock = item.quantity > (product?.stock ?? 0)
  const lineTotal = (product?.price ?? 0) * item.quantity

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4 text-gray-800">{product?.name ?? 'Producto desconocido'}</td>
      <td className="py-2 pr-4 text-gray-600">{formatCurrency(product?.price ?? 0)}</td>
      <td className="py-2 pr-4">
        <input
          type="number"
          min="1"
          step="1"
          value={item.quantity}
          onChange={(event) => onQuantityChange(item.product_id, Number(event.target.value))}
          aria-invalid={exceedsStock}
          className={`w-20 rounded-md border px-2 py-1 text-sm focus:outline-none ${
            exceedsStock
              ? 'border-red-400 focus:border-red-500'
              : 'border-gray-300 focus:border-blue-500'
          }`}
        />
        {exceedsStock && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            Stock disponible: {product?.stock ?? 0}
          </p>
        )}
      </td>
      <td className="py-2 pr-4 text-gray-600">{formatCurrency(lineTotal)}</td>
      <td className="py-2 pr-4">
        <button
          type="button"
          onClick={() => onRemove(item.product_id)}
          className="text-sm font-medium text-red-600 hover:text-red-800"
        >
          Eliminar
        </button>
      </td>
    </tr>
  )
}

export default InvoiceItemRow
