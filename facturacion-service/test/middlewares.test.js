import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { signToken } from '../src/utils/jwt.js'
import { verifyTokenMiddleware } from '../src/middlewares/auth.js'
import { requireRole } from '../src/middlewares/authorize.js'
import errorHandler from '../src/middlewares/errorHandler.js'

function buildTestApp() {
  const app = express()
  app.get('/protected', verifyTokenMiddleware, requireRole('admin'), (req, res) => res.json({ ok: true }))
  app.use(errorHandler)
  return app
}

test('missing token returns 401 UNAUTHORIZED', async () => {
  const res = await request(buildTestApp()).get('/protected')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHORIZED')
})

test('tampered token returns 401 UNAUTHORIZED, not a crash', async () => {
  const res = await request(buildTestApp()).get('/protected').set('Authorization', 'Bearer not-a-real-jwt')
  assert.equal(res.status, 401)
})

test('valid token with wrong role returns 403 FORBIDDEN', async () => {
  const token = signToken({ id: 1, username: 'v', role: 'vendedor' })
  const res = await request(buildTestApp()).get('/protected').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 403)
  assert.equal(res.body.error.code, 'FORBIDDEN')
})

test('valid token with correct role passes through', async () => {
  const token = signToken({ id: 1, username: 'a', role: 'admin' })
  const res = await request(buildTestApp()).get('/protected').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
})
