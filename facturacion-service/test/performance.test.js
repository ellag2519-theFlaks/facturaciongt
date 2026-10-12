// NF-REND-01 (plan de pruebas, Fase 2): tiempo de respuesta de
// GET /api/products contra un volumen realista de datos.
//
// Umbral calibrado por medición real: con 150 productos sembrados, el
// endpoint respondió en 2-14ms en esta máquina (primera petición más lenta
// por el arranque en frío). Se usa una petición de "calentamiento" fuera de
// la medición, y un umbral de 100ms -- ~10x más holgado que lo medido, para
// tolerar una máquina de CI más lenta sin dejar de ser un criterio real.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { create as createProduct } from '../src/models/productModel.js'
import { resetDb } from './helpers/resetDb.js'

const PRODUCT_COUNT = 150
const MAX_RESPONSE_MS = 100

let adminToken
before(() => {
  resetDb()
  const [admin] = seedUsers(db)
  adminToken = signToken({ id: admin.id, username: admin.username, role: admin.role })
  for (let i = 0; i < PRODUCT_COUNT; i++) {
    createProduct({ name: `Producto Perf ${i}`, sku: `PERF-${i}`, price: 10 + i, stock: 10, category: null })
  }
})

test(`GET /api/products responds within ${MAX_RESPONSE_MS}ms with ${PRODUCT_COUNT} products`, async () => {
  // Warm-up request, excluded from the measurement (module loading / query
  // plan caching happens on the first call and isn't representative).
  await request(app).get('/api/products').set('Authorization', `Bearer ${adminToken}`)

  const start = Date.now()
  const res = await request(app).get('/api/products').set('Authorization', `Bearer ${adminToken}`)
  const elapsedMs = Date.now() - start

  assert.equal(res.status, 200)
  assert.equal(res.body.length, PRODUCT_COUNT)
  assert.ok(elapsedMs <= MAX_RESPONSE_MS, `expected <= ${MAX_RESPONSE_MS}ms, got ${elapsedMs}ms`)
})
