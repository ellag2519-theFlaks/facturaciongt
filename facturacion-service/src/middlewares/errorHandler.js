const errorHandler = (err, req, res, next) => {
  // express.json() throws this (via body-parser) when the request body is
  // malformed JSON. It's a client input problem, not a server fault, so it
  // gets a clean 400 instead of falling into the generic 500 path below.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Cuerpo de la petición inválido'
      }
    })
  }

  // AppError instances carry an intentional status/code/message meant for
  // the client (e.g. 404 PRODUCT_NOT_FOUND) -- pass those through as-is.
  if (err.status !== undefined && err.code !== undefined) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message
      }
    })
  }

  // Anything else is unexpected (a bug, a raw driver/DB error, etc). Log it
  // server-side so it isn't silently swallowed, but never leak its raw
  // message/code to the client.
  console.error(err)
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor'
    }
  })
}

export default errorHandler
