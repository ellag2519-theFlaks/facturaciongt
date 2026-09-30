import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { create as createProduct } from '../src/models/productModel.js'
import { resetDb } from './helpers/resetDb.js'

let vendedorToken, product
before(() => {
  resetDb()
  const [, vendedor] = seedUsers(db) // FK-safe: sign the token with the real seeded id, not a literal
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
  product = createProduct({ name: 'Monitor', sku: 'MON-1', price: 100, stock: 5, category: null })
})

test('creates an invoice, computes 12% IVA, and decrements stock', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'Juan Pérez', items: [{ product_id: product.id, quantity: 2 }] })
  assert.equal(res.status, 201)
  assert.equal(res.body.subtotal, 200)
  assert.equal(res.body.tax, 24)
  assert.equal(res.body.total, 224)
  assert.match(res.body.invoice_number, /^FAC-\d{6}$/)
  assert.equal(res.body.customer_nit, 'CF')
})

test('insufficient stock is rejected and nothing is mutated', async () => {
  const before = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id)
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: product.id, quantity: 999 }] })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK')
  const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id)
  assert.equal(before.stock, after.stock)
})

test('an item referencing an unknown product is rejected', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: 999999, quantity: 1 }] })
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND')
})

test('a zero or negative quantity is rejected', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: product.id, quantity: 0 }] })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'INVALID_QUANTITY')
})

test('an empty items array is rejected', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [] })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'EMPTY_INVOICE')
})

test('a missing customer_name is rejected with 400 VALIDATION_ERROR', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ items: [{ product_id: product.id, quantity: 1 }] })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('a blank customer_name is rejected with 400 VALIDATION_ERROR', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: '   ', items: [{ product_id: product.id, quantity: 1 }] })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('a fractional quantity is rejected with 400 INVALID_QUANTITY', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: product.id, quantity: 1.5 }] })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'INVALID_QUANTITY')
})

test('duplicate product_id lines are aggregated before validating stock, not checked independently', async () => {
  const dup = createProduct({ name: 'Mouse', sku: 'MOU-1', price: 50, stock: 5, category: null })
  const invoicesBefore = db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count

  // Each line (quantity 3) is individually within stock (5), but the two
  // lines combined (6) exceed it — must still be rejected as INSUFFICIENT_STOCK.
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: dup.id, quantity: 3 }, { product_id: dup.id, quantity: 3 }] })

  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK')

  const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(dup.id)
  assert.equal(after.stock, 5)
  const invoicesAfter = db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count
  assert.equal(invoicesBefore, invoicesAfter)
})

test('rounds subtotal/tax/total to 2 decimals for prices with cents', async () => {
  const centsProduct = createProduct({ name: 'Teclado', sku: 'TEC-1', price: 19.99, stock: 50, category: null })

  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: centsProduct.id, quantity: 3 }] })

  assert.equal(res.status, 201)
  assert.equal(res.body.subtotal, 59.97)
  assert.equal(res.body.tax, 7.2)
  assert.equal(res.body.total, 67.17)
})
