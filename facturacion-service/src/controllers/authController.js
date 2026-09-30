import { login } from '../services/authService.js'

export function loginHandler(req, res, next) {
  try {
    const { username, password } = req.body
    const result = login(username, password)
    res.json(result)
  } catch (err) {
    next(err)
  }
}
