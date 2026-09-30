# Sistema de Facturación e Inventario

Proyecto universitario de facturación e inventario: catálogo de productos,
descuento de stock atómico al facturar, cálculo de IVA, y dos roles de
usuario (administrador y vendedor) autenticados con JWT.

## Arquitectura

A diferencia de `FinanzasGT` (proyecto del primer parcial, con varios
microservicios porque solo uno de ellos podía hablar con el SOAP del
Banguat), aquí **hay un solo backend**: productos, inventario y facturas
son un mismo dominio cohesivo, sin una integración externa que justifique
dividirlo.

```
Proyecto de facturación/
├── frontend/                # React + Vite (UI)
├── facturacion-service/     # Express — API de productos, inventario y facturas
└── tests/                   # Python + pytest-playwright (E2E)
```

## Servicios y puertos

| Servicio | Tecnología | Puerto |
|---|---|---|
| frontend | React 19 + Vite | 5173 |
| facturacion-service | Node + Express 5 | 3001 |

## Stack

- **Frontend:** React 19, Vite 8, React Router (`react-router-dom@7.18.2`),
  Axios, Tailwind CSS v4.
- **Backend:** Node.js, Express 5, `better-sqlite3`, `bcrypt`,
  `jsonwebtoken`, `cors`, `dotenv`, `nodemon` (dev).
- **Base de datos:** SQLite (`better-sqlite3`), un solo archivo en
  `facturacion-service/data/`.
- **Pruebas E2E:** Python, `pytest-playwright`, `pytest-html`,
  `python-pptx`.

## Cómo levantar cada parte

```
cd facturacion-service && npm install && node src/database/seed.js && npm run dev   # API — http://localhost:3001 (GET /health)
cd frontend && npm install && npm run dev                                           # UI  — http://localhost:5173
cd tests && py -m pip install -r requirements.txt && py -m playwright install chromium
cd tests && py -m pytest --video=on --html=reports/report.html -v && py generate_report.py
```

Cada parte necesita su propio `.env` (copiado de su `.env.example`
correspondiente: `facturacion-service/.env.example`,
`frontend/.env.example`, `tests/.env.example`). El paso a paso completo,
con las variables requeridas y los valores por defecto, está en el
[manual de instalación](docs/02-manual-instalacion.md).

## `facturacion-service` — API

| Endpoint | Rol | Descripción |
|---|---|---|
| `POST /api/auth/login` | público | Autentica y devuelve `{ token, user }` |
| `GET /api/products` | admin, vendedor | Lista productos |
| `GET /api/products/:id` | admin, vendedor | Detalle de producto |
| `POST /api/products` | admin | Crea producto |
| `PUT /api/products/:id` | admin | Actualiza producto |
| `DELETE /api/products/:id` | admin | Elimina producto |
| `PATCH /api/products/:id/stock` | admin | Ajuste manual de stock |
| `GET /api/invoices` | admin, vendedor | Lista facturas (vendedor: solo las propias) |
| `GET /api/invoices/:id` | admin, vendedor (propias) | Detalle de factura |
| `POST /api/invoices` | admin, vendedor | Crea factura (transacción con descuento de stock) |

Arquitectura interna: `routes` → `controllers` → `services` (validación,
cálculo de IVA, transacciones) → `models` (queries SQLite) →
`middlewares` (auth JWT, autorización por rol, errores centralizados,
siempre en la forma `{ error: { code, message } }`).

## `frontend` — Estructura

```
src/
├── components/   ErrorMessage, LoadingSpinner, LoginForm, ProductForm,
│                 ProductList, StockBadge, InvoiceForm, InvoiceItemRow,
│                 InvoiceList, ProtectedRoute
├── pages/        LoginPage, ProductsPage (admin), NewInvoicePage, InvoiceHistoryPage
├── services/     api.client.js (Axios + interceptor JWT + manejo de errores),
│                 auth.api.js, products.api.js, invoices.api.js
├── hooks/        useAuth.js (sesión/rol), useProducts.js
└── utils/        formatCurrency.js (Q), formatDate.js
```

Rutas: `/login` (login), `/` (página principal), `/invoices/new` (nueva
factura, admin y vendedor), `/invoices` (historial, acotado por rol),
`/products` (catálogo e inventario, solo admin). La aplicación no tiene
barra de navegación: se navega escribiendo la URL directamente — ver el
[manual de usuario](docs/03-manual-usuario.md).

## Documentación

Documentación completa en [`docs/`](docs/README.md): documentación
técnica, manual de instalación, manual de usuario, y guion de exposición.

## Estado del proyecto

**Backend completo:** autenticación JWT, CRUD de productos, facturación
con IVA y descuento atómico de stock, manejo de errores centralizado.
**Frontend completo:** login, catálogo de productos (admin), creación de
facturas, historial acotado por rol.
**Pipeline de QA completo:** 4 archivos de pruebas E2E con Playwright
(login, productos, facturación, límites de stock), video por prueba,
reporte HTML, y generación automática de una presentación PowerPoint con
las evidencias.
**Documentación completa:** técnica, instalación, usuario, y guion de
exposición — ver [`docs/`](docs/README.md).
