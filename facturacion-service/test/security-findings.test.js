// NF-SEG-01 (plan de pruebas, Fase 2): hallazgo de seguridad, documentado
// tal cual es -- NO es una corrección. Por instrucción explícita, este
// proyecto no agrega rate-limiting/bloqueo de fuerza bruta sin autorización
// separada; este test prueba y deja registrado el comportamiento REAL
// actual, para poder mostrarlo como hallazgo en la exposición.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { resetDb } from './helpers/resetDb.js'

const BRUTE_FORCE_ATTEMPTS = 25

before(() => {
  resetDb()
  seedUsers(db)
})

test('SECURITY FINDING: no rate-limiting on /api/auth/login -- 25 consecutive wrong passwords all return 401, none blocked', async () => {
  for (let i = 0; i < BRUTE_FORCE_ATTEMPTS; i++) {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: `wrong-${i}` })
    // Today's real behavior: every attempt is treated identically, no
    // escalating delay, no lockout, no 429. This IS the finding -- it is
    // asserted here so the test fails (loudly) the day someone adds
    // rate-limiting and forgets to update this documented expectation.
    assert.equal(res.status, 401, `attempt ${i} should be 401 like every other -- no blocking exists today`)
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
  }

  // Corollary finding: the account is NOT locked out either. This cuts
  // both ways -- no brute-force protection, but also no self-lockout risk
  // for a legitimate user who mistypes their password repeatedly.
  const validLogin = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })
  assert.equal(validLogin.status, 200, 'the real account must still log in normally after 25 failed attempts')
  assert.ok(validLogin.body.token)
})
