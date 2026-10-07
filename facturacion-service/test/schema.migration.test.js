import { test } from 'node:test'
import assert from 'node:assert/strict'
import db from '../src/database/connection.js'
import '../src/database/schema.js'

test('invoices table has the new currency columns', () => {
  const columns = db.prepare("PRAGMA table_info(invoices)").all().map((col) => col.name)
  assert.ok(columns.includes('payment_currency'))
  assert.ok(columns.includes('exchange_rate'))
  assert.ok(columns.includes('total_usd'))
})

test('running schema.js a second time does not throw', async () => {
  // Re-import under a cache-busting query string so the module body actually re-runs
  // (ESM caches modules by specifier; '../src/database/schema.js' alone would be a no-op).
  await assert.doesNotReject(import('../src/database/schema.js?rerun=1'))
})
