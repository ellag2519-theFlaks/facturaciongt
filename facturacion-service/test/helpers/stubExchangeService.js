import http from 'node:http'

export async function startStubExchangeService({ rate = 7.8, date = '2026-10-07', status = 200 } = {}) {
  const server = http.createServer((req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(status === 200
      ? JSON.stringify({ rate, date })
      : JSON.stringify({ error: { code: 'STUB_ERROR', message: 'stub error' } }))
  })
  await new Promise((resolve) => server.listen(0, resolve))
  process.env.EXCHANGE_SERVICE_URL = `http://localhost:${server.address().port}`
  return { close: () => new Promise((resolve) => server.close(resolve)) }
}
