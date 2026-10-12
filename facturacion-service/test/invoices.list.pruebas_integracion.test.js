import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { create as createProduct } from '../src/models/productModel.js'
import { resetDb } from './helpers/resetDb.js'

let adminToken, vendedorToken, otherVendedorToken, vendedorInvoiceId
before(async () => {
  resetDb()
  const [admin, vendedor] = seedUsers(db)
  adminToken = signToken({ id: admin.id, username: admin.username, role: admin.role })
  // FK-safe: this token creates an invoice below, so it must carry a real seeded id.
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
  // otherVendedorToken is never used to insert anything (GET requests only), so an
  // id with no matching users row is fine — it only has to differ from vendedor.id.
  otherVendedorToken = signToken({ id: vendedor.id + 1000, username: 'vendedor2', role: 'vendedor' })
  const product = createProduct({ name: 'Cable', sku: 'CAB-1', price: 10, stock: 100, category: null })
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'Ana', items: [{ product_id: product.id, quantity: 1 }] })
  vendedorInvoiceId = res.body.id
})

test('admin sees all invoices', async () => {
  const res = await request(app).get('/api/invoices').set('Authorization', `Bearer ${adminToken}`)
  assert.ok(res.body.some((inv) => inv.id === vendedorInvoiceId))
})

test('listed invoices include the creating user\'s username', async () => {
  const res = await request(app).get('/api/invoices').set('Authorization', `Bearer ${adminToken}`)
  const invoice = res.body.find((inv) => inv.id === vendedorInvoiceId)
  assert.equal(invoice.created_by_username, 'vendedor')
})

test('vendedor sees only their own invoices', async () => {
  const res = await request(app).get('/api/invoices').set('Authorization', `Bearer ${otherVendedorToken}`)
  assert.ok(!res.body.some((inv) => inv.id === vendedorInvoiceId))
})

test('a vendedor cannot fetch another vendedor\'s invoice by id', async () => {
  const res = await request(app).get(`/api/invoices/${vendedorInvoiceId}`).set('Authorization', `Bearer ${otherVendedorToken}`)
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'NOT_FOUND')
})

test('the owning vendedor can fetch their own invoice by id', async () => {
  const res = await request(app).get(`/api/invoices/${vendedorInvoiceId}`).set('Authorization', `Bearer ${vendedorToken}`)
  assert.equal(res.status, 200)
})

test('invoice detail includes the creating user\'s username', async () => {
  const res = await request(app).get(`/api/invoices/${vendedorInvoiceId}`).set('Authorization', `Bearer ${vendedorToken}`)
  assert.equal(res.body.created_by_username, 'vendedor')
})

test('fetching a nonexistent invoice id returns 404, not a raw 500', async () => {
  const res = await request(app).get('/api/invoices/999999').set('Authorization', `Bearer ${adminToken}`)
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'NOT_FOUND')
})

test('fetching an invoice with a non-numeric id returns 404, not a raw 500', async () => {
  // Number('abc') is NaN -- the controller passes it straight through to
  // invoiceModel.findById, so this pins that a non-numeric :id segment
  // degrades to the same clean 404 as a nonexistent one, not an uncaught
  // driver error.
  const res = await request(app).get('/api/invoices/abc').set('Authorization', `Bearer ${adminToken}`)
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'NOT_FOUND')
})
