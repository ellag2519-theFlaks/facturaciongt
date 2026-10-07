import axios from 'axios'

const REQUEST_TIMEOUT_MS = 5000

export async function getTodayRate() {
  const exchangeServiceUrl = process.env.EXCHANGE_SERVICE_URL || 'http://localhost:3002'
  try {
    const response = await axios.get(`${exchangeServiceUrl}/api/exchange-rate/today`, {
      timeout: REQUEST_TIMEOUT_MS,
    })
    return response.data
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw Object.assign(new Error(`Exchange service request timed out after ${REQUEST_TIMEOUT_MS}ms`), {
        code: 'EXCHANGE_TIMEOUT',
      })
    }
    if (!error.response) {
      throw Object.assign(new Error('Exchange service is unreachable'), {
        code: 'EXCHANGE_UNAVAILABLE',
        cause: error,
      })
    }
    throw Object.assign(
      new Error(error.response.data?.error?.message || 'Exchange service returned an error'),
      { code: 'EXCHANGE_ERROR_RESPONSE', cause: error },
    )
  }
}
