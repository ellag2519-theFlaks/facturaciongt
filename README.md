# Sistema de Facturación e Inventario

Proyecto universitario de facturación e inventario: catálogo de productos,
descuento de stock atómico al facturar, cálculo de IVA, y dos roles de
usuario (administrador y vendedor) autenticados con JWT.

## Arquitectura

A diferencia de `FinanzasGT` (proyecto del primer parcial, con varios
microservicios porque solo uno de ellos podía hablar con el SOAP del
Banguat), el dominio de negocio de este proyecto (productos, inventario y
facturas) vive en **un solo backend**, `facturacion-service`: no hay una
integración externa que justifique dividirlo.

La única excepción es el tipo de cambio: facturar en dólares requiere la
tasa real del Banco de Guatemala, y ese SOAP solo puede ser consumido por
un componente (mismo principio que en `FinanzasGT`). Por eso se reutilizó
tal cual, sin modificarlo, el `exchange-service` de `FinanzasGT` como un
segundo proceso HTTP independiente — `facturacion-service` es el único
componente de este proyecto autorizado a llamarlo; el frontend nunca lo
hace directamente, solo envía `payment_currency` al crear la factura.

```
Proyecto de facturación/
├── frontend/                # React + Vite (UI)
├── facturacion-service/     # Express — API de productos, inventario y facturas
├── exchange-service/        # Express — reutilizado de FinanzasGT, solo tasa de cambio (Banguat)
└── tests/                   # Python + pytest-playwright (E2E)
```

## Servicios y puertos

| Servicio | Tecnología | Puerto |
|---|---|---|
| frontend | React 19 + Vite | 5173 |
| facturacion-service | Node + Express 5 | 3001 |
| exchange-service | Node + Express 5 | 3002 |

## Stack

- **Frontend:** React 19, Vite 8, React Router (`react-router-dom@7.18.2`),
  Axios, Tailwind CSS v4.
- **Backend:** Node.js, Express 5, `better-sqlite3`, `bcrypt`,
  `jsonwebtoken`, `cors`, `dotenv`, `nodemon` (dev).
- **exchange-service:** Node.js, Express 5, `axios`, `xml2js` (parseo del
  SOAP de Banguat), `cors`, `dotenv`, `nodemon` (dev) — reutilizado sin
  cambios de `FinanzasGT`.
- **Base de datos:** SQLite (`better-sqlite3`), un solo archivo en
  `facturacion-service/data/`.
- **Pruebas E2E:** Python, `pytest-playwright`, `pytest-html`,
  `python-pptx`.

## Cómo levantar cada parte

```
cd exchange-service && npm install && npm run dev                                   # Tasa de cambio — http://localhost:3002 (GET /health)
cd facturacion-service && npm install && node src/database/seed.js && npm run dev   # API — http://localhost:3001 (GET /health)
cd frontend && npm install && npm run dev                                           # UI  — http://localhost:5173
cd tests && py -m pip install -r requirements.txt && py -m playwright install chromium
cd tests && py -m pytest --video=on --html=reports/report.html -v && py generate_report.py
```

La demo en vivo y la suite E2E completa ahora requieren los **3 servidores**
corriendo (antes 2) y conectividad a internet real (para facturar en
dólares y para el escenario E2E de pago en USD).

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
| `POST /api/invoices` | admin, vendedor | Crea factura (transacción con descuento de stock); acepta `payment_currency: 'GTQ'\|'USD'` opcional (default `'GTQ'`) |

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
con IVA y descuento atómico de stock, manejo de errores centralizado,
pago de facturas en dólares con tasa de cambio real vía `exchange-service`.
**Frontend completo:** login, catálogo de productos (admin), creación de
facturas (con selector de moneda de pago), historial y detalle de factura
acotados por rol, con el equivalente en dólares cuando aplica.
**Pipeline de QA completo:** 5 archivos de pruebas E2E con Playwright (14
pruebas: login, productos, facturación, límites de stock, y pago en USD),
video por prueba, reporte HTML, y generación automática de una
presentación PowerPoint con las evidencias. El escenario de pago en USD es
el único de toda la suite que depende de internet real (consume el SOAP
real del Banco de Guatemala a través de `exchange-service`).
**Documentación completa:** técnica, instalación, usuario, y guion de
exposición — ver [`docs/`](docs/README.md).
