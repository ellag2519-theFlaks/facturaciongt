const errorHandler = (err, req, res, next) => {
  res.status(err.status ?? 500).json({
    error: {
      code: err.code ?? 'INTERNAL_ERROR',
      message: err.message
    }
  })
}

export default errorHandler
