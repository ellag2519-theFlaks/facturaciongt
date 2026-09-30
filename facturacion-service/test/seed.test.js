import { test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcrypt'
import Database from 'better-sqlite3'
import { seedUsers } from '../src/database/seed.js'

test('seedUsers creates admin and vendedor with hashed passwords', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'vendedor')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  seedUsers(db)
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin')
  assert.equal(admin.role, 'admin')
  assert.ok(bcrypt.compareSync('admin123', admin.password_hash))
})

test('seedUsers is idempotent', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'vendedor')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  seedUsers(db)
  seedUsers(db)
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  assert.equal(count, 2)
})
