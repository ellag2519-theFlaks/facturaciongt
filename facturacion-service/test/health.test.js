import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok' })
})

test('unknown route returns 404 with error envelope', async () => {
  const res = await request(app).get('/nope')
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'NOT_FOUND')
})
