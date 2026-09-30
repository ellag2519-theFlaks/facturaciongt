import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { resetDb } from './helpers/resetDb.js'

let adminToken, vendedorToken
before(() => {
  resetDb()
  // FK-safe: sign tokens with the real seeded ids, not literals -- node's
  // test runner runs files concurrently against the same DB file, so a
  // hardcoded id can drift from the actual row (see invoices.create.test.js).
  // This matters here because some tests below create invoices, whose
  // created_by column has a FK to users(id).
  const [admin, vendedor] = seedUsers(db)
  adminToken = signToken({ id: admin.id, username: admin.username, role: admin.role })
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
})

test('admin creates a product', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Mouse', sku: 'MOU-1', price: 50, stock: 10, category: 'Periféricos' })
  assert.equal(res.status, 201)
  assert.equal(res.body.sku, 'MOU-1')
})

test('creating a product with a duplicate sku returns 409', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Mouse 2', sku: 'MOU-1', price: 60, stock: 5 })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'DUPLICATE_SKU')
})

test('updating a product to an sku owned by another product returns 409', async () => {
  const other = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Teclado', sku: 'TEC-1', price: 100, stock: 5 })
  const res = await request(app).put(`/api/products/${other.body.id}`).set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Teclado', sku: 'MOU-1', price: 100, stock: 5 })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'DUPLICATE_SKU')
})

test('negative price is rejected with 400', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Bad', sku: 'BAD-1', price: -5, stock: 1 })
  assert.equal(res.status, 400)
})

test('vendedor can list products but not create one', async () => {
  const list = await request(app).get('/api/products').set('Authorization', `Bearer ${vendedorToken}`)
  assert.equal(list.status, 200)
  const create = await request(app).post('/api/products').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ name: 'X', sku: 'X-1', price: 1, stock: 1 })
  assert.equal(create.status, 403)
})

test('creating a product with a missing sku returns 400 VALIDATION_ERROR, not a raw 500', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'No SKU', price: 10, stock: 1 })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('creating a product with a missing name returns 400 VALIDATION_ERROR, not a raw 500', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ sku: 'NO-NAME-1', price: 10, stock: 1 })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('updating a product with a missing sku returns 400 VALIDATION_ERROR, not a raw 500', async () => {
  const created = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Monitor', sku: 'MON-1', price: 200, stock: 3 })
  const res = await request(app).put(`/api/products/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Monitor', price: 200, stock: 3 })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('admin adjusts product stock', async () => {
  const created = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Webcam', sku: 'CAM-1', price: 80, stock: 5 })
  const res = await request(app).patch(`/api/products/${created.body.id}/stock`).set('Authorization', `Bearer ${adminToken}`)
    .send({ delta: 3 })
  assert.equal(res.status, 200)
  assert.equal(res.body.stock, 8)
})

test('creating a product with fractional stock returns 400 VALIDATION_ERROR', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Fractional', sku: 'FRAC-1', price: 10, stock: 2.5 })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('updating a product with fractional stock returns 400 VALIDATION_ERROR', async () => {
  const created = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Fractional 2', sku: 'FRAC-2', price: 10, stock: 3 })
  const res = await request(app).put(`/api/products/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Fractional 2', sku: 'FRAC-2', price: 10, stock: 3.5 })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('adjusting stock with a fractional delta returns 400 VALIDATION_ERROR', async () => {
  const created = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Fractional Delta', sku: 'FRAC-3', price: 10, stock: 5 })
  const res = await request(app).patch(`/api/products/${created.body.id}/stock`).set('Authorization', `Bearer ${adminToken}`)
    .send({ delta: 0.5 })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
})

test('deleting a product that has been invoiced returns 409 PRODUCT_IN_USE, not a raw 500', async () => {
  const created = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Invoiced Product', sku: 'INV-DEL-1', price: 25, stock: 10 })
  const productId = created.body.id

  const invoiceRes = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'Cliente Prueba', items: [{ product_id: productId, quantity: 1 }] })
  assert.equal(invoiceRes.status, 201)

  const res = await request(app).delete(`/api/products/${productId}`).set('Authorization', `Bearer ${adminToken}`)
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'PRODUCT_IN_USE')
})

test('deleting a product that has never been invoiced still succeeds', async () => {
  const created = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Unused Product', sku: 'DEL-OK-1', price: 25, stock: 10 })
  const res = await request(app).delete(`/api/products/${created.body.id}`).set('Authorization', `Bearer ${adminToken}`)
  assert.equal(res.status, 204)
})
