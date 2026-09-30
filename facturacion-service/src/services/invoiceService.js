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

/**
 * Lists invoices scoped by role: admins see every invoice, everyone else
 * sees only invoices they created.
 * @param {{id: number, role: string}} user
 * @returns {Array<object>}
 */
export function listInvoices(user) {
  if (user.role === 'admin') {
    return invoiceModel.findAll()
  }
  return invoiceModel.findAllByUser(user.id)
}

/**
 * Fetches a single invoice by id, scoped by role. A non-admin requesting an
 * invoice that exists but isn't theirs gets the SAME 404 as a nonexistent
 * id — the two cases must be indistinguishable so an attacker can't use the
 * response to enumerate valid invoice ids (IDOR protection).
 * @param {number} id
 * @param {{id: number, role: string}} user
 * @returns {object}
 */
export function getInvoice(id, user) {
  const invoice = invoiceModel.findById(id)
  if (!invoice || (user.role !== 'admin' && invoice.created_by !== user.id)) {
    throw new AppError(404, 'NOT_FOUND', 'Factura no encontrada')
  }
  return invoice
}
