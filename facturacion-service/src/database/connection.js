import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import env from '../config/env.js'

// Ensure the database directory exists
const dbDir = path.dirname(env.dbPath)
fs.mkdirSync(dbDir, { recursive: true })

const db = new Database(env.dbPath)
db.pragma('foreign_keys = ON')

export default db
