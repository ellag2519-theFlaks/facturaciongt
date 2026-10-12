import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startStubExchangeService } from './helpers/stubExchangeService.js'
import { getTodayRate } from '../src/clients/exchangeClient.js'

test('getTodayRate returns the rate and date from a successful response', async () => {
  const stub = await startStubExchangeService({ rate: 7.8, date: '2026-10-07' })
  try {
    const result = await getTodayRate()
    assert.deepEqual(result, { rate: 7.8, date: '2026-10-07' })
  } finally {
    await stub.close()
  }
})

test('getTodayRate throws EXCHANGE_UNAVAILABLE when nothing is listening', async () => {
  process.env.EXCHANGE_SERVICE_URL = 'http://localhost:1'
  await assert.rejects(getTodayRate(), (err) => err.code === 'EXCHANGE_UNAVAILABLE')
})

test('getTodayRate throws EXCHANGE_ERROR_RESPONSE when the service returns an error status', async () => {
  const stub = await startStubExchangeService({ status: 500 })
  try {
    await assert.rejects(getTodayRate(), (err) => err.code === 'EXCHANGE_ERROR_RESPONSE')
  } finally {
    await stub.close()
  }
})
