class AppError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
    this.message = message
  }
}

export default AppError
