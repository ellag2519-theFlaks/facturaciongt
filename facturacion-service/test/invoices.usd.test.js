import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { create as createProduct } from '../src/models/productModel.js'
import { resetDb } from './helpers/resetDb.js'
import { startStubExchangeService } from './helpers/stubExchangeService.js'

let vendedorToken, product
before(() => {
  resetDb()
  const [, vendedor] = seedUsers(db)
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
  product = createProduct({ name: 'Monitor USD', sku: 'USD-1', price: 100, stock: 5, category: null })
})

test('creating an invoice in USD stores the rate and the converted total', async () => {
  const stub = await startStubExchangeService({ rate: 7.8, date: '2026-10-07' })
  try {
    const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
      .send({ customer_name: 'Cliente USD', payment_currency: 'USD', items: [{ product_id: product.id, quantity: 2 }] })
    assert.equal(res.status, 201)
    assert.equal(res.body.payment_currency, 'USD')
    assert.equal(res.body.exchange_rate, 7.8)
    assert.equal(res.body.subtotal, 200)
    assert.equal(res.body.total, 224)
    assert.equal(res.body.total_usd, Math.round((224 / 7.8) * 100) / 100)
  } finally {
    await stub.close()
  }
})

test('an unreachable exchange service blocks the USD invoice and changes nothing', async () => {
  process.env.EXCHANGE_SERVICE_URL = 'http://localhost:1'
  const before = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id)
  const invoiceCountBefore = db.prepare('SELECT COUNT(*) AS n FROM invoices').get().n

  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'Cliente USD', payment_currency: 'USD', items: [{ product_id: product.id, quantity: 1 }] })

  assert.equal(res.status, 502)
  assert.equal(res.body.error.code, 'EXCHANGE_SERVICE_UNAVAILABLE')
  const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id)
  assert.equal(before.stock, after.stock)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, invoiceCountBefore)
})

test('a malformed (null) exchange rate blocks the USD invoice and changes nothing', async () => {
  const stub = await startStubExchangeService({ rate: null })
  try {
    const invoiceCountBefore = db.prepare('SELECT COUNT(*) AS n FROM invoices').get().n

    const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
      .send({ customer_name: 'Cliente USD', payment_currency: 'USD', items: [{ product_id: product.id, quantity: 1 }] })

    assert.equal(res.status, 502)
    assert.equal(res.body.error.code, 'EXCHANGE_SERVICE_UNAVAILABLE')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, invoiceCountBefore)
  } finally {
    await stub.close()
  }
})

test('a GTQ invoice is unaffected even when the exchange service is unreachable', async () => {
  process.env.EXCHANGE_SERVICE_URL = 'http://localhost:1'
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'Cliente GTQ', items: [{ product_id: product.id, quantity: 1 }] })
  assert.equal(res.status, 201)
  assert.equal(res.body.payment_currency, 'GTQ')
  assert.equal(res.body.exchange_rate, null)
  assert.equal(res.body.total_usd, null)
})
