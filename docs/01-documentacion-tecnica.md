# Documentación Técnica — Sistema de Facturación e Inventario

## 1. Introducción

Aplicación web para gestionar un catálogo de productos, llevar control de
inventario, y generar facturas de venta que descuentan stock
automáticamente al momento de facturar. Las facturas pueden pagarse en
Quetzales o en dólares, con conversión a la tasa de cambio real del día.
Proyecto de Análisis de Sistemas II (UMG, 8vo. semestre), con el mismo
patrón de capas y manejo de errores que `FinanzasGT` (proyecto de
referencia del primer parcial), y con el dominio de negocio (productos,
inventario, facturas) en un solo backend en lugar de microservicios — la
única excepción es un segundo servicio, `exchange-service`, reutilizado
tal cual de `FinanzasGT` para el tipo de cambio real (ver sección 6).

## 2. Objetivo general

Demostrar, además de software funcional, un pipeline de QA automatizado
completo: pruebas E2E con Playwright, reporte HTML, video por prueba, y una
presentación PowerPoint generada automáticamente con las evidencias.

## 3. Objetivos específicos

- Permitir a un administrador mantener el catálogo de productos y su stock.
- Permitir a administrador y vendedor generar facturas, calculando IVA
  (12%) y descontando stock de forma atómica.
- Bloquear la venta cuando no hay stock suficiente, sin modificar el
  inventario.
- Autenticar usuarios con JWT y dos roles (`admin`, `vendedor`).
- Mostrar el historial de facturas, acotado por rol (el admin ve todas, el
  vendedor solo las propias).
- Automatizar la ejecución de la batería de pruebas E2E y la generación de
  evidencias (reporte HTML + `.pptx`) con un solo comando.

## 4. Alcance

**Dentro de alcance:** CRUD de productos e inventario; generación de
facturas con IVA; descuento atómico de stock; login con dos roles vía JWT;
historial de facturas acotado por rol; pago de facturas en Quetzales o en
dólares, con conversión a la tasa de cambio real del día consumida de
`exchange-service`; suite de pruebas E2E (Python + Playwright) con video,
reporte HTML y PPTX; documentación del proyecto.

**Fuera de alcance (explícito):** facturación electrónica real (FEL/SAT);
múltiples sucursales/bodegas; reportes financieros avanzados o dashboards
analíticos; recuperación de contraseña o registro público de usuarios (los
usuarios se crean con un script de seed); notificaciones; cambiar los
precios base de los productos (siguen siempre en Quetzales); conversión a
dólares por línea de producto (la conversión aplica solo al total de la
factura); historial propio de tasas de cambio (se usa la tasa del día que
devuelve `exchange-service`, que internamente la cachea 1 hora); modificar
`exchange-service` (se reutiliza tal cual de `FinanzasGT`); monedas
distintas de GTQ/USD.

## 5. Tecnologías utilizadas

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite 8, React Router 7 (`react-router-dom@7.18.2`), Axios, Tailwind CSS v4 |
| Backend | Node.js, Express 5, `better-sqlite3`, `bcrypt`, `jsonwebtoken`, `cors`, `dotenv`, `nodemon` (dev) |
| `exchange-service` | Node.js, Express 5, `axios`, `xml2js` (parseo del SOAP de Banguat), `cors`, `dotenv`, `nodemon` (dev) — reutilizado sin cambios de `FinanzasGT` |
| Base de datos | SQLite (archivo único, vía `better-sqlite3`) |
| Pruebas E2E | Python, `pytest`, `pytest-playwright`, `pytest-html`, `python-pptx` |

## 6. Arquitectura del sistema

### 6.1 Diagrama de arquitectura

El dominio de negocio (productos, inventario, facturas) sigue viviendo en
**un solo backend**, `facturacion-service`: a diferencia de `FinanzasGT`,
no hay una integración externa que justifique dividir ese dominio en
varios servicios. La única excepción es el tipo de cambio: facturar en
dólares requiere la tasa real del Banco de Guatemala, y ese SOAP solo
puede ser consumido por un componente (mismo principio que en
`FinanzasGT`). Por eso `exchange-service` — reutilizado tal cual de
`FinanzasGT`, sin cambios de lógica — corre como un segundo proceso HTTP
independiente, consumido únicamente por `facturacion-service`.

```
┌──────────────┐  HTTP/JSON   ┌───────────────────────┐  HTTP/JSON   ┌────────────────────┐   SOAP   ┌───────────────┐
│   frontend    │─────────────▶│  facturacion-service  │─────────────▶│  exchange-service   │─────────▶│    Banguat    │
│ React + Vite  │◀─────────────│   Node + Express 5    │◀─────────────│   Node + Express 5   │◀─────────│ (SOAP externo)│
│   (5173)      │ {error:{…}}  │        (3001)          │ {rate, date}  │       (3002)         │          │               │
└──────────────┘               └───────────┬───────────┘               └────────────────────┘          └───────────────┘
                                             │ better-sqlite3
                                             ▼
                                   facturacion.db (SQLite)
```

### 6.2 Responsabilidad de cada componente

- **`frontend`:** UI en React. Consume `facturacion-service` vía HTTP/JSON
  usando Axios, con un interceptor que adjunta el JWT y normaliza errores.
  Nunca llama a `exchange-service` directamente: solo envía
  `payment_currency` al crear la factura.
- **`facturacion-service`:** único backend del dominio de negocio. Expone
  la API REST, valida reglas de negocio, calcula IVA, persiste en SQLite
  dentro de transacciones cuando una operación toca varias tablas (crear
  factura), y es el **único componente de este proyecto autorizado a
  llamar a `exchange-service`** — lo hace vía `src/clients/exchangeClient.js`
  cuando una factura se crea con `payment_currency: 'USD'`.
- **`exchange-service`:** reutilizado sin cambios del proyecto
  `FinanzasGT` (primer parcial). Es el **único componente de todo el
  proyecto autorizado a hablar con el SOAP del Banco de Guatemala**
  (`BANGUAT_SERVICE_URL`); expone la tasa del día, cacheada 1 hora, vía
  `GET /api/exchange-rate/today` → `{ rate, date }`.

### 6.3 Diagrama de comunicación (protocolos)

El frontend nunca habla directamente con SQLite ni con `exchange-service`;
todo pasa por `facturacion-service` vía HTTP/JSON. Las rutas protegidas
requieren un header `Authorization: Bearer <token>`; las que además exigen
rol (`admin`) pasan primero por el middleware de autenticación y luego por
el de autorización.

Cuando `POST /api/invoices` se llama con `payment_currency: 'USD'`,
`facturacion-service` primero hace `GET /api/exchange-rate/today` contra
`exchange-service` (HTTP, con timeout de 5s) **antes** de abrir la
transacción SQLite — `better-sqlite3`'s `db.transaction()` exige una
función completamente síncrona, y esa llamada de red es asíncrona, así que
no puede ocurrir dentro de la transacción atómica existente. Si la llamada
falla, no se abre ninguna transacción y no se escribe nada (ver sección 10
para el detalle del orden de ejecución).

## 7. Estructura del proyecto

```
Proyecto de facturación/
├── frontend/                # React 19 + Vite + React Router + Axios + Tailwind CSS v4
├── facturacion-service/     # Node.js + Express 5
├── exchange-service/        # Node.js + Express 5 — reutilizado de FinanzasGT, puerto 3002
├── tests/                   # Python + pytest-playwright (E2E)
└── docs/                    # esta documentación
```

### 7.1 Estructura real de `facturacion-service/src/`

```
src/
├── app.js                 # configuración de Express, montaje de rutas y middlewares
├── config/env.js          # lectura y defaults de variables de entorno
├── clients/                 exchangeClient.js (HTTP a exchange-service; ver nota abajo)
├── routes/                 authRoutes.js, productRoutes.js, invoiceRoutes.js
├── controllers/             authController.js, productController.js, invoiceController.js
├── services/                authService.js, productService.js, invoiceService.js
├── models/                   productModel.js, invoiceModel.js (queries SQLite)
├── middlewares/              auth.js (JWT), authorize.js (rol), errorHandler.js, notFoundHandler.js
├── database/                 schema.js, connection.js, seed.js
└── utils/                    AppError.js, jwt.js
```

Capas: `routes` (definición de endpoints) → `controllers` (parseo de
request/response) → `services` (validación y lógica de negocio) →
`models` (queries SQLite) → `middlewares` (auth JWT, autorización por rol,
errores centralizados).

> **Nota de implementación — `exchangeClient.js`:** a diferencia del resto
> de variables de entorno (leídas una sola vez en `config/env.js` al
> arrancar), `exchangeClient.js` lee `process.env.EXCHANGE_SERVICE_URL`
> directamente dentro de `getTodayRate()`, en cada llamada — no a través
> de `config/env.js`. Es una decisión deliberada de testabilidad: las
> pruebas de backend (`node --test`) pueden apuntar esa variable a un
> servicio-stub local, por prueba, sin reiniciar el proceso ni recargar
> ningún módulo de configuración cacheado.

### 7.2 Estructura real de `frontend/src/`

```
src/
├── components/   ErrorMessage, LoadingSpinner, LoginForm, ProductForm,
│                 ProductList, StockBadge, InvoiceForm, InvoiceItemRow,
│                 InvoiceList, ProtectedRoute, Navbar
├── pages/        LoginPage, ProductsPage (admin), NewInvoicePage, InvoiceHistoryPage,
│                 InvoiceDetailPage
├── services/     api.client.js (Axios + interceptor JWT + normalización de errores),
│                 auth.api.js, products.api.js, invoices.api.js
├── hooks/        useAuth.js (sesión/rol, contexto), useProducts.js (CRUD + estado)
└── utils/        formatCurrency.js (Q), formatDate.js
```

Rutas (definidas en `App.jsx`):

| Ruta | Acceso | Página |
|---|---|---|
| `/login` | público | `LoginPage` |
| `/` | autenticado | página principal (placeholder, sin menú) |
| `/invoices/new` | autenticado (admin, vendedor) | `NewInvoicePage` |
| `/invoices` | autenticado (admin, vendedor) | `InvoiceHistoryPage` |
| `/invoices/:id` | autenticado (admin, vendedor — solo las propias) | `InvoiceDetailPage` |
| `/products` | autenticado, rol `admin` | `ProductsPage` |

`ProtectedRoute` redirige a `/login` si no hay sesión, y a `/` si el rol no
tiene acceso a la ruta (p. ej. un vendedor navegando a `/products`).

> **Nota de implementación:** la aplicación sí tiene una barra de
> navegación (`Navbar`, montada una vez que hay sesión) con enlaces a
> Inicio, Nueva factura e Historial, más Productos solo si el rol es
> `admin`; a la derecha muestra el usuario y rol con sesión activa
> (`{username} ({role})`) y un botón **Cerrar sesión** que limpia la
> sesión y redirige a `/login`. Ver el
> [manual de usuario](03-manual-usuario.md) para el detalle.

## 8. Modelo de datos (SQLite)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'vendedor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  price REAL NOT NULL CHECK (price > 0),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_nit TEXT NOT NULL DEFAULT 'CF',
  subtotal REAL NOT NULL,
  tax REAL NOT NULL,
  total REAL NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,     -- snapshot al momento de facturar
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);
```

`invoice_items.product_name` y `unit_price` guardan una copia del producto
al momento de la venta, para que el historial no cambie si el producto se
renombra o cambia de precio después.

**Pago en dólares — columnas agregadas a `invoices`:** el `CREATE TABLE`
de `invoices` arriba es el original; `schema.js` le agrega estas 3
columnas con `ALTER TABLE` (no se recreó la tabla):

```sql
ALTER TABLE invoices ADD COLUMN payment_currency TEXT NOT NULL DEFAULT 'GTQ' CHECK (payment_currency IN ('GTQ', 'USD'));
ALTER TABLE invoices ADD COLUMN exchange_rate REAL;
ALTER TABLE invoices ADD COLUMN total_usd REAL;
```

`exchange_rate` y `total_usd` quedan `NULL` cuando `payment_currency` es
`'GTQ'` (el default). `subtotal`, `tax` y `total` siguen siendo siempre
los montos en Quetzales — nunca se recalculan ni se sobrescriben en
dólares, con o sin pago en USD.

**Idempotencia de la migración:** SQLite no soporta
`ADD COLUMN IF NOT EXISTS`, así que `schema.js` comprueba con
`PRAGMA table_info(invoices)` si cada columna ya existe antes de intentar
agregarla, y solo ejecuta el `ALTER TABLE` correspondiente si falta. Esto
mantiene a `schema.js` seguro de ejecutar en cada arranque, igual que el
resto del esquema (que ya usa `CREATE TABLE IF NOT EXISTS`).

Al listar facturas (`GET /api/invoices`), el backend hace `JOIN` con
`users` y agrega `created_by_username` a cada fila (el campo `created_by`
original, con el id numérico, se conserva también). Esto no estaba en el
diseño original — se agregó para que el historial muestre el nombre del
vendedor en vez de solo su id.

## 9. Roles y permisos

| Acción | Admin | Vendedor |
|---|---|---|
| Ver productos/stock | ✅ | ✅ |
| Crear/editar/eliminar productos | ✅ | ❌ |
| Ajustar stock manualmente (`PATCH /api/products/:id/stock`) | ✅ | ❌ |
| Generar factura | ✅ | ✅ |
| Ver historial de facturas | ✅ (todas) | ✅ (solo propias) |

## 10. Reglas de negocio clave

- **IVA:** 12% fijo sobre el subtotal. `total = subtotal + (subtotal * 0.12)`.
- **Redondeo:** `subtotal`, `tax` y `total` se redondean a 2 decimales
  (`Math.round(valor * 100) / 100`) antes de guardarse. Esto no estaba
  explícito en el diseño original; se agregó durante la implementación
  para evitar los residuos de coma flotante típicos de `0.1 + 0.2` en
  JavaScript.
- **Descuento de stock:** al confirmar una factura, la validación de cada
  línea, la creación de la factura, y el descuento de stock ocurren en
  **una sola transacción SQLite** (`db.transaction(...)` de
  `better-sqlite3`). Si cualquier línea no tiene stock suficiente, toda la
  operación se revierte: no se crea la factura ni se modifica el
  inventario.
- **Validación por cantidad agregada:** el stock se valida contra la
  cantidad **total pedida por `product_id`**, sumando todas las líneas de
  esa factura que repitan el mismo producto — no cada línea de forma
  aislada. Así, una misma factura no puede "burlar" el chequeo repitiendo
  el mismo producto en varias líneas con cantidades individualmente
  pequeñas pero cuya suma excede el stock disponible.
- **Cantidad entera:** `quantity` debe ser un número entero mayor que 0
  (`Number.isInteger`). Un valor no entero o ≤ 0 se rechaza con
  `INVALID_QUANTITY`. Esta validación no estaba en el diseño original.
- **Nombre del cliente obligatorio:** `customer_name` es requerido (no
  puede ser vacío ni solo espacios); si falta, se rechaza con
  `VALIDATION_ERROR` — `"El nombre del cliente es requerido"`. Tampoco
  estaba en el diseño original.
- **Consumidor final:** si no se ingresa NIT, se guarda `"CF"`.
- **Numeración de factura:** `invoice_number` se genera en el backend como
  correlativo con prefijo, formato `FAC-000001` (6 dígitos), calculado
  dentro de la misma transacción a partir de `MAX(id) + 1` en `invoices`
  (evita colisiones y no depende del reloj del cliente).
- **Snapshot de precios:** `invoice_items` guarda `unit_price` y
  `product_name` al momento de la venta; cambios posteriores al producto
  no alteran facturas ya emitidas.
- **Facturas inmutables:** no hay `PUT`/`DELETE` para facturas — son
  inmutables una vez emitidas (evita reglas de reversión de stock
  complejas).
- **Protección contra IDOR en `GET /api/invoices/:id`:** si un vendedor
  pide una factura que existe pero no es suya, recibe el **mismo 404**
  (`NOT_FOUND`) que si el id no existiera. Las dos situaciones son
  indistinguibles a propósito, para que no se puedan enumerar ids válidos
  de facturas ajenas por prueba y error.
- **Credenciales inválidas indistinguibles:** un usuario inexistente y una
  contraseña incorrecta para un usuario que sí existe devuelven el mismo
  error `INVALID_CREDENTIALS`, por la misma razón (no revelar si un
  usuario existe).
- **Pago en dólares (`payment_currency`):** `POST /api/invoices` acepta un
  campo opcional `payment_currency: 'GTQ' | 'USD'`; cualquier valor
  distinto de exactamente `'USD'` (incluido omitirlo) se trata como
  `'GTQ'`, el comportamiento actual sin cambios. Si se pide `'USD'`,
  `invoiceService.createInvoice` llama a `exchangeClient.getTodayRate()`
  **antes** de invocar la transacción atómica (ver sección 6.3): si esa
  llamada falla (timeout, servicio inalcanzable, o respuesta de error),
  se lanza `AppError(502, 'EXCHANGE_SERVICE_UNAVAILABLE', ...)` y **no se
  crea la factura** — no hay inserciones parciales ni descuento de stock.
  Si la tasa se obtuvo con éxito, la transacción corre exactamente igual
  que para una factura en Quetzales (mismas validaciones de stock, mismo
  cálculo de `subtotal`/`tax`/`total`) y, como último paso dentro de esa
  misma transacción, calcula `total_usd = round(total / tasa, 2)` y
  guarda `payment_currency`, `exchange_rate` (la tasa usada) y `total_usd`
  junto con la factura — sin volver a llamar a la red, ya es aritmética
  simple con la tasa obtenida en el primer paso.

## 11. Autenticación

- Login con JWT (`POST /api/auth/login` → `{ token, user: { id, username, role } }`).
- No hay registro público. Los usuarios (al menos un admin y un vendedor)
  se crean con `facturacion-service/src/database/seed.js` (idempotente:
  usa `INSERT OR IGNORE`, se puede correr varias veces sin duplicar).
- El middleware `verifyTokenMiddleware` (`src/middlewares/auth.js`) exige
  un header `Authorization: Bearer <token>` válido en toda ruta protegida.
- El middleware `requireRole(...roles)` (`src/middlewares/authorize.js`)
  exige que `req.user.role` esté en la lista permitida (p. ej. CRUD de
  productos exige `role === 'admin'`).
- Contraseñas con `bcrypt` (10 rounds).
- El token expira según `JWT_EXPIRES_IN` (por defecto `8h`).

## 12. Variables de entorno

### `facturacion-service/.env`

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3001` | Puerto del backend |
| `JWT_SECRET` | *(sin default — obligatoria)* | Secreto para firmar/verificar JWT. El servidor lanza una excepción al iniciar si falta |
| `JWT_EXPIRES_IN` | `8h` | Vigencia del token |
| `DB_PATH` | `./data/facturacion.db` | Ruta del archivo SQLite (el directorio se crea automáticamente si no existe) |
| `SEED_ADMIN_USERNAME` | `admin` | Usuario admin creado por el seed |
| `SEED_ADMIN_PASSWORD` | `admin123` | Contraseña del admin creado por el seed |
| `SEED_VENDEDOR_USERNAME` | `vendedor` | Usuario vendedor creado por el seed |
| `SEED_VENDEDOR_PASSWORD` | `vendedor123` | Contraseña del vendedor creado por el seed |
| `EXCHANGE_SERVICE_URL` | `http://localhost:3002` | Base URL de `exchange-service`, usada por `exchangeClient.js` al facturar en dólares. Mismo nombre de variable que usa `finance-service` en `FinanzasGT` para ubicar a este mismo `exchange-service` |

### `exchange-service/.env`

Reutilizado tal cual de `FinanzasGT`, variables idénticas:

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3002` | Puerto del servicio |
| `BANGUAT_SERVICE_URL` | `https://banguat.gob.gt/variables/ws/TipoCambio.asmx` | Endpoint SOAP real del Banco de Guatemala |
| `REQUEST_TIMEOUT_MS` | `5000` | Timeout de la llamada SOAP a Banguat |
| `CACHE_DURATION_MS` | `3600000` | Duración del cacheo en memoria de la tasa del día (1 hora) |

### `frontend/.env`

| Variable | Default sugerido | Descripción |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3001/api` | Base URL que usa Axios para llamar a `facturacion-service` |

### `tests/.env`

Todas las variables son opcionales; si no se definen, `conftest.py` usa los
valores por defecto que coinciden con las cuentas sembradas por el seed.

| Variable | Default | Descripción |
|---|---|---|
| `BASE_URL` | `http://localhost:5173` | URL del frontend contra la que corren las pruebas |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | Credenciales de la cuenta admin |
| `VENDEDOR_USERNAME` / `VENDEDOR_PASSWORD` | `vendedor` / `vendedor123` | Credenciales de la cuenta vendedor |

## 13. Manejo de errores

Middleware centralizado en `facturacion-service` (`src/middlewares/errorHandler.js`)
devuelve siempre `{ error: { code, message } }` con el status HTTP
correspondiente al `AppError` lanzado (o 500/`INTERNAL_ERROR` si el error
no es un `AppError`). El frontend normaliza esta forma en
`api.client.js` (interceptor de respuesta) y la muestra con el componente
reutilizable `ErrorMessage`.

Códigos realmente usados en el código:

| Código | HTTP | Dónde se lanza | Mensaje |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Datos de producto inválidos, ajuste de stock inválido, o `customer_name` vacío | Varía según el campo |
| `INVALID_QUANTITY` | 400 | `quantity` no es entero positivo en una línea de factura | "La cantidad debe ser un entero mayor que 0" |
| `EMPTY_INVOICE` | 400 | `items` vacío o no es un arreglo | "La factura debe tener al menos un producto" |
| `UNAUTHORIZED` | 401 | Falta el header `Authorization`, falta el token, o el JWT es inválido/expiró | "Token requerido" / "Token inválido o expirado" |
| `INVALID_CREDENTIALS` | 401 | Usuario inexistente o contraseña incorrecta en login | "Usuario o contraseña incorrectos" |
| `FORBIDDEN` | 403 | Rol sin permiso para la ruta (p. ej. vendedor en rutas de admin) | "No tiene permisos para esta acción" |
| `PRODUCT_NOT_FOUND` | 404 | Producto inexistente (detalle, update, delete, o referenciado en una línea de factura) | "Producto no encontrado" |
| `NOT_FOUND` | 404 | Factura inexistente, factura ajena (vendedor), o ruta no encontrada | "Factura no encontrada" / "Ruta no encontrada" |
| `DUPLICATE_SKU` | 409 | SKU repetido al crear/editar un producto | "El SKU ya existe" |
| `INSUFFICIENT_STOCK` | 409 | Stock agregado insuficiente para una o más líneas de la factura | "Stock insuficiente para {nombre del producto}" |
| `EXCHANGE_SERVICE_UNAVAILABLE` | 502 | `payment_currency: 'USD'` y `exchangeClient.getTodayRate()` falla (timeout, `exchange-service` inalcanzable, o `exchange-service` responde con error) — lanzado desde `invoiceService.createInvoice`, antes de abrir la transacción | "No se pudo obtener la tasa de cambio actual. Intente de nuevo o facture en Quetzales." |
| `INTERNAL_ERROR` | 500 | Cualquier error no controlado | — |

**Nota — `exchangeClient.js` distingue internamente, `EXCHANGE_SERVICE_UNAVAILABLE`
no:** el cliente HTTP hacia `exchange-service` (`src/clients/exchangeClient.js`)
lanza errores internos con `code: 'EXCHANGE_TIMEOUT'`,
`'EXCHANGE_UNAVAILABLE'` o `'EXCHANGE_ERROR_RESPONSE'` según la causa
exacta (timeout, servicio inalcanzable, o respuesta de error). De cara al
cliente HTTP de `facturacion-service` (y por lo tanto al frontend), los
tres casos colapsan siempre en el mismo `EXCHANGE_SERVICE_UNAVAILABLE`
(502) — el vendedor no necesita la causa técnica exacta, solo que debe
reintentar o facturar en Quetzales.

## 14. API — `facturacion-service`

Base URL: `http://localhost:3001/api` (más `GET /health` en la raíz, fuera
de `/api`, sin autenticación).

| Endpoint | Rol | Descripción |
|---|---|---|
| `POST /api/auth/login` | público | Autentica y devuelve `{ token, user }` |
| `GET /api/products` | admin, vendedor | Lista todos los productos |
| `GET /api/products/:id` | admin, vendedor | Detalle de un producto |
| `POST /api/products` | admin | Crea producto (valida `name`, `sku`, `price > 0`, `stock >= 0`; `category` opcional; `sku` único) |
| `PUT /api/products/:id` | admin | Reemplaza un producto (mismas validaciones que `POST`, excluyendo el propio id al chequear unicidad de `sku`) |
| `DELETE /api/products/:id` | admin | Elimina producto (204 sin contenido) |
| `PATCH /api/products/:id/stock` | admin | Ajuste manual de stock por `delta` (positivo o negativo); rechaza si el resultado quedaría negativo |
| `GET /api/invoices` | admin, vendedor | Lista facturas (admin: todas; vendedor: solo las propias, filtradas por `created_by`); cada fila incluye `created_by_username` |
| `GET /api/invoices/:id` | admin, vendedor (propias) | Detalle de factura con sus `items`; 404 uniforme si no es propia o no existe |
| `POST /api/invoices` | admin, vendedor | Crea factura: `{ customer_name, customer_nit?, items: [{ product_id, quantity }], payment_currency? }`. Transacción con cálculo de IVA/total y descuento de stock |

`payment_currency` es opcional (`'GTQ' \| 'USD'`, default `'GTQ'`) — cambio
aditivo que no rompe el contrato previo de `POST /api/invoices`. La
respuesta de los 3 endpoints de arriba siempre incluye `payment_currency`,
`exchange_rate` y `total_usd` (estos dos últimos `null` cuando la factura
es en Quetzales). Si se pide `'USD'` y no se puede obtener la tasa del
día, la factura responde `502` / `EXCHANGE_SERVICE_UNAVAILABLE` (sección
13) y no se crea.

No hay `PUT`/`DELETE` para facturas (inmutables una vez emitidas).

`PATCH /api/products/:id/stock` existe en el backend y tiene su función
correspondiente en `frontend/src/hooks/useProducts.js`
(`adjustStock(id, delta)`) y en `frontend/src/services/products.api.js`,
pero **no tiene un control dedicado en la pantalla de productos** — en la
práctica, ajustar el stock desde la UI se hace editando el producto
(`PUT`, reemplazo completo del campo `stock`), no con un incremento/
decremento vía `PATCH`.

## 15. Estrategia de QA automatizada (Python + Playwright)

- **`pytest-playwright`** corre las pruebas contra la app real: frontend en
  `http://localhost:5173`, backend en `http://localhost:3001`. Los 3
  servicios (`exchange-service`, `facturacion-service`, `frontend`) deben
  estar corriendo antes de ejecutar la suite completa.
- **`test_usd_payment.py` es la única prueba de todo el proyecto con
  dependencia de red real:** crea una factura en dólares, lo que hace que
  `facturacion-service` llame al `exchange-service` real, y este a su vez
  al SOAP real del Banco de Guatemala — nada se simula ahí. Como la tasa
  real cambia a diario y no se conoce de antemano, esta prueba nunca
  afirma una tasa o total en dólares exactos: lee lo que la página
  realmente muestra y lo cruza contra sí mismo (`total_gtq / tasa_mostrada
  ≈ total_usd_mostrado`) y contra la matemática en Quetzales (que la tasa
  real no puede afectar). Si no hay internet o `banguat.gob.gt` no
  responde, esta prueba falla por una causa ambiental, no por un defecto
  de código — las demás pruebas E2E del proyecto son 100% offline.
- En el backend (`facturacion-service`, `node --test`), en cambio, el
  cliente `exchangeClient.js` se simula/stubea (`test/helpers/stubExchangeService.js`)
  en las pruebas de `invoiceService`/creación de facturas — esa suite no
  llama al `exchange-service` real ni a internet, para mantenerse rápida y
  confiable.
- **Video por prueba:** flag `--video=on`, guardado en `tests/videos/`
  (configurado vía `addopts = --output=videos` en `pytest.ini`).
- **Screenshots por escenario:** `save_evidence(page, test_name, step_name)`
  en `tests/conftest.py` guarda capturas en `tests/evidence/` con el
  nombre `{test}__{paso}.png`, y las registra en `tests/reports/results.json`
  (reescrito desde cero en cada corrida por el hook `pytest_configure`).
- **Reporte HTML:** `pytest-html` (`--html=reports/report.html`).
- **Presentación PPTX automática:** `tests/generate_report.py`
  (`python-pptx`), leyendo `results.json` y `evidence/*.png`: portada, una
  diapositiva por resultado de prueba (con sus capturas y una etiqueta
  PASO/FALLO tomada del `outcome` real), y al final una diapositiva por
  cada función `test_...` con su código fuente exacto.

**Archivos de prueba y escenarios cubiertos:**

| Archivo | Pruebas |
|---|---|
| `test_auth.py` | `test_admin_login_success`, `test_vendedor_login_success`, `test_invalid_credentials_rejected` |
| `test_products.py` | `test_admin_create_product`, `test_admin_edit_product_price`, `test_admin_delete_product`, `test_admin_duplicate_sku_shows_inline_error`, `test_vendedor_redirected_from_products` |
| `test_invoices.py` | `test_vendedor_creates_invoice_totals_and_stock_deduct`, `test_invoice_history_scoped_by_role`, `test_new_invoice_submit_disabled_until_item_added` |
| `test_stock_limits.py` | `test_adding_quantity_over_stock_disables_submit`, `test_backend_rejects_insufficient_stock_and_leaves_stock_unchanged` |
| `test_usd_payment.py` | `test_create_usd_invoice_shows_dollar_equivalent` (única prueba con dependencia de red real — ver arriba) |

Cada archivo cubre un flujo de negocio completo (login → acción →
resultado esperado), no clics sueltos aislados, para que el video y las
diapositivas cuenten una historia clara.

Ver el [manual de instalación](02-manual-instalacion.md) para el comando
exacto que corre toda la suite y genera el reporte.
