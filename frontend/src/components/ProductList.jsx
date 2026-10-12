import { formatCurrency } from '../utils/formatCurrency'
import StockBadge from './StockBadge'

function ProductList({ products, onEdit, onDelete }) {
  if (products.length === 0) {
    return <p className="text-sm text-gray-500">No hay productos registrados.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-2 pr-4 font-medium">Nombre</th>
            <th className="py-2 pr-4 font-medium">SKU</th>
            <th className="py-2 pr-4 font-medium">Categoría</th>
            <th className="py-2 pr-4 font-medium">Precio</th>
            <th className="py-2 pr-4 font-medium">Stock</th>
            <th className="py-2 pr-4 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-b border-gray-100">
              <td className="py-2 pr-4 text-gray-800">{product.name}</td>
              <td className="py-2 pr-4 text-gray-600">{product.sku}</td>
              <td className="py-2 pr-4 text-gray-600">{product.category || '—'}</td>
              <td className="py-2 pr-4 text-gray-600">{formatCurrency(product.price)}</td>
              <td className="py-2 pr-4">
                <StockBadge stock={product.stock} />
              </td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(product)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(product)}
                    className="text-sm font-medium text-red-600 hover:text-red-800"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ProductList
