// NF-STR-01 (plan de pruebas, Fase 2): prueba de estrés -- 20 peticiones de
// facturación concurrentes contra UN SOLO producto con stock=15.
//
// facturacion-service corre como un único proceso Node de un solo hilo, y
// createInvoiceWithItems es una transacción 100% síncrona (better-sqlite3),
// así que el motor de JS no puede intercalar dos peticiones dentro de esa
// transacción -- esta prueba confirma esa garantía de forma determinista,
// no prueba concurrencia real entre múltiples procesos/instancias (fuera de
// alcance, ver riesgos del plan de pruebas Fase 2).
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { create as createProduct } from '../src/models/productModel.js'
import { resetDb } from './helpers/resetDb.js'

const CONCURRENT_REQUESTS = 20
const INITIAL_STOCK = 15

let vendedorToken, product
before(() => {
  resetDb()
  const [, vendedor] = seedUsers(db)
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
  product = createProduct({ name: 'Producto Estrés', sku: 'STR-1', price: 10, stock: INITIAL_STOCK, category: null })
})

test(`${CONCURRENT_REQUESTS} concurrent requests for 1 unit each against stock=${INITIAL_STOCK}: exactly ${INITIAL_STOCK} succeed, rest rejected, stock never negative`, async () => {
  const requests = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
    request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
      .send({ customer_name: `Cliente Estrés ${i}`, items: [{ product_id: product.id, quantity: 1 }] }),
  )

  const responses = await Promise.all(requests)

  const succeeded = responses.filter((res) => res.status === 201)
  const rejected = responses.filter((res) => res.status === 409)

  assert.equal(succeeded.length, INITIAL_STOCK, 'expected exactly INITIAL_STOCK requests to succeed')
  assert.equal(rejected.length, CONCURRENT_REQUESTS - INITIAL_STOCK, 'the rest must be rejected, not time out or 500')
  assert.ok(rejected.every((res) => res.body.error.code === 'INSUFFICIENT_STOCK'))

  const finalStock = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock
  assert.equal(finalStock, 0, 'stock must land at exactly 0, never negative')

  const invoiceCount = db.prepare('SELECT COUNT(*) AS n FROM invoices').get().n
  assert.equal(invoiceCount, INITIAL_STOCK, 'exactly one invoice row per accepted request, no partial/duplicate rows')
})
