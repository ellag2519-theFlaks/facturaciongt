import express from 'express'
import cors from 'cors'
import './database/schema.js'
import authRoutes from './routes/authRoutes.js'
import notFoundHandler from './middlewares/notFoundHandler.js'
import errorHandler from './middlewares/errorHandler.js'

const app = express()

// Middlewares
app.use(cors())
app.use(express.json())

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Routes
app.use('/api/auth', authRoutes)

// Error handling
app.use(notFoundHandler)
app.use(errorHandler)

export default app
