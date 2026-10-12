# Guion de Exposición — FacturaciónGT

## 1. El problema que resuelve el sistema

Un negocio necesita vender productos y saber, en todo momento, cuánto
stock le queda de cada uno. Si la venta y el descuento de inventario no
son la misma operación atómica, es fácil vender algo que ya no existe en
bodega. Este sistema resuelve eso: cada factura y el descuento de stock
que le corresponde ocurren **dentro de la misma transacción de base de
datos** — o se hacen los dos, o no se hace ninguno.

## 2. Tecnologías utilizadas (resumen hablado)

- **Frontend:** React 19 + Vite, con React Router para las rutas y Axios
  para hablar con la API.
- **Backend:** Node.js + Express 5, con SQLite (`better-sqlite3`) como
  base de datos — un solo archivo, sin necesidad de levantar un servidor
  de base de datos separado.
- **Autenticación:** JWT, con contraseñas guardadas con `bcrypt` (nunca en
  texto plano).
- **Pruebas:** Python + Playwright, controlando un navegador real contra
  la aplicación real.

## 3. Arquitectura (cómo explicarla en simple)

A diferencia de `FinanzasGT` (el proyecto del primer parcial, que sí era
de microservicios porque solo un servicio podía hablar con el SOAP del
Banguat), aquí el dominio de negocio — productos, inventario y facturas —
sigue viviendo en **un solo backend**, `facturacion-service`: son un
mismo dominio de negocio y dividirlo en varios servicios habría sido
complejidad sin beneficio real. El frontend habla con ese backend por
HTTP/JSON, y es el único que toca la base de datos SQLite.

Esto no significa que todo el proyecto sea un solo backend: el tipo de
cambio es la excepción. Facturar en dólares requiere la tasa real del
Banco de Guatemala, y ese SOAP de Banguat solo puede ser consumido por un
componente — el mismo principio que ya obligaba a `FinanzasGT` a tener su
propio `exchange-service` separado. Por eso este proyecto reutiliza ese
mismo `exchange-service` tal cual, como un **segundo backend**,
independiente del dominio de negocio: `facturacion-service` es el único
componente de este proyecto autorizado a hablarle a él (nadie más, ni
siquiera el frontend, le habla directamente).

## 4. Roles y permisos — qué puede hacer cada uno

- **Administrador:** todo lo del vendedor, más crear/editar/eliminar
  productos y ver el historial completo de facturas de todos los
  vendedores.
- **Vendedor:** puede ver el catálogo, generar facturas, y ver únicamente
  su propio historial de facturas.

Ambos roles se autentican con el mismo endpoint de login; el rol viaja
dentro del JWT y cada ruta protegida del backend decide, según ese rol, si
deja pasar la petición.

## 5. La regla de negocio central: la transacción de facturación

Al crear una factura:

1. Se valida cada línea (producto existente, cantidad entera > 0).
2. Se suma cuánto se pide de cada producto **en toda la factura** (si el
   mismo producto aparece en dos líneas, se suman) y se compara contra el
   stock disponible.
3. Si algo no alcanza, se rechaza **toda la factura** — no se crea nada y
   el stock queda intacto.
4. Si todo alcanza, se calcula el IVA (12% fijo), se inserta la factura y
   sus líneas, y se descuenta el stock de cada producto — todo en una sola
   transacción SQLite.

Esto es lo que se va a demostrar en vivo.

## 6. Base de datos

SQLite con 4 tablas: `users`, `products`, `invoices` e `invoice_items`.
Lo más interesante para explicar: `invoice_items` guarda una **copia**
(`product_name`, `unit_price`) del producto al momento de la venta, para
que una factura ya emitida no cambie si después se edita o renombra ese
producto. El número de factura (`FAC-000001`, correlativo) se calcula
dentro de la misma transacción a partir del máximo id existente, para que
nunca se dupliquen ni dependan del reloj de la máquina. La tabla
`invoices` también tiene las columnas `payment_currency`, `exchange_rate`
y `total_usd`, que quedan en `NULL`/`'GTQ'` para una factura en Quetzales
y solo se completan cuando la factura se paga en dólares.

## 7. Manejo de errores

El backend siempre responde `{ error: { code, message } }` con el código
HTTP correcto (400 validación, 401 sin sesión, 403 sin permiso, 404 no
encontrado, 409 conflicto — SKU duplicado o stock insuficiente, 500 error
interno), más un 502 `EXCHANGE_SERVICE_UNAVAILABLE` específico cuando no
se pudo obtener la tasa de cambio del día para una factura en dólares. El
frontend muestra ese mensaje directamente al usuario en un recuadro de
error reutilizable.

## 8. El pipeline de QA automatizado

Además del software, el proyecto entrega un pipeline de pruebas
end-to-end con Playwright controlando un navegador real:

- 7 archivos de prueba, 19 escenarios en total (`test_auth.py`,
  `test_products.py`, `test_invoices.py`, `test_stock_limits.py`,
  `test_usd_payment.py`, `test_compatibility.py`, `test_volume.py`), cada
  uno cubriendo un flujo de negocio completo, no clics sueltos.
- `test_usd_payment.py` es el único de los 7 archivos con una dependencia
  real de internet: crea una factura en dólares, lo que hace que el
  backend llame al `exchange-service` real, y este a su vez al Banco de
  Guatemala real — las demás pruebas son 100% offline.
- `test_compatibility.py` documenta un hallazgo real (no corregido a
  propósito): el Navbar se desborda horizontalmente en un viewport móvil
  de 375px. `test_volume.py` siembra 110 facturas sintéticas vía API para
  probar el historial bajo volumen, sin depender de datos acumulados por
  casualidad.
- Cada prueba grabada en video y con capturas de pantalla en sus pasos
  clave.
- Un solo comando corre toda la batería y genera automáticamente: un
  reporte HTML con resultados, y una presentación PowerPoint con las
  evidencias (capturas + resultado PASO/FALLO de cada escenario, y el
  código fuente de cada prueba al final).

## 9. Demostración en vivo — guion paso a paso

1. **Login administrador** (`admin` / `admin123`) en `/login`.
2. Ir a `/products` y crear un producto nuevo con stock, por ejemplo,
   `5` unidades.
3. Clic en **Cerrar sesión** (en la barra de navegación) e iniciar sesión
   como **vendedor** (`vendedor` / `vendedor123`).
4. Ir a `/invoices/new`, agregar ese producto con cantidad `2`, mostrar
   cómo se calculan subtotal, IVA 12% y total en vivo, y crear la factura.
5. Volver a `/products` (como admin) y mostrar que el stock bajó de `5` a
   `3`.
6. Volver a `/invoices/new` (como admin, sin cambiar de sesión — admin
   también puede crear facturas) y crear otra factura con ese mismo
   producto, con cantidad `1`, pero esta vez eligiendo **Dólares** en el
   selector "Moneda de pago" antes de enviar. El formulario sigue
   mostrando subtotal, IVA 12% y total **en Quetzales** igual que antes —
   la conversión a dólares la hace el backend, no se ve todavía en el
   formulario.
7. Ir a `/invoices` (historial): mostrar que la fila de esa factura, junto
   al total en Quetzales, ahora incluye el equivalente en dólares y la
   tasa del día usada (formato `(≈ $X.XX USD, tasa: Y)`) — las facturas en
   Quetzales no muestran esa parte.
8. Hacer clic en **Ver detalle** de esa factura y mostrar, en el bloque de
   totales, la fila "Equivalente" con el mismo monto en dólares y la misma
   tasa — el mismo dato que en el historial, ahora en la vista individual.
9. Repetir la creación de una factura pero pidiendo **más cantidad de la
   disponible** (por ejemplo, `10` cuando solo hay `2`): mostrar que el
   botón de envío se deshabilita solo, y que si se fuerza la petición al
   backend, este la rechaza con `INSUFFICIENT_STOCK` sin tocar el stock.
10. Ir a `/invoices` como vendedor: mostrar que solo aparece su propia
    factura.
11. Iniciar sesión como admin y volver a `/invoices`: mostrar que ahora
    aparecen **todas** las facturas, con la columna "Vendedor" indicando
    quién generó cada una.
12. Cerrar la demo mostrando `tests/reports/report.html` (resultado de la
    suite completa) y una diapositiva de `tests/reports/evidencia.pptx`
    con la evidencia del mismo flujo que se acaba de demostrar en vivo.

## 10. Automatización con Jenkins — guion paso a paso

El proyecto tiene instalado Jenkins LTS localmente (`http://localhost:8081`),
con un pipeline (`Jenkinsfile`, 7 etapas) que corre toda la batería de
pruebas — 63 pruebas de backend (`node:test`) y 19 E2E (Playwright) — y
publica los resultados individuales en Jenkins vía el plugin JUnit, además
de archivar videos, capturas, el reporte HTML y la presentación PPTX.

**Nota técnica para quien lo demuestre:** el pipeline corre directamente
sobre la carpeta real del proyecto (`customWorkspace`), no sobre una copia
clonada — el plugin Git de Jenkins bloquea por seguridad los checkouts
desde rutas locales del sistema de archivos, y se optó por esto en vez de
debilitar esa protección.

1. Abrir `http://localhost:8081` y mostrar el panel principal de Jenkins,
   con el job `FacturacionGT-Pipeline` y su historial de builds.
2. Entrar al job y mostrar el `Jenkinsfile` (pestaña "Pipeline" en la
   configuración) — explicar brevemente las 7 etapas.
3. Clic en **"Construir ahora"** — mostrar la ejecución en tiempo real
   (Console Output), señalando cómo cada etapa aparece en el "Pipeline
   Overview".
4. Cuando termine (✅ verde, "Finished: SUCCESS"), abrir **"Resultado de
   los tests"**: mostrar "82 — All tests are passing!", con el desglose
   por paquete.
5. Abrir **"Artefactos Generados"**: mostrar `evidencia.pptx`,
   `report.html`, la carpeta `videos/` y `evidence/` — los mismos
   archivos que ya se mostraron en la Sección 9, ahora generados y
   guardados automáticamente por Jenkins, no a mano.
6. **Simulación de fallo controlado:** editar `computeTotals.test.js`
   (un solo valor esperado, p. ej. cambiar `75` por `999` en la primera
   prueba) y guardar — aclarar en voz alta que es un cambio deliberado y
   reversible, solo en el código de la prueba, no en datos reales.
7. Clic en **"Construir ahora"** de nuevo — dejar que falle (etapa 3,
   backend, falla en segundos; las etapas 4-7 se saltan automáticamente
   con el mensaje "skipped due to earlier failure(s)").
8. Mostrar el build en rojo ("Finished: FAILURE") y entrar a **"Resultado
   de los tests"**: Jenkins marca la prueba específica como fallida y la
   etiqueta **"Regresión"** (porque pasaba en el build anterior).
9. Revertir el cambio en `computeTotals.test.js` (volver `999` a `75`) y
   guardar.
10. Clic en **"Construir ahora"** una última vez — mostrar que vuelve a
    quedar en verde, con las 82 pruebas pasando de nuevo.
11. Cerrar mostrando el historial de builds del job (columna izquierda),
    señalando la secuencia visible: éxito → fallo → éxito — evidencia de
    que Jenkins detecta, reporta, y permite corregir sin ambigüedad.
