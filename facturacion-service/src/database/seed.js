import { fileURLToPath } from 'node:url'
import path from 'node:path'
import bcrypt from 'bcrypt'
import env from '../config/env.js'

/**
 * Idempotently seeds the users table with admin and vendedor users.
 * Uses INSERT OR IGNORE to ensure idempotency (keyed on username uniqueness).
 * Passwords are hashed with bcrypt (10 rounds).
 *
 * @param {Database} database - better-sqlite3 database instance
 * @returns {Array} Array of [adminUser, vendedorUser] where each is {id, username, role}
 */
export function seedUsers(database) {
  // Hash the passwords
  const adminPasswordHash = bcrypt.hashSync(env.seedAdmin.password, 10)
  const vendedorPasswordHash = bcrypt.hashSync(env.seedVendedor.password, 10)

  // Prepare the insert statement with INSERT OR IGNORE for idempotency
  const insertStmt = database.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `)

  // Insert both users (second insert will be ignored if username already exists)
  insertStmt.run(env.seedAdmin.username, adminPasswordHash, 'admin')
  insertStmt.run(env.seedVendedor.username, vendedorPasswordHash, 'vendedor')

  // Fetch and return the users with their real IDs from the database
  const selectStmt = database.prepare('SELECT id, username, role FROM users WHERE username = ?')
  const adminUser = selectStmt.get(env.seedAdmin.username)
  const vendedorUser = selectStmt.get(env.seedVendedor.username)

  return [adminUser, vendedorUser]
}

// Script entry point: allow running directly with `node src/database/seed.js`
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // Import db singleton from connection.js
  import('./connection.js').then(({ default: db }) => {
    seedUsers(db)
    console.log('Users seeded successfully')
    process.exit(0)
  }).catch(err => {
    console.error('Failed to seed users:', err)
    process.exit(1)
  })
}
