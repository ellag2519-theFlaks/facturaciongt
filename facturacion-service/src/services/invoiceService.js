import * as invoiceModel from '../models/invoiceModel.js'
import * as productModel from '../models/productModel.js'
import * as exchangeClient from '../clients/exchangeClient.js'
import AppError from '../utils/AppError.js'

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'EMPTY_INVOICE', 'La factura debe tener al menos un producto')
  }

  for (const item of items) {
    if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new AppError(400, 'INVALID_QUANTITY', 'La cantidad debe ser un entero mayor que 0')
    }
    if (!productModel.findById(item.product_id)) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado')
    }
  }
}

function validateCustomerName(customer_name) {
  if (!customer_name || !customer_name.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El nombre del cliente es requerido')
  }
}

/**
 * Validates and creates an invoice, decrementing stock atomically. When
 * payment_currency is 'USD', the current exchange rate is fetched BEFORE
 * the (synchronous) transaction runs — invoiceModel.createInvoiceWithItems
 * never calls the network itself. If the rate can't be fetched, nothing is
 * written: the AppError is thrown before the transaction is ever invoked.
 * @param {{customer_name: string, customer_nit?: string, items: Array<{product_id: number, quantity: number}>, userId: number, payment_currency?: ('GTQ'|'USD')}} params
 * @returns {object} the created invoice, including computed subtotal/tax/total and its items
 */
export async function createInvoice({ customer_name, customer_nit, items, userId, payment_currency }) {
  validateCustomerName(customer_name)
  validateItems(items)

  const currency = payment_currency === 'USD' ? 'USD' : 'GTQ'
  let exchangeRate = null
  if (currency === 'USD') {
    try {
      const { rate } = await exchangeClient.getTodayRate()
      exchangeRate = rate
    } catch {
      throw new AppError(502, 'EXCHANGE_SERVICE_UNAVAILABLE', 'No se pudo obtener la tasa de cambio actual. Intente de nuevo o facture en Quetzales.')
    }
  }

  return invoiceModel.createInvoiceWithItems({
    customer_name,
    customer_nit: customer_nit || 'CF',
    items,
    userId,
    payment_currency: currency,
    exchangeRate
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
