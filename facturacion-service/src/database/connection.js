import Database from 'better-sqlite3'
import env from '../config/env.js'

const db = new Database(env.dbPath)
db.pragma('foreign_keys = ON')

export default db
