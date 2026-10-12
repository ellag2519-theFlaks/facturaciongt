// NF-TOL-01 (plan de pruebas, Fase 2): fallo simulado de SQLite -- la
// conexión se cierra deliberadamente para forzar el mismo tipo de error
// crudo que lanzaría better-sqlite3 ante un fallo real de disco/DB
// (TypeError: "The database connection is not open"). node:test corre
// cada archivo en su PROPIO proceso hijo, así que cerrar la conexión aquí
// no afecta a ningún otro archivo de prueba.
//
// No se modifica SQLite ni su esquema -- solo se simula su caída para
// verificar que errorHandler.js nunca deja escapar el error crudo del
// driver al cliente.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { resetDb } from './helpers/resetDb.js'

let adminToken
before(() => {
  resetDb()
  const [admin] = seedUsers(db)
  adminToken = signToken({ id: admin.id, username: admin.username, role: admin.role })
})

test('a closed SQLite connection returns a clean 500 INTERNAL_ERROR, never the raw driver error', async () => {
  db.close()

  const res = await request(app).get('/api/products').set('Authorization', `Bearer ${adminToken}`)

  assert.equal(res.status, 500)
  assert.equal(res.body.error.code, 'INTERNAL_ERROR')
  assert.equal(res.body.error.message, 'Error interno del servidor')

  // The raw better-sqlite3 message must never reach the client.
  const bodyText = JSON.stringify(res.body)
  assert.ok(!bodyText.includes('database connection'), 'raw driver error text must not leak to the client')
  assert.ok(!bodyText.includes('.js:'), 'no stack trace/file path must leak to the client')
})
