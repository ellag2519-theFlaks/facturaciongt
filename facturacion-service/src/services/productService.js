import * as productModel from '../models/productModel.js'
import AppError from '../utils/AppError.js'

function validatePriceAndStock({ price, stock }) {
  if (typeof price !== 'number' || price <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El precio debe ser mayor que 0')
  }
  if (typeof stock !== 'number' || stock < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El stock no puede ser negativo')
  }
}

function assertNoSkuCollision(sku, excludeId = null) {
  const existing = productModel.findBySku(sku, excludeId)
  if (existing) {
    throw new AppError(409, 'DUPLICATE_SKU', 'El SKU ya existe')
  }
}

function getProductOrThrow(id) {
  const product = productModel.findById(id)
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado')
  }
  return product
}

/**
 * Lists all products.
 * @returns {Array<object>}
 */
export function listProducts() {
  return productModel.findAll()
}

/**
 * Gets a single product by id, or throws 404.
 * @param {number} id
 * @returns {object}
 */
export function getProduct(id) {
  return getProductOrThrow(id)
}

/**
 * Creates a product, validating price/stock and SKU uniqueness.
 * @param {{name: string, sku: string, price: number, stock: number, category?: string}} data
 * @returns {object}
 */
export function createProduct(data) {
  validatePriceAndStock(data)
  assertNoSkuCollision(data.sku)
  return productModel.create(data)
}

/**
 * Updates a product, validating price/stock, existence, and SKU uniqueness
 * (excluding the product's own id so it doesn't collide with itself).
 * @param {number} id
 * @param {{name: string, sku: string, price: number, stock: number, category?: string}} data
 * @returns {object}
 */
export function updateProduct(id, data) {
  getProductOrThrow(id)
  validatePriceAndStock(data)
  assertNoSkuCollision(data.sku, id)
  return productModel.update(id, data)
}

/**
 * Deletes a product by id, or throws 404.
 * @param {number} id
 */
export function deleteProduct(id) {
  getProductOrThrow(id)
  productModel.remove(id)
}

/**
 * Adjusts a product's stock by a delta, or throws 404 / 400 if the result
 * would be negative.
 * @param {number} id
 * @param {number} delta
 * @returns {object}
 */
export function adjustStockManually(id, delta) {
  const product = getProductOrThrow(id)

  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El ajuste de stock debe ser un número')
  }
  if (product.stock + delta < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El stock no puede quedar negativo')
  }

  return productModel.adjustStock(id, delta)
}
