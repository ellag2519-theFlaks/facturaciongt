import db from '../database/connection.js'
import AppError from '../utils/AppError.js'
import { findById as findProductById, adjustStock } from './productModel.js'

/**
 * Computes the next invoice number as 'FAC-' followed by a 6-digit,
 * zero-padded sequence derived from MAX(id)+1 on the invoices table.
 * @returns {string}
 */
function nextInvoiceNumber() {
  const { next } = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM invoices').get()
  return 'FAC-' + String(next).padStart(6, '0')
}

/**
 * Computes subtotal, 12% IVA tax, and total for a set of items paired with
 * their resolved product rows (same order/index).
 * @param {Array<{quantity: number}>} items
 * @param {Array<{price: number}>} products
 * @returns {{subtotal: number, tax: number, total: number}}
 */
function computeTotals(items, products) {
  const subtotal = items.reduce((sum, item, i) => sum + item.quantity * products[i].price, 0)
  const tax = subtotal * 0.12
  const total = subtotal + tax
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100
  }
}

/**
 * Inserts the invoice row.
 * @returns {number} the new invoice id
 */
function insertInvoice({ invoice_number, customer_name, customer_nit, subtotal, tax, total, created_by, payment_currency, exchange_rate, total_usd }) {
  const result = db.prepare(`
    INSERT INTO invoices (invoice_number, customer_name, customer_nit, subtotal, tax, total, created_by, payment_currency, exchange_rate, total_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(invoice_number, customer_name, customer_nit, subtotal, tax, total, created_by, payment_currency, exchange_rate, total_usd)

  return result.lastInsertRowid
}

/**
 * Inserts a single invoice line item.
 */
function insertInvoiceItem(invoiceId, { product_id, product_name, quantity, unit_price, line_total }) {
  db.prepare(`
    INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(invoiceId, product_id, product_name, quantity, unit_price, line_total)
}

/**
 * Finds a single invoice by id, including its items and the creating
 * user's username as created_by_username (created_by keeps the raw id).
 * @param {number} id
 * @returns {object|undefined}
 */
export function findById(id) {
  const invoice = db.prepare(`
    SELECT invoices.*, users.username AS created_by_username
    FROM invoices
    JOIN users ON invoices.created_by = users.id
    WHERE invoices.id = ?
  `).get(id)
  if (!invoice) return undefined

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id)
  return { ...invoice, items }
}

/**
 * Returns all invoices (without items), each annotated with the creating
 * user's username as created_by_username (created_by keeps the raw id).
 * @returns {Array<object>}
 */
export function findAll() {
  return db.prepare(`
    SELECT invoices.*, users.username AS created_by_username
    FROM invoices
    JOIN users ON invoices.created_by = users.id
    ORDER BY invoices.id
  `).all()
}

/**
 * Returns all invoices created by a given user (without items), each
 * annotated with the creating user's username as created_by_username.
 * @param {number} userId
 * @returns {Array<object>}
 */
export function findAllByUser(userId) {
  return db.prepare(`
    SELECT invoices.*, users.username AS created_by_username
    FROM invoices
    JOIN users ON invoices.created_by = users.id
    WHERE invoices.created_by = ?
    ORDER BY invoices.id
  `).all(userId)
}

/**
 * Atomically creates an invoice and its items, decrementing product stock.
 * Every line is validated (unknown product, then insufficient stock) before
 * any mutation happens, so a failure partway through leaves nothing changed.
 * Stock is validated against the AGGREGATE quantity requested per product_id
 * (not each line independently), so the same product appearing in multiple
 * lines can't bypass the check by having each individual line look fine.
 * @param {{customer_name: string, customer_nit: string, items: Array<{product_id: number, quantity: number}>, userId: number, payment_currency: ('GTQ'|'USD'), exchangeRate: (number|null)}} params
 * @returns {object} the created invoice, including its items
 */
export const createInvoiceWithItems = db.transaction(({ customer_name, customer_nit, items, userId, payment_currency, exchangeRate }) => {
  // 1. Validate every line FIRST, before mutating anything — unknown product,
  //    then insufficient stock, checked against each product's AGGREGATE
  //    requested quantity across all lines (not each line independently).
  const productsById = new Map()
  for (const item of items) {
    if (!productsById.has(item.product_id)) {
      const product = findProductById(item.product_id)
      if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado')
      productsById.set(item.product_id, product)
    }
  }

  const requestedQtyByProduct = new Map()
  for (const item of items) {
    requestedQtyByProduct.set(item.product_id, (requestedQtyByProduct.get(item.product_id) ?? 0) + item.quantity)
  }

  for (const [productId, totalQty] of requestedQtyByProduct) {
    const product = productsById.get(productId)
    if (product.stock < totalQty) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Stock insuficiente para ${product.name}`)
    }
  }

  const products = items.map((item) => productsById.get(item.product_id))

  // 2. Only after every line is validated: compute totals, insert invoice + items, decrement stock.
  const invoiceNumber = nextInvoiceNumber()
  const { subtotal, tax, total } = computeTotals(items, products)
  const totalUsd = payment_currency === 'USD' ? Math.round((total / exchangeRate) * 100) / 100 : null
  const invoiceId = insertInvoice({
    invoice_number: invoiceNumber,
    customer_name,
    customer_nit,
    subtotal,
    tax,
    total,
    created_by: userId,
    payment_currency,
    exchange_rate: payment_currency === 'USD' ? exchangeRate : null,
    total_usd: totalUsd
  })
  items.forEach((item, i) => {
    insertInvoiceItem(invoiceId, { product_id: item.product_id, product_name: products[i].name, quantity: item.quantity, unit_price: products[i].price, line_total: item.quantity * products[i].price })
    adjustStock(item.product_id, -item.quantity)
  })

  return findById(invoiceId)
})
