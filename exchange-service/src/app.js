import express from 'express'
import cors from 'cors'
import exchangeRateRoutes from './routes/exchangeRateRoutes.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { notFoundHandler } from './middlewares/notFoundHandler.js'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'exchange-service' })
})

app.use('/api/exchange-rate', exchangeRateRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
