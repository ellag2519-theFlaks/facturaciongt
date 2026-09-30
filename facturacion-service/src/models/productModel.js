import db from '../database/connection.js'

/**
 * Returns all products.
 * @returns {Array<object>}
 */
export function findAll() {
  return db.prepare('SELECT * FROM products ORDER BY id').all()
}

/**
 * Finds a single product by id.
 * @param {number} id
 * @returns {object|undefined}
 */
export function findById(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id)
}

/**
 * Finds a product by SKU, optionally excluding a given id (used to check
 * for SKU collisions on update without the product conflicting with itself).
 * @param {string} sku
 * @param {number|null} excludeId
 * @returns {object|undefined}
 */
export function findBySku(sku, excludeId = null) {
  if (excludeId === null) {
    return db.prepare('SELECT * FROM products WHERE sku = ?').get(sku)
  }
  return db.prepare('SELECT * FROM products WHERE sku = ? AND id != ?').get(sku, excludeId)
}

/**
 * Inserts a new product.
 * @param {{name: string, sku: string, price: number, stock: number, category?: string}} data
 * @returns {object} the created product row
 */
export function create({ name, sku, price, stock, category }) {
  const result = db.prepare(`
    INSERT INTO products (name, sku, price, stock, category)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, sku, price, stock, category ?? null)

  return findById(result.lastInsertRowid)
}

/**
 * Updates an existing product.
 * @param {number} id
 * @param {{name: string, sku: string, price: number, stock: number, category?: string}} data
 * @returns {object|undefined} the updated product row
 */
export function update(id, { name, sku, price, stock, category }) {
  db.prepare(`
    UPDATE products
    SET name = ?, sku = ?, price = ?, stock = ?, category = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, sku, price, stock, category ?? null, id)

  return findById(id)
}

/**
 * Deletes a product by id.
 * @param {number} id
 * @returns {boolean} true if a row was deleted
 */
export function remove(id) {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(id)
  return result.changes > 0
}

/**
 * Checks whether any invoice_items row references this product, i.e.
 * whether the product has ever been invoiced. Used to block deletion,
 * since invoice_items.product_id has no ON DELETE clause and would
 * otherwise throw a raw SQLITE_CONSTRAINT_FOREIGNKEY error.
 * @param {number} id
 * @returns {boolean}
 */
export function hasInvoiceReferences(id) {
  const row = db.prepare('SELECT 1 FROM invoice_items WHERE product_id = ? LIMIT 1').get(id)
  return row !== undefined
}

/**
 * Adjusts a product's stock by a delta (positive or negative).
 * @param {number} id
 * @param {number} delta
 * @returns {object|undefined} the updated product row
 */
export function adjustStock(id, delta) {
  db.prepare(`
    UPDATE products
    SET stock = stock + ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(delta, id)

  return findById(id)
}
