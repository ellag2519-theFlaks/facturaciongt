import AppError from '../utils/AppError.js'

/**
 * Higher-order middleware that returns a role-checking middleware.
 * Checks if the user's role is in the allowed roles.
 * @param {...string} roles - Allowed roles
 * @returns {Function} middleware function
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'No tiene permisos para esta acción'))
    }
    next()
  }
}
