import { verifyJwt } from '../utils/jwt.js'
import AppError from '../utils/AppError.js'

/**
 * Middleware that verifies the JWT token from the Authorization header.
 * Sets req.user with the decoded token payload on success.
 */
export function verifyTokenMiddleware(req, res, next) {
  const authHeader = req.headers.authorization

  // Check if Authorization header exists
  if (!authHeader) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token requerido'))
  }

  // Extract token from "Bearer <token>" format
  const token = authHeader.split(' ')[1]

  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token requerido'))
  }

  try {
    const decoded = verifyJwt(token)
    req.user = decoded
    next()
  } catch (error) {
    next(new AppError(401, 'UNAUTHORIZED', 'Token inválido o expirado'))
  }
}
