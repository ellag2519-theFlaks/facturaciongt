import { Link } from 'react-router-dom'
import { formatCurrency } from '../utils/formatCurrency'
import { formatDate } from '../utils/formatDate'

function InvoiceList({ invoices }) {
  if (invoices.length === 0) {
    return <p className="text-sm text-gray-500">No hay facturas registradas.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-2 pr-4 font-medium">No. Factura</th>
            <th className="py-2 pr-4 font-medium">Cliente</th>
            <th className="py-2 pr-4 font-medium">NIT</th>
            <th className="py-2 pr-4 font-medium">Fecha</th>
            <th className="py-2 pr-4 font-medium">Vendedor</th>
            <th className="py-2 pr-4 font-medium">Total</th>
            <th className="py-2 pr-4 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-gray-100">
              <td className="py-2 pr-4 text-gray-800">{invoice.invoice_number}</td>
              <td className="py-2 pr-4 text-gray-600">{invoice.customer_name}</td>
              <td className="py-2 pr-4 text-gray-600">{invoice.customer_nit}</td>
              <td className="py-2 pr-4 text-gray-600">{formatDate(invoice.created_at)}</td>
              <td className="py-2 pr-4 text-gray-600">{invoice.created_by_username}</td>
              <td className="py-2 pr-4 text-gray-800">
                {formatCurrency(invoice.total)}
                {invoice.payment_currency === 'USD' &&
                  ` (≈ $${invoice.total_usd.toFixed(2)} USD, tasa: ${invoice.exchange_rate})`}
              </td>
              <td className="py-2 pr-4">
                <Link
                  to={`/invoices/${invoice.id}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Ver detalle
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default InvoiceList
