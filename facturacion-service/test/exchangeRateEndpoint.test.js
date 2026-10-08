import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { resetDb } from './helpers/resetDb.js'
import { startStubExchangeService } from './helpers/stubExchangeService.js'

let vendedorToken
before(() => {
  resetDb()
  const [, vendedor] = seedUsers(db)
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
})

test('GET /api/invoices/exchange-rate returns the current rate without creating anything', async () => {
  const stub = await startStubExchangeService({ rate: 7.8, date: '2026-10-07' })
  try {
    const res = await request(app).get('/api/invoices/exchange-rate')
      .set('Authorization', `Bearer ${vendedorToken}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.rate, 7.8)
    assert.equal(res.body.date, '2026-10-07')
  } finally {
    await stub.close()
  }
})

test('GET /api/invoices/exchange-rate returns 502 when the exchange service is unreachable', async () => {
  process.env.EXCHANGE_SERVICE_URL = 'http://localhost:1'
  const res = await request(app).get('/api/invoices/exchange-rate')
    .set('Authorization', `Bearer ${vendedorToken}`)
  assert.equal(res.status, 502)
  assert.equal(res.body.error.code, 'EXCHANGE_SERVICE_UNAVAILABLE')
})

test('GET /api/invoices/exchange-rate returns 502 when the rate is malformed', async () => {
  const stub = await startStubExchangeService({ rate: null })
  try {
    const res = await request(app).get('/api/invoices/exchange-rate')
      .set('Authorization', `Bearer ${vendedorToken}`)
    assert.equal(res.status, 502)
    assert.equal(res.body.error.code, 'EXCHANGE_SERVICE_UNAVAILABLE')
  } finally {
    await stub.close()
  }
})

test('GET /api/invoices/exchange-rate requires authentication', async () => {
  const res = await request(app).get('/api/invoices/exchange-rate')
  assert.equal(res.status, 401)
})
