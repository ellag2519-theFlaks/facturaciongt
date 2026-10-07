import { fetchTodayRate, fetchRateByDate } from '../clients/banguatClient.js'
import cache from '../utils/cache.js'
import { AppError } from '../utils/AppError.js'
import { isValidIsoDate, isoToBanguatFormat } from '../utils/dateUtils.js'
import { CACHE_DURATION_MS } from '../config/env.js'

const BANGUAT_ERROR_STATUS = {
  BANGUAT_TIMEOUT: 504,
  BANGUAT_UNREACHABLE: 502,
  BANGUAT_SOAP_FAULT: 502,
  BANGUAT_INVALID_XML: 502,
  BANGUAT_EMPTY_RESPONSE: 502,
}

function toAppError(error) {
  const statusCode = BANGUAT_ERROR_STATUS[error.code] || 502
  return new AppError(error.message, statusCode, error.code || 'BANGUAT_ERROR')
}

function todayCacheKey() {
  const today = new Date().toISOString().slice(0, 10)
  return `exchange-rate:today:${today}`
}

export async function getTodayRate() {
  const key = todayCacheKey()
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  let rate
  try {
    rate = await fetchTodayRate()
  } catch (error) {
    throw toAppError(error)
  }

  cache.set(key, rate, CACHE_DURATION_MS)
  return rate
}

export async function getRateByDate(isoDate) {
  if (!isValidIsoDate(isoDate)) {
    throw new AppError(`Invalid date: ${isoDate}. Expected format YYYY-MM-DD`, 400, 'INVALID_DATE')
  }

  let result
  try {
    result = await fetchRateByDate(isoToBanguatFormat(isoDate))
  } catch (error) {
    throw toAppError(error)
  }

  if (!result) {
    throw new AppError(`No exchange rate available for ${isoDate}`, 404, 'RATE_NOT_FOUND')
  }

  return result
}

const SUPPORTED_CURRENCIES = ['USD', 'GTQ']

export async function convert({ amount, from, to }) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new AppError('amount must be a positive number', 400, 'INVALID_AMOUNT')
  }
  if (!SUPPORTED_CURRENCIES.includes(from) || !SUPPORTED_CURRENCIES.includes(to)) {
    throw new AppError('from/to must be USD or GTQ', 400, 'INVALID_CURRENCY')
  }
  if (from === to) {
    throw new AppError('from and to must be different currencies', 400, 'INVALID_CURRENCY_PAIR')
  }

  const { rate, date } = await getTodayRate()
  const result = from === 'USD' ? amount * rate : amount / rate

  return {
    amount,
    from,
    to,
    rate,
    rateDate: date,
    result: Number(result.toFixed(2)),
  }
}
