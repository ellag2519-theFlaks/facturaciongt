# Sistema de Facturación e Inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React + Express + SQLite billing/inventory app (products, stock-aware invoicing with 12% IVA, two-role auth) with a Python + Playwright E2E suite that produces a video, an HTML report, and an auto-generated PPTX evidence deck per run.

**Architecture:** One Express backend (`facturacion-service`) in routes→controllers→services→models→middlewares layers over SQLite (`better-sqlite3`), one React frontend (Vite), and a standalone Python test suite (`tests/`) that drives both through the browser and assembles its own report artifacts. No shared code between backend and test suite — they integrate only over HTTP/UI.

**Tech Stack:** Node.js + Express 5, better-sqlite3, jsonwebtoken, bcrypt, cors, dotenv, nodemon (dev), Node's built-in `node:test` + `supertest` for backend tests. React 19, Vite, react-router-dom@7.18.2, Axios, Tailwind CSS v4. Python + pytest-playwright + pytest-html + python-pptx for E2E/QA.

**Spec:** `docs/superpowers/specs/2026-09-30-sistema-facturacion-design.md`

## Global Constraints

- Backend: Node.js + Express 5, `cors`, `dotenv`, `nodemon` (dev only), `better-sqlite3`, `jsonwebtoken`, `bcrypt`.
- Frontend: React 19, Vite, `react-router-dom@7.18.2` (pinned, matches FinanzasGT), Axios, Tailwind CSS v4.
- Every API error responds `{ error: { code, message } }` with the matching HTTP status — no other error shape anywhere in the backend.
- IVA is a fixed 12%: `tax = subtotal * 0.12`, `total = subtotal + tax`. Never configurable.
- `invoice_number` format is `FAC-######` (6-digit zero-padded correlativo derived from `MAX(id)+1` in `invoices`, computed inside the same transaction as the insert).
- No public registration endpoint. Users exist only via `facturacion-service/src/database/seed.js`.
- Vendedor sees only invoices with `created_by = self` (list and detail); admin sees all.
- Passwords are hashed with `bcrypt` before storage; plaintext never touches the database.
- E2E suite: `pytest-playwright` with `--video=on` (records every test), `pytest-html` for the report, `python-pptx` for the evidence deck. No other browser-automation or reporting library.
- Seed credentials (documented in `.env.example`, used by both the seed script and the E2E suite): `admin` / `admin123` (role `admin`), `vendedor` / `vendedor123` (role `vendedor`) — overridable via env vars, but these are the defaults the test suite assumes.
- Every `facturacion-service` test file that creates rows through the shared `db`/`app` singleton (Tasks 3, 5, 11, 12) calls the `resetDb()` helper (Task 1) in a `before()` hook before seeding/creating fixtures, so running the same file — or the whole suite — twice in a row stays green instead of failing on leftover rows from a previous run. (Task 2's `seedUsers` test uses its own in-memory `Database(':memory:')` and is exempt — nothing it does touches the shared file DB.)

## Review Focus

- Expired or tampered JWT on a protected route must return 401 without crashing the process, not just a missing token — Task 4.
- An invoice item with a `product_id` that doesn't exist, or `quantity <= 0`, must be rejected (400) before any stock is touched — Task 11.
- A vendedor requesting another user's invoice by ID directly (`GET /api/invoices/:id`) must not see its data (404, not a data leak) — Task 12.
- Submitting an invoice with zero items must be rejected by the backend (400) and blocked in the frontend form before it can be submitted — Tasks 11 and 13.
- A duplicate SKU must be rejected on **update** (`PUT /api/products/:id`), not only on create — Task 5.

---

### Task 1: Backend scaffold — server, DB connection, schema, error handling

**Files:**
- Create: `facturacion-service/package.json`
- Create: `facturacion-service/.env.example`
- Create: `facturacion-service/server.js`
- Create: `facturacion-service/src/app.js`
- Create: `facturacion-service/src/config/env.js`
- Create: `facturacion-service/src/database/connection.js`
- Create: `facturacion-service/src/database/schema.js`
- Create: `facturacion-service/src/utils/AppError.js`
- Create: `facturacion-service/src/middlewares/errorHandler.js`
- Create: `facturacion-service/src/middlewares/notFoundHandler.js`
- Create: `facturacion-service/test/helpers/resetDb.js`
- Test: `facturacion-service/test/health.test.js`

**Interfaces:**
- Produces: `AppError` class (`facturacion-service/src/utils/AppError.js`) — `new AppError(status: number, code: string, message: string)`, instance has `.status`, `.code`, `.message`.
- Produces: `errorHandler` (default export) — Express error middleware `(err, req, res, next)` that responds `res.status(err.status ?? 500).json({ error: { code: err.code ?? 'INTERNAL_ERROR', message: err.message } })`.
- Produces: `notFoundHandler` (default export) — Express middleware for unmatched routes, calls `next(new AppError(404, 'NOT_FOUND', 'Ruta no encontrada'))`.
- Produces: `db` (default export of `connection.js`) — a `better-sqlite3` `Database` instance, `pragma('foreign_keys = ON')` enabled, opened at the path from `env.js`.
- Produces: `env` (default export of `config/env.js`) — `{ port, jwtSecret, jwtExpiresIn, dbPath, seedAdmin: {username,password}, seedVendedor: {username,password} }` read from `process.env` via `dotenv`.
- Produces: `app` (default export of `src/app.js`) — configured Express app (cors, `express.json()`, routes mounted by later tasks, `notFoundHandler`, `errorHandler` last) with `GET /health` returning `{ status: 'ok' }`.
- Produces: `resetDb()` (named export, `test/helpers/resetDb.js`) — runs against the shared `db` singleton, deletes all rows in FK-safe order: `DELETE FROM invoice_items; DELETE FROM invoices; DELETE FROM products; DELETE FROM users;`. Every later test file that creates rows calls this in a `before()` hook (see Global Constraints) so reruns of the same file, or the full suite, start from an empty DB instead of colliding with rows a previous run left behind.

- [ ] **Step 1: Write the failing test**

```js
// facturacion-service/test/health.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'

test('GET /health returns ok', async () => {
  const res = await request(app).get('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok' })
})

test('unknown route returns 404 with error envelope', async () => {
  const res = await request(app).get('/nope')
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'NOT_FOUND')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd facturacion-service && node --test test/health.test.js`
Expected: FAIL (`app.js` / dependencies not found)

- [ ] **Step 3: Implement the scaffold**

`package.json`: `"type": "module"`, deps `express@^5`, `better-sqlite3`, `cors`, `dotenv`, `jsonwebtoken`, `bcrypt`; devDeps `nodemon`, `supertest`; scripts `"start": "node server.js"`, `"dev": "nodemon server.js"`, `"test": "node --test test/"`.

`env.js` reads `PORT` (default `3001`), `JWT_SECRET` (required, no default), `JWT_EXPIRES_IN` (default `8h`), `DB_PATH` (default `./data/facturacion.db`), `SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD` (defaults `admin`/`admin123`), `SEED_VENDEDOR_USERNAME`/`SEED_VENDEDOR_PASSWORD` (defaults `vendedor`/`vendedor123`).

`schema.js` runs `CREATE TABLE IF NOT EXISTS` for `users`, `products`, `invoices`, `invoice_items` exactly as defined in the spec's "Modelo de datos" section (copy the DDL verbatim), imported for its side effect (`import './database/schema.js'`) from `app.js` before routes are mounted.

`.env.example` documents every `env.js` variable with its default.

Also implement `test/helpers/resetDb.js` per its Interfaces entry above — no dedicated test for it beyond later tasks exercising it via their own `before()` hooks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd facturacion-service && node --test test/health.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add facturacion-service/package.json facturacion-service/.env.example facturacion-service/server.js facturacion-service/src facturacion-service/test
git commit -m "feat: scaffold facturacion-service with health check, error handling, and test resetDb helper"
```

---

### Task 2: Seed script

**Files:**
- Create: `facturacion-service/src/database/seed.js`
- Test: `facturacion-service/test/seed.test.js`

**Interfaces:**
- Consumes: `db` (Task 1), `env.seedAdmin`/`env.seedVendedor` (Task 1).
- Produces: `seedUsers(database)` (named export) — idempotent (uses `INSERT OR IGNORE` keyed on `username`), hashes both seed passwords with `bcrypt.hashSync(password, 10)`, inserts one `admin` row then one `vendedor` row, returns `[adminUser, vendedorUser]` — that exact order — as `{id, username, role}` each (no password hash in the return value; `id` is always re-read from the DB row, real or pre-existing, never assumed). `invoices.created_by` has a `REFERENCES users(id)` foreign key (`PRAGMA foreign_keys = ON`, Task 1) — any test that creates an invoice must sign tokens using the `id`s this function returns, never a hardcoded literal, or the insert fails its FK check.
- Running `node src/database/seed.js` directly seeds the real DB from `env.js` (script entry point calls `seedUsers(db)` when `import.meta.url === \`file://${process.argv[1]}\``).

- [ ] **Step 1: Write the failing test**

```js
// facturacion-service/test/seed.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcrypt'
import Database from 'better-sqlite3'
import { seedUsers } from '../src/database/seed.js'

test('seedUsers creates admin and vendedor with hashed passwords', () => {
  const db = new Database(':memory:') // in-memory DB — this test does not touch the shared file DB, so it does not need resetDb()
  db.exec(/* same CREATE TABLE users statement as schema.js */ '')
  seedUsers(db)
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin')
  assert.equal(admin.role, 'admin')
  assert.ok(bcrypt.compareSync('admin123', admin.password_hash))
})

test('seedUsers is idempotent', () => {
  const db = new Database(':memory:')
  db.exec('')
  seedUsers(db)
  seedUsers(db)
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  assert.equal(count, 2)
})
```

(Implementer fills the `db.exec('')` calls with the real `users` table DDL from `schema.js`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd facturacion-service && node --test test/seed.test.js`
Expected: FAIL (`seed.js` not found)

- [ ] **Step 3: Implement `seedUsers(database)` in `src/database/seed.js`**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd facturacion-service && node --test test/seed.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add facturacion-service/src/database/seed.js facturacion-service/test/seed.test.js
git commit -m "feat: add idempotent user seed script"
```

---

### Task 3: Auth service + login endpoint

**Files:**
- Create: `facturacion-service/src/utils/jwt.js`
- Create: `facturacion-service/src/services/authService.js`
- Create: `facturacion-service/src/controllers/authController.js`
- Create: `facturacion-service/src/routes/authRoutes.js`
- Modify: `facturacion-service/src/app.js` — mount `authRoutes` at `/api/auth`
- Test: `facturacion-service/test/auth.routes.test.js`

**Interfaces:**
- Consumes: `db`, `AppError`, `env` (Task 1), `seedUsers` (Task 2, used in test setup only).
- Produces: `signToken(payload: {id, username, role})` / `verifyJwt(token)` (named exports, `src/utils/jwt.js`), using `env.jwtSecret` and `env.jwtExpiresIn`.
- Produces: `login(username, password)` (named export, `authService.js`) — returns `{ token, user: { id, username, role } }`; throws `AppError(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos')` for both unknown username and wrong password (same message either way — don't reveal which).
- Produces: `loginHandler(req, res, next)` (named export, `authController.js`).
- Produces: `authRoutes` (default export, Express `Router`) — `POST /login`.

- [ ] **Step 1: Write the failing test**

```js
// facturacion-service/test/auth.routes.test.js
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { resetDb } from './helpers/resetDb.js'

before(() => {
  resetDb()
  seedUsers(db)
})

test('login with valid admin credentials returns token and user', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' })
  assert.equal(res.status, 200)
  assert.ok(res.body.token)
  assert.equal(res.body.user.role, 'admin')
})

test('login with wrong password returns 401 INVALID_CREDENTIALS', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
})

test('login with unknown username returns the same 401 INVALID_CREDENTIALS', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'x' })
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS')
})
```

(`resetDb()` per the Global Constraints test-isolation rule — Task 1's helper, imported from `./helpers/resetDb.js`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd facturacion-service && node --test test/auth.routes.test.js`
Expected: FAIL (route not mounted)

- [ ] **Step 3: Implement auth service, controller, routes**

`login` compares with `bcrypt.compareSync`; on success calls `signToken({id, username, role})`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd facturacion-service && node --test test/auth.routes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add facturacion-service/src/utils/jwt.js facturacion-service/src/services/authService.js facturacion-service/src/controllers/authController.js facturacion-service/src/routes/authRoutes.js facturacion-service/src/app.js facturacion-service/test/auth.routes.test.js
git commit -m "feat: add JWT login endpoint"
```

---

### Task 4: Auth/role middlewares

**Files:**
- Create: `facturacion-service/src/middlewares/auth.js`
- Create: `facturacion-service/src/middlewares/authorize.js`
- Test: `facturacion-service/test/middlewares.test.js`

**Interfaces:**
- Consumes: `verifyJwt` (Task 3), `AppError` (Task 1).
- Produces: `verifyTokenMiddleware(req, res, next)` (named export, `auth.js`) — reads `Authorization: Bearer <token>`; missing header → `next(new AppError(401, 'UNAUTHORIZED', 'Token requerido'))`; invalid/expired/tampered → `next(new AppError(401, 'UNAUTHORIZED', 'Token inválido o expirado'))`; on success sets `req.user = { id, username, role }` and calls `next()`.
- Produces: `requireRole(...roles: string[])` (named export, `authorize.js`) — returns middleware that calls `next(new AppError(403, 'FORBIDDEN', 'No tiene permisos para esta acción'))` when `req.user.role` is not in `roles`, else `next()`.

- [ ] **Step 1: Write the failing test**

```js
// facturacion-service/test/middlewares.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { signToken } from '../src/utils/jwt.js'
import { verifyTokenMiddleware } from '../src/middlewares/auth.js'
import { requireRole } from '../src/middlewares/authorize.js'
import errorHandler from '../src/middlewares/errorHandler.js'

function buildTestApp() {
  const app = express()
  app.get('/protected', verifyTokenMiddleware, requireRole('admin'), (req, res) => res.json({ ok: true }))
  app.use(errorHandler)
  return app
}

test('missing token returns 401 UNAUTHORIZED', async () => {
  const res = await request(buildTestApp()).get('/protected')
  assert.equal(res.status, 401)
  assert.equal(res.body.error.code, 'UNAUTHORIZED')
})

test('tampered token returns 401 UNAUTHORIZED, not a crash', async () => {
  const res = await request(buildTestApp()).get('/protected').set('Authorization', 'Bearer not-a-real-jwt')
  assert.equal(res.status, 401)
})

test('valid token with wrong role returns 403 FORBIDDEN', async () => {
  const token = signToken({ id: 1, username: 'v', role: 'vendedor' })
  const res = await request(buildTestApp()).get('/protected').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 403)
  assert.equal(res.body.error.code, 'FORBIDDEN')
})

test('valid token with correct role passes through', async () => {
  const token = signToken({ id: 1, username: 'a', role: 'admin' })
  const res = await request(buildTestApp()).get('/protected').set('Authorization', `Bearer ${token}`)
  assert.equal(res.status, 200)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd facturacion-service && node --test test/middlewares.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `verifyTokenMiddleware` and `requireRole`**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd facturacion-service && node --test test/middlewares.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add facturacion-service/src/middlewares/auth.js facturacion-service/src/middlewares/authorize.js facturacion-service/test/middlewares.test.js
git commit -m "feat: add JWT and role-check middlewares"
```

---

### Task 5: Products backend (CRUD, admin-only mutations)

**Files:**
- Create: `facturacion-service/src/models/productModel.js`
- Create: `facturacion-service/src/services/productService.js`
- Create: `facturacion-service/src/controllers/productController.js`
- Create: `facturacion-service/src/routes/productRoutes.js`
- Modify: `facturacion-service/src/app.js` — mount `productRoutes` at `/api/products`
- Test: `facturacion-service/test/products.routes.test.js`

**Interfaces:**
- Consumes: `db`, `AppError` (Task 1), `verifyTokenMiddleware`, `requireRole` (Task 4).
- Produces (`productModel.js`, named exports): `findAll()`, `findById(id)`, `findBySku(sku, excludeId = null)`, `create({name, sku, price, stock, category})`, `update(id, {name, sku, price, stock, category})`, `remove(id)`, `adjustStock(id, delta)` — plain SQLite row objects/`undefined`.
- Produces (`productService.js`, named exports): `listProducts()`, `getProduct(id)`, `createProduct(data)`, `updateProduct(id, data)`, `deleteProduct(id)`, `adjustStockManually(id, delta)`. Validates `price > 0` and `stock >= 0` → `AppError(400, 'VALIDATION_ERROR', ...)`; SKU collision on create or update (excluding the product's own id) → `AppError(409, 'DUPLICATE_SKU', 'El SKU ya existe')`; unknown id → `AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado')`.
- Produces (`productRoutes.js`, default export `Router`): `GET /`, `GET /:id` behind `verifyTokenMiddleware` only; `POST /`, `PUT /:id`, `DELETE /:id`, `PATCH /:id/stock` behind `verifyTokenMiddleware, requireRole('admin')`.

- [ ] **Step 1: Write the failing test**

```js
// facturacion-service/test/products.routes.test.js
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { resetDb } from './helpers/resetDb.js'

let adminToken, vendedorToken
before(() => {
  resetDb()
  seedUsers(db)
  adminToken = signToken({ id: 1, username: 'admin', role: 'admin' })
  vendedorToken = signToken({ id: 2, username: 'vendedor', role: 'vendedor' })
})

test('admin creates a product', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Mouse', sku: 'MOU-1', price: 50, stock: 10, category: 'Periféricos' })
  assert.equal(res.status, 201)
  assert.equal(res.body.sku, 'MOU-1')
})

test('creating a product with a duplicate sku returns 409', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Mouse 2', sku: 'MOU-1', price: 60, stock: 5 })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'DUPLICATE_SKU')
})

test('updating a product to an sku owned by another product returns 409', async () => {
  const other = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Teclado', sku: 'TEC-1', price: 100, stock: 5 })
  const res = await request(app).put(`/api/products/${other.body.id}`).set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Teclado', sku: 'MOU-1', price: 100, stock: 5 })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'DUPLICATE_SKU')
})

test('negative price is rejected with 400', async () => {
  const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Bad', sku: 'BAD-1', price: -5, stock: 1 })
  assert.equal(res.status, 400)
})

test('vendedor can list products but not create one', async () => {
  const list = await request(app).get('/api/products').set('Authorization', `Bearer ${vendedorToken}`)
  assert.equal(list.status, 200)
  const create = await request(app).post('/api/products').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ name: 'X', sku: 'X-1', price: 1, stock: 1 })
  assert.equal(create.status, 403)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd facturacion-service && node --test test/products.routes.test.js`
Expected: FAIL

- [ ] **Step 3: Implement model, service, controller, routes**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd facturacion-service && node --test test/products.routes.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add facturacion-service/src/models/productModel.js facturacion-service/src/services/productService.js facturacion-service/src/controllers/productController.js facturacion-service/src/routes/productRoutes.js facturacion-service/src/app.js facturacion-service/test/products.routes.test.js
git commit -m "feat: add products CRUD with admin-only mutations"
```

---

### Task 6: Frontend scaffold + API client

**Files:**
- Create: `frontend/` (Vite React scaffold — `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`)
- Create: `frontend/.env.example`
- Create: `frontend/src/App.jsx` (placeholder shell, replaced incrementally by later tasks)
- Create: `frontend/src/index.css` (Tailwind v4 directives)
- Create: `frontend/src/services/api.client.js`
- Create: `frontend/src/utils/formatCurrency.js`
- Create: `frontend/src/utils/formatDate.js`

**Interfaces:**
- Produces: `apiClient` (named export, `api.client.js`) — `axios.create({ baseURL: import.meta.env.VITE_API_URL })`; request interceptor attaches `Authorization: Bearer <token>` reading `token` from `localStorage.getItem('facturacion_auth')` (JSON-parsed, `.token` field — matches Task 7's storage shape); response error interceptor rejects with a plain `Error` whose `.code` and `.message` come from `error.response.data.error` (falls back to a generic message if the response has no body, e.g. network failure).
- Produces: `formatCurrency(amount: number) -> string` (e.g. `"Q 150.00"`), `formatDate(isoString: string) -> string` (e.g. `"30/09/2026"`).

- [ ] **Step 1: Scaffold the Vite app**

Run: `npm create vite@latest frontend -- --template react` then `cd frontend && npm install react-router-dom@7.18.2 axios tailwindcss @tailwindcss/vite`

- [ ] **Step 2: Wire Tailwind v4 into `vite.config.js` and `index.css`**

- [ ] **Step 3: Implement `api.client.js`, `formatCurrency.js`, `formatDate.js`**

- [ ] **Step 4: Verify the scaffold builds**

Run: `cd frontend && npm run build`
Expected: build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat: scaffold React frontend with Tailwind and API client"
```

---

### Task 7: Frontend auth (context, login page, protected routes)

**Files:**
- Create: `frontend/src/hooks/useAuth.js`
- Create: `frontend/src/services/auth.api.js`
- Create: `frontend/src/components/LoginForm.jsx`
- Create: `frontend/src/components/ErrorMessage.jsx`
- Create: `frontend/src/components/LoadingSpinner.jsx`
- Create: `frontend/src/components/ProtectedRoute.jsx`
- Create: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/App.jsx` — wrap in `AuthProvider`, add `react-router-dom` routes: `/login` (public), `/` (protected placeholder)

**Interfaces:**
- Consumes: `apiClient` (Task 6).
- Produces: `loginRequest(username, password)` (named export, `auth.api.js`) — `POST /auth/login`, returns `{ token, user }`.
- Produces: `AuthProvider` (named export, wraps the app) and `useAuth()` (named export, `useAuth.js`) — returns `{ user, token, isAuthenticated, login(username, password), logout() }`. `login` calls `loginRequest`, then persists `JSON.stringify({ token, user })` under `localStorage['facturacion_auth']`, and sets context state; `logout` clears both. On mount, `AuthProvider` hydrates state from `localStorage` if present.
- Produces: `ProtectedRoute` (default export) — props `{ roles?: string[] }`, wraps `react-router-dom`'s `<Outlet/>`; redirects to `/login` when `!isAuthenticated`, redirects to `/` when `roles` is given and `user.role` is not in it.

- [ ] **Step 1: Implement `useAuth.js`, `auth.api.js`**

- [ ] **Step 2: Implement `LoginForm`, `ErrorMessage`, `LoadingSpinner`, `LoginPage`, `ProtectedRoute`**

`LoginForm` calls `useAuth().login`, shows `ErrorMessage` on rejection (reads `err.message`), shows `LoadingSpinner` while the request is in flight, and navigates to `/` on success.

- [ ] **Step 3: Wire routes in `App.jsx`**

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: add login flow and protected routes"
```

---

### Task 8: E2E harness + auth tests (`test_auth.py`)

**Files:**
- Create: `tests/requirements.txt`
- Create: `tests/pytest.ini`
- Create: `tests/conftest.py`
- Create: `tests/test_auth.py`
- Create: `tests/.env.example`

**Interfaces:**
- Produces (`conftest.py`): constants `BASE_URL` (default `http://localhost:5173`), `ADMIN_USER = ("admin", "admin123")`, `VENDEDOR_USER = ("vendedor", "vendedor123")` — all overridable via env vars, defaults matching the Global Constraints seed credentials.
- Produces: `login(page, username, password)` (module-level helper function) — navigates to `BASE_URL + "/login"`, fills the form, submits, waits for navigation away from `/login`.
- Produces: `save_evidence(page, test_name: str, step_name: str) -> str` (module-level helper) — screenshots to `tests/evidence/{test_name}__{step_name}.png` (creates the directory if missing), returns the relative path; also appends that path to a module-level dict `_SCREENSHOTS: dict[str, list[str]]` keyed by `test_name` (`_SCREENSHOTS.setdefault(test_name, []).append(path)`) so the reporting hook below can read it without touching the Playwright `Page` object itself.
- Produces: a `pytest_runtest_makereport` hook in `conftest.py` that, on the `"call"` phase of every test, appends one JSON line to `tests/reports/results.json` (creating the file/dir if needed): `{"test_id": <item.nodeid>, "outcome": <"passed"|"failed">, "screenshots": <_SCREENSHOTS.get(item.name, [])>}` — `item.name` is the bare test function name, matching the `test_name` string each test passes to `save_evidence`. This file is `generate_report.py`'s (Task 16) only input for pass/fail and images — pin the schema exactly as written here.
- `tests/pytest.ini` sets `--video=on` is passed on the CLI (documented in `tests/requirements.txt`'s companion README note), and registers the `evidence`/`reports`/`videos` output directories.

- [ ] **Step 1: Write `tests/requirements.txt`**

`playwright`, `pytest-playwright`, `pytest-html`, `python-pptx`.

- [ ] **Step 2: Install and set up browsers**

Run: `cd tests && pip install -r requirements.txt && playwright install chromium`

- [ ] **Step 3: Implement `conftest.py`** (helpers and hook as specified in Interfaces)

- [ ] **Step 4: Write `test_auth.py`**

```python
# tests/test_auth.py
from conftest import login, save_evidence, ADMIN_USER, VENDEDOR_USER, BASE_URL

def test_admin_login_success(page):
    username, password = ADMIN_USER
    login(page, username, password)
    save_evidence(page, "test_admin_login_success", "01_dashboard")
    assert page.url != f"{BASE_URL}/login"

def test_vendedor_login_success(page):
    username, password = VENDEDOR_USER
    login(page, username, password)
    save_evidence(page, "test_vendedor_login_success", "01_dashboard")
    assert page.url != f"{BASE_URL}/login"

def test_invalid_credentials_rejected(page):
    page.goto(f"{BASE_URL}/login")
    page.get_by_label("Usuario").fill("admin")
    page.get_by_label("Contraseña").fill("wrong-password")
    page.get_by_role("button", name="Ingresar").click()
    save_evidence(page, "test_invalid_credentials_rejected", "01_error")
    assert page.url == f"{BASE_URL}/login"
    assert page.get_by_text("incorrect", exact=False).is_visible() or page.get_by_text("incorrecta", exact=False).is_visible()
```

(Selectors like `get_by_label("Usuario")` assume `LoginForm` uses those exact visible labels — the implementer sets the labels in Task 7 to match, or adjusts the selectors here to whatever labels Task 7 actually used; keep them in sync.)

- [ ] **Step 5: Run the suite (requires both servers running — see below) and verify it passes**

Run: `facturacion-service` (`npm run dev`) and `frontend` (`npm run dev`) in separate terminals, then:
Run: `cd tests && pytest test_auth.py --video=on --html=reports/report.html -v`
Expected: 3 passed; `tests/evidence/`, `tests/videos/`, `tests/reports/report.html`, `tests/reports/results.json` all populated

- [ ] **Step 6: Commit**

```bash
git add tests/requirements.txt tests/pytest.ini tests/conftest.py tests/test_auth.py tests/.env.example
git commit -m "test: add E2E harness and auth flow tests"
```

---

### Task 9: Frontend Products page

**Files:**
- Create: `frontend/src/services/products.api.js`
- Create: `frontend/src/hooks/useProducts.js`
- Create: `frontend/src/components/ProductForm.jsx`
- Create: `frontend/src/components/ProductList.jsx`
- Create: `frontend/src/components/StockBadge.jsx`
- Create: `frontend/src/pages/ProductsPage.jsx`
- Modify: `frontend/src/App.jsx` — add `/products` route behind `<ProtectedRoute roles={['admin']}>`

**Interfaces:**
- Consumes: `apiClient` (Task 6), `ProtectedRoute` (Task 7).
- Produces: `products.api.js` named exports mirroring the backend routes from Task 5: `listProducts()`, `createProduct(data)`, `updateProduct(id, data)`, `deleteProduct(id)`, `adjustStock(id, delta)`.
- Produces: `useProducts()` (named export, `useProducts.js`) — `{ products, loading, error, reload, create, update, remove, adjustStock }`.
- `StockBadge` renders red/"Sin stock" when `stock === 0`, otherwise the numeric stock.

- [ ] **Step 1: Implement `products.api.js`, `useProducts.js`**

- [ ] **Step 2: Implement `ProductForm`, `ProductList`, `StockBadge`, `ProductsPage`**

`ProductForm` surfaces `err.code === 'DUPLICATE_SKU'` as a specific inline message next to the SKU field (not just the generic `ErrorMessage`).

- [ ] **Step 3: Wire the `/products` route in `App.jsx`**

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: add products management page (admin)"
```

---

### Task 10: E2E products tests (`test_products.py`)

**Files:**
- Create: `tests/test_products.py`

**Interfaces:**
- Consumes: `login`, `save_evidence`, `ADMIN_USER`, `VENDEDOR_USER`, `BASE_URL` (Task 8).

- [ ] **Step 1: Write `test_products.py`**

Scenarios: admin creates a product via the UI and sees it in the list (screenshot after creation); admin edits a product's price and sees the updated value; admin deletes a product and it disappears from the list; vendedor logs in and navigating to `/products` redirects away (asserts the vendedor never sees the admin-only page).

- [ ] **Step 2: Run and verify**

Run: (both servers running) `cd tests && pytest test_products.py --video=on --html=reports/report.html -v`
Expected: all scenarios pass

- [ ] **Step 3: Commit**

```bash
git add tests/test_products.py
git commit -m "test: add E2E product management tests"
```

---

### Task 11: Backend invoice creation (atomic stock deduction, IVA)

**Files:**
- Create: `facturacion-service/src/models/invoiceModel.js`
- Create: `facturacion-service/src/services/invoiceService.js`
- Create: `facturacion-service/src/controllers/invoiceController.js`
- Create: `facturacion-service/src/routes/invoiceRoutes.js`
- Modify: `facturacion-service/src/app.js` — mount `invoiceRoutes` at `/api/invoices`
- Test: `facturacion-service/test/invoices.create.test.js`

**Interfaces:**
- Consumes: `db`, `AppError` (Task 1), `verifyTokenMiddleware` (Task 4), `productModel.findById(id)` and `productModel.adjustStock(id, delta)` (Task 5 — reused directly inside the transaction for stock reads and the stock decrement; do not reimplement product row access here).
- Produces (`invoiceModel.js`, named exports): `createInvoiceWithItems({customer_name, customer_nit, items, userId})` — the `db.transaction(...)`-wrapped insert (see Step 3 algorithm below); `findAll()`; `findAllByUser(userId)`; `findById(id)` (returns the invoice row plus its `items` array, or `undefined` — note this is `invoiceModel.findById`, distinct from `productModel.findById` used inside the transaction).
- Produces (`invoiceService.js`, named export): `createInvoice({customer_name, customer_nit, items, userId})` — validates `items.length > 0` (else `AppError(400, 'EMPTY_INVOICE', 'La factura debe tener al menos un producto')`), each `item.quantity > 0` and `item.product_id` exists (else `AppError(400, 'INVALID_QUANTITY', ...)` / `AppError(404, 'PRODUCT_NOT_FOUND', ...)`), defaults `customer_nit` to `'CF'` when falsy, then delegates to `createInvoiceWithItems`; returns the created invoice with computed `subtotal`, `tax`, `total`, and its `items`.
- Produces (`invoiceRoutes.js`, default export `Router`): `POST /` behind `verifyTokenMiddleware` only (both roles may create invoices).

- [ ] **Step 1: Write the failing test**

```js
// facturacion-service/test/invoices.create.test.js
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { create as createProduct } from '../src/models/productModel.js'
import { resetDb } from './helpers/resetDb.js'

let vendedorToken, product
before(() => {
  resetDb()
  const [, vendedor] = seedUsers(db) // FK-safe: sign the token with the real seeded id, not a literal
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
  product = createProduct({ name: 'Monitor', sku: 'MON-1', price: 100, stock: 5, category: null })
})

test('creates an invoice, computes 12% IVA, and decrements stock', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'Juan Pérez', items: [{ product_id: product.id, quantity: 2 }] })
  assert.equal(res.status, 201)
  assert.equal(res.body.subtotal, 200)
  assert.equal(res.body.tax, 24)
  assert.equal(res.body.total, 224)
  assert.match(res.body.invoice_number, /^FAC-\d{6}$/)
  assert.equal(res.body.customer_nit, 'CF')
})

test('insufficient stock is rejected and nothing is mutated', async () => {
  const before = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id)
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: product.id, quantity: 999 }] })
  assert.equal(res.status, 409)
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK')
  const after = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id)
  assert.equal(before.stock, after.stock)
})

test('an item referencing an unknown product is rejected', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: 999999, quantity: 1 }] })
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND')
})

test('a zero or negative quantity is rejected', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [{ product_id: product.id, quantity: 0 }] })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'INVALID_QUANTITY')
})

test('an empty items array is rejected', async () => {
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'X', items: [] })
  assert.equal(res.status, 400)
  assert.equal(res.body.error.code, 'EMPTY_INVOICE')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd facturacion-service && node --test test/invoices.create.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `invoiceModel.js` and `invoiceService.js`**

Transaction algorithm for `createInvoiceWithItems` (the non-obvious part — get this exact ordering right, since it's what makes the operation atomic):

```js
import { findById as findProductById, adjustStock } from './productModel.js'

const run = db.transaction(({ customer_name, customer_nit, items, userId }) => {
  // 1. Validate every line FIRST, before mutating anything — unknown product,
  //    then insufficient stock (checked in that order, per item).
  const products = items.map((item) => {
    const product = findProductById(item.product_id)
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado')
    if (product.stock < item.quantity) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Stock insuficiente para ${product.name}`)
    }
    return product
  })
  // 2. Only after every line is validated: compute totals, insert invoice + items, decrement stock.
  const invoiceNumber = nextInvoiceNumber() // `SELECT COALESCE(MAX(id),0)+1 AS next FROM invoices`, formatted 'FAC-' + String(next).padStart(6,'0')
  const { subtotal, tax, total } = computeTotals(items, products) // subtotal = sum(qty*unit_price); tax = subtotal*0.12; total = subtotal+tax
  const invoiceId = insertInvoice({ invoice_number: invoiceNumber, customer_name, customer_nit, subtotal, tax, total, created_by: userId })
  items.forEach((item, i) => {
    insertInvoiceItem(invoiceId, { product_id: item.product_id, product_name: products[i].name, quantity: item.quantity, unit_price: products[i].price, line_total: item.quantity * products[i].price })
    adjustStock(item.product_id, -item.quantity)
  })
  return findById(invoiceId)
})
```

`findProductById`/`adjustStock` are `productModel.js`'s existing `findById`/`adjustStock` (Task 5), imported and reused as-is — not reimplemented here. `insertInvoice`, `insertInvoiceItem`, `nextInvoiceNumber`, `computeTotals`, and the bare `findById` at the end are local to `invoiceModel.js`. `better-sqlite3`'s `db.transaction()` wrapper rolls back automatically when the wrapped function throws — running on the same shared `db` connection, `adjustStock`'s own `db.prepare(...).run(...)` falls inside this same transaction even though it's defined in another module — that's what guarantees "nothing mutated" in the insufficient-stock test.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd facturacion-service && node --test test/invoices.create.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add facturacion-service/src/models/invoiceModel.js facturacion-service/src/services/invoiceService.js facturacion-service/src/controllers/invoiceController.js facturacion-service/src/routes/invoiceRoutes.js facturacion-service/src/app.js facturacion-service/test/invoices.create.test.js
git commit -m "feat: add atomic invoice creation with IVA and stock deduction"
```

---

### Task 12: Backend invoice listing/detail (role-scoped)

**Files:**
- Modify: `facturacion-service/src/services/invoiceService.js` — add `listInvoices(user)`, `getInvoice(id, user)`
- Modify: `facturacion-service/src/controllers/invoiceController.js` — add list/detail handlers
- Modify: `facturacion-service/src/routes/invoiceRoutes.js` — add `GET /`, `GET /:id`
- Test: `facturacion-service/test/invoices.list.test.js`

**Interfaces:**
- Consumes: `invoiceModel.findAll`/`findAllByUser`/`findById` (Task 11).
- Produces: `listInvoices(user: {id, role})` — returns `invoiceModel.findAll()` when `role === 'admin'`, else `invoiceModel.findAllByUser(user.id)`.
- Produces: `getInvoice(id, user)` — throws `AppError(404, 'NOT_FOUND', 'Factura no encontrada')` both when the invoice doesn't exist **and** when `user.role !== 'admin' && invoice.created_by !== user.id` (same code/message either way — a vendedor must not be able to distinguish "doesn't exist" from "not yours").

- [ ] **Step 1: Write the failing test**

```js
// facturacion-service/test/invoices.list.test.js
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import db from '../src/database/connection.js'
import { seedUsers } from '../src/database/seed.js'
import { signToken } from '../src/utils/jwt.js'
import { create as createProduct } from '../src/models/productModel.js'
import { resetDb } from './helpers/resetDb.js'

let adminToken, vendedorToken, otherVendedorToken, vendedorInvoiceId
before(async () => {
  resetDb()
  const [admin, vendedor] = seedUsers(db)
  adminToken = signToken({ id: admin.id, username: admin.username, role: admin.role })
  // FK-safe: this token creates an invoice below, so it must carry a real seeded id.
  vendedorToken = signToken({ id: vendedor.id, username: vendedor.username, role: vendedor.role })
  // otherVendedorToken is never used to insert anything (GET requests only), so an
  // id with no matching users row is fine — it only has to differ from vendedor.id.
  otherVendedorToken = signToken({ id: vendedor.id + 1000, username: 'vendedor2', role: 'vendedor' })
  const product = createProduct({ name: 'Cable', sku: 'CAB-1', price: 10, stock: 100, category: null })
  const res = await request(app).post('/api/invoices').set('Authorization', `Bearer ${vendedorToken}`)
    .send({ customer_name: 'Ana', items: [{ product_id: product.id, quantity: 1 }] })
  vendedorInvoiceId = res.body.id
})

test('admin sees all invoices', async () => {
  const res = await request(app).get('/api/invoices').set('Authorization', `Bearer ${adminToken}`)
  assert.ok(res.body.some((inv) => inv.id === vendedorInvoiceId))
})

test('vendedor sees only their own invoices', async () => {
  const res = await request(app).get('/api/invoices').set('Authorization', `Bearer ${otherVendedorToken}`)
  assert.ok(!res.body.some((inv) => inv.id === vendedorInvoiceId))
})

test('a vendedor cannot fetch another vendedor\'s invoice by id', async () => {
  const res = await request(app).get(`/api/invoices/${vendedorInvoiceId}`).set('Authorization', `Bearer ${otherVendedorToken}`)
  assert.equal(res.status, 404)
  assert.equal(res.body.error.code, 'NOT_FOUND')
})

test('the owning vendedor can fetch their own invoice by id', async () => {
  const res = await request(app).get(`/api/invoices/${vendedorInvoiceId}`).set('Authorization', `Bearer ${vendedorToken}`)
  assert.equal(res.status, 200)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd facturacion-service && node --test test/invoices.list.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `listInvoices`, `getInvoice`, and the two routes**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd facturacion-service && node --test test/invoices.list.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add facturacion-service/src/services/invoiceService.js facturacion-service/src/controllers/invoiceController.js facturacion-service/src/routes/invoiceRoutes.js facturacion-service/test/invoices.list.test.js
git commit -m "feat: add role-scoped invoice listing and detail"
```

---

### Task 13: Frontend invoice creation page

**Files:**
- Create: `frontend/src/services/invoices.api.js`
- Create: `frontend/src/components/InvoiceItemRow.jsx`
- Create: `frontend/src/components/InvoiceForm.jsx`
- Create: `frontend/src/pages/NewInvoicePage.jsx`
- Modify: `frontend/src/App.jsx` — add `/invoices/new` route behind `<ProtectedRoute>` (no `roles` restriction — both roles)

**Interfaces:**
- Consumes: `apiClient` (Task 6), `useProducts` (Task 9), `formatCurrency` (Task 6).
- Produces: `invoices.api.js` named exports: `listInvoices()`, `getInvoice(id)`, `createInvoice(data)`.
- `InvoiceForm` holds a client-side cart (`{product_id, quantity}[]`), mirrors the backend's `subtotal/tax(12%)/total` formula for live display, and **disables the submit button whenever the cart is empty** (client-side enforcement of the `EMPTY_INVOICE` rule from Task 11) and whenever any line's quantity exceeds that product's known `stock`.

- [ ] **Step 1: Implement `invoices.api.js`**

- [ ] **Step 2: Implement `InvoiceItemRow`, `InvoiceForm`, `NewInvoicePage`**

On submit, `InvoiceForm` still surfaces a backend `INSUFFICIENT_STOCK` or `EMPTY_INVOICE` error via `ErrorMessage` (the client-side guard is UX, not a substitute for the backend check).

- [ ] **Step 3: Wire the `/invoices/new` route**

- [ ] **Step 4: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: add invoice creation page"
```

---

### Task 14: Frontend invoice history page

**Files:**
- Create: `frontend/src/components/InvoiceList.jsx`
- Create: `frontend/src/pages/InvoiceHistoryPage.jsx`
- Modify: `frontend/src/App.jsx` — add `/invoices` route behind `<ProtectedRoute>`

**Interfaces:**
- Consumes: `invoices.api.js` (Task 13), `formatCurrency`/`formatDate` (Task 6).
- `InvoiceList` renders whatever `listInvoices()` returns as-is (the backend already scopes by role per Task 12) — the frontend performs no additional filtering.

- [ ] **Step 1: Implement `InvoiceList`, `InvoiceHistoryPage`**

- [ ] **Step 2: Wire the `/invoices` route**

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "feat: add invoice history page"
```

---

### Task 15: E2E invoice and stock-limit tests

**Files:**
- Create: `tests/test_invoices.py`
- Create: `tests/test_stock_limits.py`

**Interfaces:**
- Consumes: `login`, `save_evidence`, `ADMIN_USER`, `VENDEDOR_USER`, `BASE_URL` (Task 8).

- [ ] **Step 1: Write `tests/test_invoices.py`**

Scenarios: vendedor creates a product-having-stock invoice, screenshots the displayed subtotal/IVA/total and asserts `total == subtotal * 1.12` (parsed from the page); after confirming, admin opens the products page and asserts the stock decreased by the invoiced quantity; vendedor's own invoice appears in their `/invoices` history; a second vendedor's invoice does **not** appear in the first vendedor's history; admin's `/invoices` history shows invoices from both vendedores; on `/invoices/new` with no items added, assert the submit button is disabled (Task 13's client-side `EMPTY_INVOICE` guard), add one item, and assert it becomes enabled.

- [ ] **Step 2: Write `tests/test_stock_limits.py`**

Scenario: attempt to add more quantity than available stock to the invoice form and assert the submit control is disabled (client guard from Task 13) OR, if a case is constructed that bypasses the client guard (e.g. two browser tabs racing the same low-stock item), assert the backend's `INSUFFICIENT_STOCK` message is surfaced and the product's stock is unchanged afterward (cross-check via the products page).

- [ ] **Step 3: Run both files and verify**

Run: (both servers running) `cd tests && pytest test_invoices.py test_stock_limits.py --video=on --html=reports/report.html -v`
Expected: all scenarios pass

- [ ] **Step 4: Run the full suite**

Run: `cd tests && pytest --video=on --html=reports/report.html -v`
Expected: all tests across `test_auth.py`, `test_products.py`, `test_invoices.py`, `test_stock_limits.py` pass; `tests/reports/results.json` has one entry per test

- [ ] **Step 5: Commit**

```bash
git add tests/test_invoices.py tests/test_stock_limits.py
git commit -m "test: add E2E invoicing and stock-limit tests"
```

---

### Task 16: PPTX evidence generator

**Files:**
- Create: `tests/generate_report.py`

**Interfaces:**
- Consumes: `tests/reports/results.json` (Task 8's schema), the 4 test files' source (Tasks 8/10/15) for the closing code slides.
- Produces: `main()` — reads `tests/reports/results.json` (one JSON object per line), groups entries by the test file portion of `test_id`, and writes `tests/reports/evidencia.pptx` via `python-pptx`:
  1. A title slide ("Evidencias de QA — Sistema de Facturación", date).
  2. One slide per test (in the order encountered in `results.json`): title = test name, each screenshot in that test's `screenshots` list placed on the slide, and a colored "PASÓ"/"FALLÓ" label driven by `outcome`.
  3. Closing slides with the validated test code: for each of `test_auth.py`, `test_products.py`, `test_invoices.py`, `test_stock_limits.py`, parse the file with the `ast` module, and for every top-level `def test_...` function add one slide titled with the function name and a monospace textbox containing `ast.get_source_segment(source, function_node)`.

- [ ] **Step 1: Implement `main()` in `generate_report.py`**

- [ ] **Step 2: Run it against the results from Task 15's full suite run**

Run: `cd tests && python generate_report.py`
Expected: `tests/reports/evidencia.pptx` created

- [ ] **Step 3: Verify the slide count**

Run: `cd tests && python -c "from pptx import Presentation; print(len(Presentation('reports/evidencia.pptx').slides))"`
Expected: slide count equals `1 (title) + number of test entries in results.json + number of test_ functions across the 4 files`

- [ ] **Step 4: Commit**

```bash
git add tests/generate_report.py
git commit -m "feat: generate PPTX QA evidence deck from test results"
```

---

### Task 17: Project documentation

**Files:**
- Create: `docs/README.md`
- Create: `docs/01-documentacion-tecnica.md`
- Create: `docs/02-manual-instalacion.md`
- Create: `docs/03-manual-usuario.md`
- Create: `docs/04-guion-exposicion.md`
- Modify: project root — add a top-level `README.md` summarizing the app, mirroring FinanzasGT's root README structure (architecture table, stack, how to run each part, link into `docs/`)

**Interfaces:**
- None — these are prose deliverables, not code other tasks depend on.

- [ ] **Step 1: Write `docs/01-documentacion-tecnica.md`**

Architecture, data model, API endpoints, roles/permissions — sourced from the spec's equivalent sections, updated to reflect anything the implementation settled that the spec left open (e.g. exact validation messages).

- [ ] **Step 2: Write `docs/02-manual-instalacion.md`**

Prerequisites (Node, Python, `playwright install`), env var setup for all three parts (`facturacion-service/.env`, `frontend/.env`, `tests/.env`), seed command, run commands for each service, and the single test-suite command from Task 15/16.

- [ ] **Step 3: Write `docs/03-manual-usuario.md`**

Walkthrough per role: admin managing products/inventory, both roles generating an invoice, viewing invoice history.

- [ ] **Step 4: Write `docs/04-guion-exposicion.md` and the root `README.md`**

- [ ] **Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: add technical, installation, user, and exposition documentation"
```
