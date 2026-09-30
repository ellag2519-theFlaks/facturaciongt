import { Router } from 'express'
import { loginHandler } from '../controllers/authController.js'

const authRoutes = Router()

authRoutes.post('/login', loginHandler)

export default authRoutes
