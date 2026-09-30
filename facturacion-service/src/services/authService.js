import bcrypt from 'bcrypt'
import db from '../database/connection.js'
import AppError from '../utils/AppError.js'
import { signToken } from '../utils/jwt.js'

/**
 * Authenticates a user by username and password.
 * Throws the same AppError for an unknown username or a wrong password,
 * so the caller can't distinguish which one failed.
 *
 * @param {string} username
 * @param {string} password
 * @returns {{token: string, user: {id: number, username: string, role: string}}}
 */
export function login(username, password) {
  const user = db.prepare('SELECT id, username, role, password_hash FROM users WHERE username = ?').get(username)

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos')
  }

  const token = signToken({ id: user.id, username: user.username, role: user.role })

  return {
    token,
    user: { id: user.id, username: user.username, role: user.role }
  }
}
