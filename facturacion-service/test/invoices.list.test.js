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
