# Sistema de Facturación e Inventario — Diseño

**Fecha:** 2026-09-30
**Curso:** Análisis de Sistemas II (UMG, 8vo. semestre)
**Proyecto de referencia (mecánica heredada):** `Análisis II/Primer parcial/FinanzasGT`

## Propósito

Aplicación web que permite gestionar un catálogo de productos, llevar control
de inventario, y generar facturas de venta que descuentan stock
automáticamente al momento de facturar. El proyecto debe demostrar, además
del software funcional, un pipeline de QA automatizado: scripts de prueba,
ejecución automatizada, informe de resultados, video de las pruebas, y una
presentación en PowerPoint con las evidencias.

**Éxito se ve como:** un administrador puede mantener el catálogo e
inventario; un vendedor puede generar facturas sin poder salirse de stock
disponible; y una sola línea de comando corre toda la batería de pruebas
end-to-end y deja listos el reporte HTML, los videos, y el .pptx de
evidencias.

## Alcance

**Dentro de alcance:**
- CRUD de productos e inventario (rol administrador).
- Generación de facturas con cálculo de IVA 12% (roles administrador y
  vendedor).
- Descuento atómico de stock al confirmar una factura; bloqueo de venta si
  no hay stock suficiente.
- Login con dos roles (administrador, vendedor) vía JWT.
- Historial de facturas (administrador ve todas; vendedor ve solo las
  propias).
- Suite de pruebas E2E automatizadas (Python + Playwright) con video,
  reporte HTML, y presentación PPTX generados automáticamente.
- Documentación del proyecto (`docs/`): técnica, instalación, usuario, guion
  de exposición — mismo set que FinanzasGT.

**Fuera de alcance (explícito):**
- Facturación electrónica real (FEL/SAT) — es un proyecto académico, no
  emite folios fiscales oficiales.
- Múltiples sucursales/bodegas.
- Reportes financieros avanzados, dashboards analíticos.
- Recuperación de contraseña / registro público de usuarios (los usuarios
  se crean con un script de seed).
- Notificaciones (correo, etc.).

## Arquitectura

Un solo backend (no microservicios). A diferencia de FinanzasGT — donde
`exchange-service` existía porque solo un servicio podía hablar con el SOAP
del Banguat — aquí no hay una integración externa que justifique dividir en
varios servicios. Productos, inventario y facturas son un solo dominio
cohesivo.

```
Proyecto de facturación/
├── frontend/                # React 19 + Vite + React Router + Axios + Tailwind CSS v4
├── facturacion-service/     # Node.js + Express 5
│   └── src/
│       ├── routes/          # definición de endpoints
│       ├── controllers/     # parseo de request/response
│       ├── services/        # lógica de negocio (validación, cálculo IVA, transacciones)
│       ├── models/          # queries SQLite (better-sqlite3)
│       ├── middlewares/     # auth JWT, autorización por rol, errores centralizados
│       └── database/        # schema.js, connection.js, seed.js
├── tests/                   # Python + pytest-playwright (E2E)
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_products.py
│   ├── test_invoices.py
│   ├── test_stock_limits.py
│   ├── evidence/            # screenshots por escenario
│   ├── reports/             # pytest-html
│   ├── videos/              # video por prueba
│   └── generate_report.py   # arma el .pptx con evidencias + código validado
└── docs/                    # técnica, instalación, usuario, guion de exposición
```

Mismo patrón de capas y manejo de errores centralizado
(`{ error: { code, message } }`) que `finance-service` en FinanzasGT.

## Modelo de datos (SQLite)

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

`invoice_items.product_name` guarda una copia del nombre al momento de la
venta para que el historial no cambie si el producto se renombra después.

## Roles y permisos

| Acción | Admin | Vendedor |
|---|---|---|
| Ver productos/stock | ✅ | ✅ |
| Crear/editar/eliminar productos | ✅ | ❌ |
| Ajustar stock manualmente | ✅ | ❌ |
| Generar factura | ✅ | ✅ |
| Ver historial de facturas | ✅ (todas) | ✅ (solo propias) |

## Reglas de negocio clave

- **IVA:** 12% fijo sobre el subtotal. `total = subtotal + (subtotal * 0.12)`.
- **Descuento de stock:** al confirmar una factura, la creación de la
  factura y el descuento de stock de cada línea ocurren en **una sola
  transacción SQLite** (`db.transaction(...)` de `better-sqlite3`). Si
  cualquier línea no tiene stock suficiente, toda la operación se revierte
  y no se crea la factura ni se modifica el inventario.
- **Consumidor final:** si no se ingresa NIT, se guarda `"CF"`.
- **Numeración de factura:** `invoice_number` se genera en el backend como
  correlativo con prefijo, formato `FAC-000001`, calculado dentro de la
  misma transacción a partir del máximo `id` existente en `invoices` (evita
  colisiones y no depende del reloj del cliente).
- **Snapshot de precios:** `invoice_items` guarda `unit_price` y
  `product_name` al momento de la venta; cambios posteriores al producto no
  alteran facturas ya emitidas.

## Autenticación

- Login con JWT (`POST /api/auth/login` → `{ token, user: { id, username, role } }`).
- No hay registro público. Los usuarios (al menos un admin y un vendedor)
  se crean con `facturacion-service/src/database/seed.js`.
- Middleware de autenticación valida el JWT en rutas protegidas; middleware
  de autorización valida el rol requerido por ruta (p. ej. CRUD de
  productos exige `role === 'admin'`).
- Contraseñas con `bcrypt`.

## API — `facturacion-service`

| Endpoint | Rol | Descripción |
|---|---|---|
| `POST /api/auth/login` | público | Autentica y devuelve JWT |
| `GET /api/products` | admin, vendedor | Lista productos |
| `GET /api/products/:id` | admin, vendedor | Detalle de producto |
| `POST /api/products` | admin | Crea producto |
| `PUT /api/products/:id` | admin | Actualiza producto |
| `DELETE /api/products/:id` | admin | Elimina producto |
| `PATCH /api/products/:id/stock` | admin | Ajuste manual de stock |
| `GET /api/invoices` | admin, vendedor | Lista facturas (vendedor: solo las propias, filtrado por `created_by`) |
| `GET /api/invoices/:id` | admin, vendedor (propias) | Detalle de factura |
| `POST /api/invoices` | admin, vendedor | Crea factura (transacción con descuento de stock) |

Sin `PUT`/`DELETE` para facturas — son inmutables una vez emitidas
(realista y evita reglas de reversión de stock complejas).

## Frontend — estructura

```
frontend/src/
├── components/   Navbar, ProductForm, ProductList, StockBadge,
│                 InvoiceForm, InvoiceItemRow, InvoiceList, LoginForm,
│                 LoadingSpinner, ErrorMessage
├── pages/        LoginPage, ProductsPage (admin), NewInvoicePage,
│                 InvoiceHistoryPage
├── services/     api.client.js (Axios + interceptor de JWT + manejo de
│                 errores), auth.api.js, products.api.js, invoices.api.js
├── hooks/        useAuth.js (sesión/rol), useProducts.js
└── utils/        formatCurrency.js (Q), formatDate.js
```

Rutas protegidas por rol vía un componente `ProtectedRoute` que redirige a
`/login` si no hay sesión, y a la página principal si el rol no tiene
acceso (p. ej. vendedor intentando entrar a `/products`).

## Estrategia de QA automatizada (Python + Playwright)

- **`pytest-playwright`** corre los tests contra la app real
  (`frontend` en `localhost:5173`, `facturacion-service` en su puerto).
- **Video por prueba:** flag `--video=on` de `pytest-playwright`, sin
  código adicional.
- **Screenshots por escenario:** cada test toma capturas en los pasos
  clave (login exitoso, formulario completado, factura generada, error de
  stock insuficiente) y las guarda en `tests/evidence/` con nombre por
  escenario.
- **Reporte HTML:** `pytest-html` (`--html=reports/report.html`) con
  resultado pasa/falla, duración, y captura de pantalla en fallos.
- **Presentación PPTX automática:** `tests/generate_report.py`
  (`python-pptx`) corre después de la batería: portada, una o más
  diapositivas por escenario con sus screenshots y resultado, y al final
  diapositivas con el código fuente de los tests validados.
- **Comando único:**
  ```
  pytest --video=on --html=reports/report.html && python tests/generate_report.py
  ```

**Escenarios cubiertos:**
1. `test_auth.py` — login admin y vendedor exitoso; credenciales inválidas
   rechazadas.
2. `test_products.py` — CRUD de productos por admin; vendedor sin acceso a
   la pantalla de productos.
3. `test_invoices.py` — generación de factura, cálculo correcto de
   IVA/total, y descuento de stock verificado tras confirmar.
4. `test_stock_limits.py` — intento de facturar más cantidad de la
   disponible es bloqueado con mensaje claro; stock no se modifica.

Cada archivo cubre un flujo de negocio completo (no clics sueltos
aislados), para que el video y las diapositivas cuenten una historia clara:
login → acción → resultado esperado.

## Documentación del proyecto

Mismo set que FinanzasGT, en `docs/`:
- `01-documentacion-tecnica.md`
- `02-manual-instalacion.md`
- `03-manual-usuario.md`
- `04-guion-exposicion.md` (+ `exposicion.html`)
- `README.md` índice

## Manejo de errores

Middleware centralizado en `facturacion-service` devuelve siempre
`{ error: { code, message } }` con el status HTTP apropiado (400
validación, 401 sin token, 403 rol sin permiso, 404 no encontrado, 409
stock insuficiente, 500 error interno). El frontend muestra estos mensajes
en un componente `ErrorMessage` reutilizable, igual que FinanzasGT.

## Cómo se levanta cada parte

```
cd facturacion-service && npm run dev   # API
cd frontend && npm run dev              # UI
cd tests && pytest --video=on --html=reports/report.html && python generate_report.py
```
