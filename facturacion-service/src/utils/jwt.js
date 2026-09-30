import jwt from 'jsonwebtoken'
import env from '../config/env.js'

/**
 * Signs a JWT containing the given payload.
 * @param {{id: number, username: string, role: string}} payload
 * @returns {string} signed JWT
 */
export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn })
}

/**
 * Verifies a JWT and returns its decoded payload.
 * @param {string} token
 * @returns {{id: number, username: string, role: string}}
 */
export function verifyJwt(token) {
  return jwt.verify(token, env.jwtSecret)
}
