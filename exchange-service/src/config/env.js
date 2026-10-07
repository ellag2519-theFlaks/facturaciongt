import dotenv from 'dotenv'

dotenv.config()

export const PORT = process.env.PORT || 3002
export const BANGUAT_SERVICE_URL =
  process.env.BANGUAT_SERVICE_URL || 'https://banguat.gob.gt/variables/ws/TipoCambio.asmx'
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 5000
export const CACHE_DURATION_MS = Number(process.env.CACHE_DURATION_MS) || 3600000
