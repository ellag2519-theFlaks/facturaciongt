# Manual de Instalación — Sistema de Facturación e Inventario

## 1. Requisitos previos

- **Node.js** (18 o superior; el proyecto usa Express 5, React 19 y Vite 8,
  que requieren Node moderno) y `npm`.
- **Python 3** con el lanzador `py` (en Windows, usar `py` en vez de
  `python`/`pip` — p. ej. `py -m pip install ...`).
- Navegador Chromium, instalado vía Playwright (paso 5).

### Verificar si ya están instalados

```
node -v
npm -v
py --version
```

## 2. Estructura del proyecto

```
Proyecto de facturación/
├── frontend/                # React + Vite (UI) — puerto 5173
├── facturacion-service/     # Node + Express (API) — puerto 3001
├── tests/                   # Python + pytest-playwright (E2E)
└── docs/                    # esta documentación
```

## 3. Backend — `facturacion-service`

```
cd facturacion-service
npm install
```

Copiar el archivo de variables de entorno y completar `JWT_SECRET` (es
obligatorio; el servidor no arranca sin él):

```
cp .env.example .env
```

Editar `.env` y poner cualquier cadena secreta en `JWT_SECRET`, por
ejemplo:

```
JWT_SECRET=una-clave-larga-y-aleatoria-solo-para-desarrollo
```

El resto de variables ya tiene valores por defecto razonables para
desarrollo local (puerto 3001, expiración de token 8h, ruta de la base de
datos `./data/facturacion.db`, usuarios de seed `admin`/`admin123` y
`vendedor`/`vendedor123`). Ver el detalle completo en la
[documentación técnica](01-documentacion-tecnica.md#12-variables-de-entorno).

Crear la base de datos y sembrar los usuarios (idempotente — se puede
correr más de una vez sin duplicar usuarios):

```
node src/database/seed.js
```

Esto crea `facturacion-service/data/facturacion.db` (el directorio `data/`
se crea automáticamente) con las tablas del esquema y los dos usuarios de
prueba.

Levantar el backend:

```
npm run dev
```

Debe quedar escuchando en `http://localhost:3001`. Verificar con:

```
curl http://localhost:3001/health
```

Debe responder `{"status":"ok"}`.

## 4. Frontend

En otra terminal:

```
cd frontend
npm install
cp .env.example .env
```

El `.env.example` ya trae el valor correcto para desarrollo local
(`VITE_API_URL=http://localhost:3001/api`), apuntando al backend del paso
anterior. Solo hay que ajustarlo si el backend corre en otro puerto/host.

Levantar el frontend:

```
npm run dev
```

Debe quedar disponible en `http://localhost:5173`. Abrir esa URL en el
navegador y confirmar que aparece la pantalla de login.

## 5. Suite de pruebas E2E (`tests/`)

Requiere que **backend y frontend ya estén corriendo** (pasos 3 y 4).

En otra terminal:

```
cd tests
py -m pip install -r requirements.txt
py -m playwright install chromium
```

Variables de entorno opcionales (por defecto ya apuntan a
`http://localhost:5173` y a las cuentas sembradas en el paso 3):

```
cp .env.example .env
```

Solo es necesario editar `tests/.env` si el frontend corre en otra URL o
si se sembraron usuarios con credenciales distintas a las de
`facturacion-service/.env.example`.

### Comando único: correr toda la suite y generar el reporte

```
py -m pytest --video=on --html=reports/report.html -v
py generate_report.py
```

(equivalente en una sola línea: `py -m pytest --video=on --html=reports/report.html -v && py generate_report.py`)

Esto:

1. Corre las 4 baterías de pruebas (`test_auth.py`, `test_products.py`,
   `test_invoices.py`, `test_stock_limits.py`) contra la app real,
   grabando un video por prueba en `tests/videos/` y screenshots por
   escenario en `tests/evidence/`.
2. Genera `tests/reports/report.html` (resultado pasa/falla + duración) y
   `tests/reports/results.json` (fuente de datos del paso siguiente).
3. Genera `tests/reports/evidencia.pptx`: portada, una diapositiva por
   escenario con sus capturas y resultado, y diapositivas finales con el
   código fuente de cada prueba.

Para correr un solo archivo de pruebas durante desarrollo (más rápido que
la suite completa):

```
py -m pytest test_auth.py --video=on --html=reports/report.html -v
```

## 6. Verificación de funcionamiento

| Verificación | Cómo |
|---|---|
| Backend arriba | `curl http://localhost:3001/health` → `{"status":"ok"}` |
| Login admin | Abrir `http://localhost:5173/login`, entrar con `admin` / `admin123` |
| Login vendedor | Igual, con `vendedor` / `vendedor123` |
| Productos (solo admin) | Tras iniciar sesión como admin, ir a `http://localhost:5173/products` |
| Nueva factura | Ir a `http://localhost:5173/invoices/new` (ambos roles) |
| Historial | Ir a `http://localhost:5173/invoices` (ambos roles) |
| Suite E2E | Ver `tests/reports/report.html` y `tests/reports/evidencia.pptx` tras correr el comando de la sección 5 |

## 7. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El backend no arranca: `JWT_SECRET environment variable is required` | Falta `facturacion-service/.env` o `JWT_SECRET` vacío | Copiar `.env.example` a `.env` y poner un valor en `JWT_SECRET` |
| `EADDRINUSE` al levantar el backend | Ya hay algo escuchando en el puerto 3001 | Cerrar el proceso anterior o cambiar `PORT` en `.env` (y `VITE_API_URL` en el frontend) |
| El frontend no puede llamar a la API (errores de red en el login) | `VITE_API_URL` no coincide con el puerto real del backend, o el backend no está corriendo | Verificar `frontend/.env` y que `npm run dev` de `facturacion-service` esté activo |
| Las pruebas Playwright fallan al abrir el navegador | No se instaló el binario de Chromium | `py -m playwright install chromium` |
| Las pruebas fallan por timeout esperando el login | El frontend o el backend no están corriendo antes de lanzar `pytest` | Levantar ambos (pasos 3 y 4) antes de correr la suite |
| `python`/`pip` no reconocidos en Windows | Este entorno usa el lanzador `py`, no `python`/`pip` sueltos | Usar `py -m pip install ...` y `py -m pytest ...` / `py generate_report.py` |
| `results.json`/evidencias de una corrida vieja aparecen mezcladas | No aplica: `conftest.py` reescribe `results.json` desde cero en cada invocación de `pytest` | — |
