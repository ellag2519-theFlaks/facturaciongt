import AppError from '../utils/AppError.js'

const notFoundHandler = (req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Ruta no encontrada'))
}

export default notFoundHandler
