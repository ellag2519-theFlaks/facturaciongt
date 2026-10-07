export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500
  const code = err.isOperational ? err.code || 'INTERNAL_ERROR' : 'INTERNAL_ERROR'
  const message = err.isOperational ? err.message : 'Unexpected server error'

  if (!err.isOperational) {
    console.error(err)
  }

  res.status(statusCode).json({ error: { code, message } })
}
