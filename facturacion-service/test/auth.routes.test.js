import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { resetDb } from './helpers/resetDb.js'

before(() => {
  resetDb()
  seedUsers(db)
})

test('login with valid admin credentials returns token and user', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })
  assert.equal(res.status, 200)
  assert.ok(res.body.token)
  assert.equal(res.body.user.role, 'admin')
})

test('login with wrong password returns 401 INVALID_CREDENTIALS', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
})

test('login with unknown username returns the same 401 INVALID_CREDENTIALS', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'x' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
})
