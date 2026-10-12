# Manual de Instalación — Sistema de Facturación e Inventario

## 1. Requisitos previos

- **Node.js** (18 o superior; el proyecto usa Express 5, React 19 y Vite 8,
  que requieren Node moderno) y `npm`.
- **Python 3** con el lanzador `py` (en Windows, usar `py` en vez de
  `python`/`pip` — p. ej. `py -m pip install ...`).
- Navegador Chromium, instalado vía Playwright (paso 6).

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
├── exchange-service/        # Node + Express (tasa de cambio) — puerto 3002
├── tests/                   # Python + pytest-playwright (E2E)
└── docs/                    # esta documentación
```

## 3. Servicio de tipo de cambio — `exchange-service`

Reutilizado tal cual del proyecto del primer parcial (`FinanzasGT`), sin
cambios de lógica: es el único componente de todo el proyecto autorizado a
consultar el tipo de cambio real del Banco de Guatemala (SOAP de Banguat).
`facturacion-service` lo consume por HTTP únicamente cuando se crea una
factura en dólares — ver el detalle en la
[documentación técnica](01-documentacion-tecnica.md#6-arquitectura-del-sistema).

En otra terminal:

```
cd exchange-service
npm install
cp .env.example .env
```

El `.env.example` ya trae valores por defecto válidos para desarrollo
local — no requiere edición salvo que el puerto 3002 ya esté en uso:

```
PORT=3002
BANGUAT_SERVICE_URL=https://banguat.gob.gt/variables/ws/TipoCambio.asmx
REQUEST_TIMEOUT_MS=5000
CACHE_DURATION_MS=3600000
```

Levantar el servicio:

```
npm run dev
```

Debe quedar escuchando en `http://localhost:3002`. Verificar con:

```
curl http://localhost:3002/health
```

Debe responder `{"status":"ok","service":"exchange-service"}`.

> **Requiere internet:** este servicio consulta en vivo el SOAP real del
> Banco de Guatemala (cachea la tasa 1 hora). Sin conectividad a internet
> arranca igual, pero cualquier factura en dólares fallará con el error
> `EXCHANGE_SERVICE_UNAVAILABLE` (ver
> [documentación técnica, sección 13](01-documentacion-tecnica.md#13-manejo-de-errores)).
> Las facturas en Quetzales no se ven afectadas aunque este servicio esté
> caído.

## 4. Backend — `facturacion-service`

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
`vendedor`/`vendedor123`, y `EXCHANGE_SERVICE_URL=http://localhost:3002`
para ubicar al `exchange-service` del paso anterior). Ver el detalle
completo en la
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

> **Factura en dólares:** solo funciona si `exchange-service` (paso
> anterior) está corriendo y hay conectividad a internet. Facturar en
> Quetzales (el default) no depende de ninguno de los dos.

## 5. Frontend

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

## 6. Suite de pruebas E2E (`tests/`)

Requiere que **los 3 servicios ya estén corriendo** (pasos 3, 4 y 5):
`exchange-service`, `facturacion-service` y `frontend`.

En otra terminal:

```
cd tests
py -m pip install -r requirements.txt
py -m playwright install chromium
```

Variables de entorno opcionales (por defecto ya apuntan a
`http://localhost:5173` y a las cuentas sembradas en el paso 4):

```
cp .env.example .env
```

Solo es necesario editar `tests/.env` si el frontend corre en otra URL o
si se sembraron usuarios con credenciales distintas a las de
`facturacion-service/.env.example`.

### Comando único: correr toda la suite y generar el reporte

```
py -m pytest --video=on --slowmo=600 --junitxml=reports/e2e-junit.xml --html=reports/report.html -v
py generate_report.py
py generate_dashboard.py
```

(equivalente en una sola línea: `py -m pytest --video=on --slowmo=600 --junitxml=reports/e2e-junit.xml --html=reports/report.html -v && py generate_report.py && py generate_dashboard.py`)

`--slowmo=600` añade ~600ms de pausa entre cada acción de Playwright (clic,
llenar campo, etc.) -- sin esto los videos corren demasiado rápido para que
un QA manual pueda seguir los pasos. Omítelo si solo quieres una corrida
rápida durante desarrollo, sin generar evidencia para revisión humana.

Esto:

1. Corre los 7 archivos de prueba (nombrados según el tipo de prueba que
   cumplen: `test_auth_pruebas_funcionales.py`, `test_products_pruebas_funcionales.py`,
   `test_invoices_pruebas_funcionales.py`, `test_stock_limits_pruebas_funcionales.py`,
   `test_usd_payment_pruebas_funcionales.py`, `test_compatibility_pruebas_no_funcionales.py`,
   `test_volume_pruebas_no_funcionales.py`; 20 pruebas en total) contra la
   app real, grabando un video por prueba en `tests/videos/` y screenshots
   por escenario en `tests/evidence/`.
2. Genera `tests/reports/report.html` (resultado pasa/falla + duración) y
   `tests/reports/results.json` (fuente de datos del paso siguiente).
3. Genera `tests/reports/evidencia.pptx`: portada, una diapositiva por
   escenario con sus capturas y resultado, y diapositivas finales con el
   código fuente de cada prueba. Cada captura se ajusta a su propia
   proporción real (no se fuerza a 16:9), así una captura de viewport móvil
   (375x812, retrato) no sale estirada/deformada como ocurría antes. Si
   alguna prueba documenta un hallazgo conocido y deliberadamente sin
   corregir (no una validación funcional), su diapositiva muestra un badge
   ámbar "HALLAZGO CONFIRMADO" en vez de "PASÓ" -- actualmente ninguna
   prueba está en ese caso (el último hallazgo, el desbordamiento del
   Navbar en móvil, se corrigió el 2026-10-12 y sus 2 pruebas pasaron a ser
   de regresión normal).
4. Genera `tests/reports/dashboard.html`: un único reporte navegable con el
   tipo de cada prueba (unitaria/funcional/no funcional), el escenario, el
   resultado, el video grabado de esa prueba, y un botón de descarga del
   PPTX -- pensado para abrirse directo desde los "Artefactos de la
   compilación" de Jenkins sin tener que revisar report.html, los videos y
   el pptx por separado.

> **`test_usd_payment_pruebas_funcionales.py` depende de internet real:** es
> la única prueba de toda la suite que no es autocontenida — crea una
> factura en dólares, lo que hace que `facturacion-service` llame al
> `exchange-service` real, y este a su vez al SOAP real del Banco de
> Guatemala. Sin internet (o si `banguat.gob.gt` está caído), esta prueba
> falla por una razón ambiental, no por un defecto de código. Las otras 18
> pruebas son 100% offline.

Para correr un solo archivo de pruebas durante desarrollo (más rápido que
la suite completa):

```
py -m pytest test_auth_pruebas_funcionales.py --video=on --html=reports/report.html -v
```

## 7. Verificación de funcionamiento

| Verificación | Cómo |
|---|---|
| Exchange-service arriba | `curl http://localhost:3002/health` → `{"status":"ok","service":"exchange-service"}` |
| Backend arriba | `curl http://localhost:3001/health` → `{"status":"ok"}` |
| Login admin | Abrir `http://localhost:5173/login`, entrar con `admin` / `admin123` |
| Login vendedor | Igual, con `vendedor` / `vendedor123` |
| Productos (solo admin) | Tras iniciar sesión como admin, ir a `http://localhost:5173/products` |
| Nueva factura | Ir a `http://localhost:5173/invoices/new` (ambos roles) |
| Nueva factura en dólares | En `/invoices/new`, elegir "Dólares" en **Moneda de pago** antes de crear la factura (requiere `exchange-service` arriba e internet) |
| Historial | Ir a `http://localhost:5173/invoices` (ambos roles) |
| Suite E2E | Ver `tests/reports/dashboard.html` (reporte principal), `tests/reports/report.html` y `tests/reports/evidencia.pptx` tras correr el comando de la sección 6 |

## 8. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El backend no arranca: `JWT_SECRET environment variable is required` | Falta `facturacion-service/.env` o `JWT_SECRET` vacío | Copiar `.env.example` a `.env` y poner un valor en `JWT_SECRET` |
| `EADDRINUSE` al levantar el backend | Ya hay algo escuchando en el puerto 3001 | Cerrar el proceso anterior o cambiar `PORT` en `.env` (y `VITE_API_URL` en el frontend) |
| `EADDRINUSE` al levantar `exchange-service` | Ya hay algo escuchando en el puerto 3002 | Cerrar el proceso anterior o cambiar `PORT` en `exchange-service/.env` (y `EXCHANGE_SERVICE_URL` en `facturacion-service/.env`) |
| El frontend no puede llamar a la API (errores de red en el login) | `VITE_API_URL` no coincide con el puerto real del backend, o el backend no está corriendo | Verificar `frontend/.env` y que `npm run dev` de `facturacion-service` esté activo |
| Crear factura en dólares falla con "No se pudo obtener la tasa de cambio actual" (`EXCHANGE_SERVICE_UNAVAILABLE`) | `exchange-service` no está corriendo, o no hay internet para llegar a `banguat.gob.gt` | Verificar `curl http://localhost:3002/health`; si responde pero sigue fallando, revisar la conexión a internet. Como alternativa, facturar en Quetzales |
| Las pruebas Playwright fallan al abrir el navegador | No se instaló el binario de Chromium | `py -m playwright install chromium` |
| Las pruebas fallan por timeout esperando el login | El frontend o el backend no están corriendo antes de lanzar `pytest` | Levantar los 3 servicios (pasos 3, 4 y 5) antes de correr la suite |
| Solo `test_usd_payment_pruebas_funcionales.py` falla, el resto pasa | Sin internet, o `banguat.gob.gt` inalcanzable/caído en este momento | Es la única prueba con dependencia de red real (ver sección 6); reintentar con internet disponible |
| `python`/`pip` no reconocidos en Windows | Este entorno usa el lanzador `py`, no `python`/`pip` sueltos | Usar `py -m pip install ...` y `py -m pytest ...` / `py generate_report.py` |
| `results.json`/evidencias de una corrida vieja aparecen mezcladas | No aplica: `conftest.py` reescribe `results.json` desde cero en cada invocación de `pytest` | — |
