# Pago de Facturas en Dólares — Diseño

**Fecha:** 2026-10-07
**Proyecto base:** Sistema de Facturación e Inventario (ver spec original: `2026-09-30-sistema-facturacion-design.md`)
**Servicio reutilizado:** `exchange-service` de `Análisis II/Primer parcial/FinanzasGT`

## Propósito

Permitir que, al generar una factura, el vendedor elija si el cliente paga en
Quetzales o en Dólares. Si elige dólares, el sistema debe calcular el monto
equivalente consumiendo el tipo de cambio real del día desde un servicio web
externo — reutilizando el `exchange-service` ya construido para el proyecto
FinanzasGT (consume el SOAP real del Banco de Guatemala).

**Éxito se ve como:** un vendedor puede marcar una factura como "pago en
dólares", el sistema consulta la tasa del día a través de `exchange-service`,
y la factura (en pantalla y en el historial) muestra tanto el monto en
Quetzales como su equivalente en dólares con la tasa usada. Si el servicio de
tipo de cambio no está disponible, la factura en dólares se bloquea con un
mensaje claro — nunca se crea con datos incompletos o inventados.

## Alcance

**Dentro de alcance:**
- Nuevo servicio `exchange-service/` (copiado de FinanzasGT, sin cambios de
  lógica) corriendo como proceso independiente.
- `facturacion-service` consume `exchange-service` por HTTP al crear una
  factura en dólares.
- Selector de moneda de pago en el formulario de nueva factura
  (Quetzales/Dólares, default Quetzales).
- El historial y el detalle de factura muestran el monto en dólares y la
  tasa usada cuando aplica.
- Bloqueo limpio (sin crear la factura) si `exchange-service` no responde.

**Fuera de alcance (explícito):**
- Cambiar los precios base de los productos — siguen en Quetzales siempre.
- Conversión por línea de producto — la conversión aplica solo al total de
  la factura, no a cada producto individualmente.
- Histórico de tasas de cambio propio — se usa la tasa del día que devuelve
  `exchange-service` (que internamente cachea 1 hora), no se construye un
  historial de tasas dentro de este proyecto.
- Modificar `exchange-service` — se reutiliza tal cual; cualquier mejora a
  ese servicio queda fuera de este proyecto.
- Soporte para monedas distintas de GTQ/USD.

## Arquitectura

```
Proyecto de facturación/
├── exchange-service/         # NUEVO — copia de FinanzasGT, puerto 3002
│   └── (sin cambios respecto al original)
├── facturacion-service/      # + src/clients/exchangeClient.js
├── frontend/                  # + selector de moneda en InvoiceForm
└── tests/                     # + escenario E2E de pago en USD
```

`exchange-service` es el único componente autorizado a hablar con el SOAP de
Banguat (mismo principio que en FinanzasGT). `facturacion-service` es el
único componente de este proyecto autorizado a hablar con `exchange-service`
— el frontend nunca lo llama directamente, solo envía `payment_currency` al
crear la factura.

### exchange-service (copiado de FinanzasGT, sin modificar)

| Endpoint | Descripción |
|---|---|
| `GET /health` | `{ status: 'ok', service: 'exchange-service' }` |
| `GET /api/exchange-rate/today` | `{ rate: number, date: string }` — tasa GTQ por 1 USD, cacheada 1 hora |
| `GET /api/exchange-rate/date/:date` | Tasa de una fecha específica (no usado por este proyecto, pero se copia completo) |
| `POST /api/exchange-rate/convert` | No usado por este proyecto (facturacion-service hace la conversión con la tasa ya obtenida) |

Variables de entorno (`.env.example`, idénticas a FinanzasGT):
`PORT=3002`, `BANGUAT_SERVICE_URL=https://banguat.gob.gt/variables/ws/TipoCambio.asmx`,
`REQUEST_TIMEOUT_MS=5000`, `CACHE_DURATION_MS=3600000`.

## Modelo de datos

Se agregan 3 columnas a la tabla `invoices` existente (migración, no se
recrea la tabla):

```sql
ALTER TABLE invoices ADD COLUMN payment_currency TEXT NOT NULL DEFAULT 'GTQ' CHECK (payment_currency IN ('GTQ', 'USD'));
ALTER TABLE invoices ADD COLUMN exchange_rate REAL;
ALTER TABLE invoices ADD COLUMN total_usd REAL;
```

`exchange_rate` y `total_usd` quedan `NULL` cuando `payment_currency = 'GTQ'`.
`subtotal`, `tax`, `total` (ya existentes) siguen siendo siempre los montos
en Quetzales — nunca se recalculan ni se sobrescriben en dólares.

**Idempotencia de la migración:** a diferencia de `CREATE TABLE IF NOT EXISTS`
que ya usa `schema.js`, SQLite no soporta `ADD COLUMN IF NOT EXISTS`. Antes
de ejecutar cada `ALTER TABLE`, `schema.js` debe comprobar si la columna ya
existe (`PRAGMA table_info(invoices)`) y solo agregarla si falta — así
`schema.js` sigue siendo seguro de ejecutar en cada arranque, igual que hoy.

## Lógica de negocio

**Restricción técnica clave:** `better-sqlite3`'s `db.transaction()` exige
que la función envuelta sea completamente síncrona — no admite `await`
dentro. La llamada HTTP a `exchange-service` es asíncrona, así que **no
puede ocurrir dentro de la transacción atómica** que ya existe (Tarea 11 del
proyecto original: valida stock, calcula totales, inserta, descuenta stock).

Orden de ejecución en `invoiceService.createInvoice`:

1. Si `payment_currency === 'USD'`: llamar a `exchangeClient.getTodayRate()`
   **antes** de invocar la transacción. Si falla (timeout, servicio
   inalcanzable, error del servicio) lanzar
   `AppError(502, 'EXCHANGE_SERVICE_UNAVAILABLE', 'No se pudo obtener la tasa de cambio actual. Intente de nuevo o facture en Quetzales.')`
   — la factura **no se crea**, no hay inserciones parciales.
2. La transacción atómica existente corre **sin cambios**: valida stock
   agregado por producto, calcula `subtotal`/`tax`/`total` en Quetzales,
   inserta la factura y sus líneas, descuenta stock.
3. Si se pidió USD, como último paso dentro de la misma transacción (ya es
   aritmética simple con la tasa que se obtuvo en el paso 1, no requiere una
   nueva llamada async): `total_usd = round(total_gtq / tasa, 2)`. Se
   guardan `payment_currency`, `exchange_rate` (la tasa usada) y `total_usd`
   junto con la factura.

Si `payment_currency` es `'GTQ'` o se omite (default), el comportamiento es
exactamente el actual — ningún cambio, ninguna llamada a `exchange-service`.

## API — `facturacion-service`

`POST /api/invoices` — cambio aditivo, no rompe el contrato actual:
- Body gana un campo opcional `payment_currency: 'GTQ' | 'USD'` (default `'GTQ'`).
- La respuesta (y la de `GET /api/invoices`, `GET /api/invoices/:id`) incluye
  siempre `payment_currency`, `exchange_rate`, `total_usd` (estos dos últimos
  `null` cuando la factura es en GTQ).

Nuevo código de error: `EXCHANGE_SERVICE_UNAVAILABLE` (502), con el mismo
formato `{ error: { code, message } }` que todo el resto de la API.

`facturacion-service/.env.example` gana `EXCHANGE_SERVICE_URL=http://localhost:3002`
(mismo nombre de variable que usa `finance-service` en FinanzasGT para
ubicar a `exchange-service`).

## Frontend

- `InvoiceForm`: nuevo selector "Moneda de pago" (Quetzales / Dólares),
  default Quetzales, se envía como `payment_currency` en el `POST`. Si
  `exchange-service` no responde, el error `EXCHANGE_SERVICE_UNAVAILABLE` se
  muestra tal cual vía `ErrorMessage` (mismo patrón que cualquier otro error
  de backend ya manejado hoy).
- `InvoiceList` / `InvoiceDetailPage`: cuando `payment_currency === 'USD'`,
  se muestra el total en Quetzales seguido del equivalente, p. ej.
  *"Total: Q 112.00 (≈ $14.35 USD, tasa: 7.81)"*. Cuando es GTQ, no cambia
  nada respecto a hoy.

## Manejo de errores

Mismo principio que el resto del proyecto: todo error responde
`{ error: { code, message } }` con el status correcto. `EXCHANGE_SERVICE_UNAVAILABLE`
(502) es el único código nuevo. El cliente HTTP hacia `exchange-service`
distingue internamente timeout / servicio inalcanzable / respuesta de error
(mismo patrón que `finance-service` de FinanzasGT), pero de cara a
`facturacion-service` y al frontend, todos esos casos colapsan en el mismo
`EXCHANGE_SERVICE_UNAVAILABLE` — el vendedor no necesita saber la causa
técnica exacta, solo que debe reintentar o facturar en Quetzales.

## Estrategia de pruebas

- **Backend (`node --test`, rápido, sin red):** el cliente
  `exchangeClient.js` se simula (mock/stub) en las pruebas de
  `invoiceService`/`invoices.create.test.js` — no se llama al
  `exchange-service` real ni a internet. Esto mantiene la suite de backend
  rápida y confiable, consistente con cómo ya está construida (sin
  dependencias externas).
- **E2E (Python + Playwright):** un escenario nuevo crea una factura en
  dólares contra el `exchange-service` **real** (y por lo tanto contra el
  Banguat real) — esta es la única prueba de todo el proyecto que depende de
  conectividad a internet real durante la ejecución, y así queda documentado
  explícitamente.
- `exchange-service` en sí no se modifica ni se le agregan pruebas propias
  — se reutiliza tal cual, ya es un servicio probado/funcional del proyecto
  FinanzasGT.

## Cómo se levanta cada parte (actualizado)

```
cd exchange-service && npm run dev        # NUEVO — puerto 3002
cd facturacion-service && npm run dev     # puerto 3001
cd frontend && npm run dev                # puerto 5173
cd tests && py -m pytest --video=on --html=reports/report.html -v && py generate_report.py
```

La demo en vivo y la suite E2E completa ahora requieren 3 servidores
corriendo (antes 2) y conectividad a internet (para el E2E de USD y para
cualquier factura real en dólares).
