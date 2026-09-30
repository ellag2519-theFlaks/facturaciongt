# Documentación Técnica — Sistema de Facturación e Inventario

## 1. Introducción

Aplicación web para gestionar un catálogo de productos, llevar control de
inventario, y generar facturas de venta que descuentan stock
automáticamente al momento de facturar. Proyecto de Análisis de Sistemas II
(UMG, 8vo. semestre), con el mismo patrón de capas y manejo de errores que
`FinanzasGT` (proyecto de referencia del primer parcial), pero como un solo
backend en lugar de microservicios.

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
historial de facturas acotado por rol; suite de pruebas E2E (Python +
Playwright) con video, reporte HTML y PPTX; documentación del proyecto.

**Fuera de alcance (explícito):** facturación electrónica real (FEL/SAT);
múltiples sucursales/bodegas; reportes financieros avanzados o dashboards
analíticos; recuperación de contraseña o registro público de usuarios (los
usuarios se crean con un script de seed); notificaciones.

## 5. Tecnologías utilizadas

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite 8, React Router 7 (`react-router-dom@7.18.2`), Axios, Tailwind CSS v4 |
| Backend | Node.js, Express 5, `better-sqlite3`, `bcrypt`, `jsonwebtoken`, `cors`, `dotenv`, `nodemon` (dev) |
| Base de datos | SQLite (archivo único, vía `better-sqlite3`) |
| Pruebas E2E | Python, `pytest`, `pytest-playwright`, `pytest-html`, `python-pptx` |

## 6. Arquitectura del sistema

### 6.1 Diagrama de arquitectura

Un solo backend (no microservicios): a diferencia de `FinanzasGT`, aquí no
hay una integración externa (como el SOAP del Banguat) que justifique
dividir el dominio en varios servicios. Productos, inventario y facturas
son un solo dominio cohesivo.

```
┌──────────────┐        HTTP/JSON        ┌───────────────────────┐
│   frontend    │ ──────────────────────▶ │  facturacion-service  │
│ React + Vite  │ ◀────────────────────── │   Node + Express 5    │
│  (5173)       │      { error: {…} }      │       (3001)          │
└──────────────┘                          └───────────┬───────────┘
                                                        │ better-sqlite3
                                                        ▼
                                              facturacion.db (SQLite)
```

### 6.2 Responsabilidad de cada componente

- **`frontend`:** UI en React. Consume `facturacion-service` vía HTTP/JSON
  usando Axios, con un interceptor que adjunta el JWT y normaliza errores.
- **`facturacion-service`:** único backend. Expone la API REST, valida
  reglas de negocio, calcula IVA, y persiste en SQLite dentro de
  transacciones cuando una operación toca varias tablas (crear factura).

### 6.3 Diagrama de comunicación (protocolos)

El frontend nunca habla directamente con SQLite; todo pasa por
`facturacion-service` vía HTTP/JSON. Las rutas protegidas requieren un
header `Authorization: Bearer <token>`; las que además exigen rol
(`admin`) pasan primero por el middleware de autenticación y luego por el
de autorización.

## 7. Estructura del proyecto

```
Proyecto de facturación/
├── frontend/                # React 19 + Vite + React Router + Axios + Tailwind CSS v4
├── facturacion-service/     # Node.js + Express 5
├── tests/                   # Python + pytest-playwright (E2E)
└── docs/                    # esta documentación
```

### 7.1 Estructura real de `facturacion-service/src/`

```
src/
├── app.js                 # configuración de Express, montaje de rutas y middlewares
├── config/env.js          # lectura y defaults de variables de entorno
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

### 7.2 Estructura real de `frontend/src/`

```
src/
├── components/   ErrorMessage, LoadingSpinner, LoginForm, ProductForm,
│                 ProductList, StockBadge, InvoiceForm, InvoiceItemRow,
│                 InvoiceList, ProtectedRoute
├── pages/        LoginPage, ProductsPage (admin), NewInvoicePage, InvoiceHistoryPage
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
| `/products` | autenticado, rol `admin` | `ProductsPage` |

`ProtectedRoute` redirige a `/login` si no hay sesión, y a `/` si el rol no
tiene acceso a la ruta (p. ej. un vendedor navegando a `/products`).

> **Nota de implementación:** la aplicación no tiene una barra de
> navegación ni botón de "cerrar sesión" — se navega escribiendo la URL
> directamente (`/products`, `/invoices`, `/invoices/new`). Ver el
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
| `INTERNAL_ERROR` | 500 | Cualquier error no controlado | — |

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
| `POST /api/invoices` | admin, vendedor | Crea factura: `{ customer_name, customer_nit?, items: [{ product_id, quantity }] }`. Transacción con cálculo de IVA/total y descuento de stock |

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
  `http://localhost:5173`, backend en `http://localhost:3001`. Ambos deben
  estar corriendo antes de ejecutar la suite.
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

Cada archivo cubre un flujo de negocio completo (login → acción →
resultado esperado), no clics sueltos aislados, para que el video y las
diapositivas cuenten una historia clara.

Ver el [manual de instalación](02-manual-instalacion.md) para el comando
exacto que corre toda la suite y genera el reporte.
