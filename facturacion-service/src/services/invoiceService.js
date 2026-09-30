import * as invoiceModel from '../models/invoiceModel.js'
import * as productModel from '../models/productModel.js'
import AppError from '../utils/AppError.js'

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'EMPTY_INVOICE', 'La factura debe tener al menos un producto')
  }

  for (const item of items) {
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new AppError(400, 'INVALID_QUANTITY', 'La cantidad debe ser mayor que 0')
    }
    if (!productModel.findById(item.product_id)) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado')
    }
  }
}

/**
 * Validates and creates an invoice, decrementing stock atomically.
 * @param {{customer_name: string, customer_nit?: string, items: Array<{product_id: number, quantity: number}>, userId: number}} params
 * @returns {object} the created invoice, including computed subtotal/tax/total and its items
 */
export function createInvoice({ customer_name, customer_nit, items, userId }) {
  validateItems(items)

  return invoiceModel.createInvoiceWithItems({
    customer_name,
    customer_nit: customer_nit || 'CF',
    items,
    userId
  })
}
