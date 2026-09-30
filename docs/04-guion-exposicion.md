# Guion de Exposición — Sistema de Facturación e Inventario

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
Banguat), aquí **hay un solo backend**. Productos, inventario y facturas
son un mismo dominio de negocio — dividirlo en varios servicios habría
sido complejidad sin beneficio real. El frontend habla con ese único
backend por HTTP/JSON, y el backend es el único que toca la base de
datos.

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
nunca se dupliquen ni dependan del reloj de la máquina.

## 7. Manejo de errores

El backend siempre responde `{ error: { code, message } }` con el código
HTTP correcto (400 validación, 401 sin sesión, 403 sin permiso, 404 no
encontrado, 409 conflicto — SKU duplicado o stock insuficiente, 500 error
interno). El frontend muestra ese mensaje directamente al usuario en un
recuadro de error reutilizable.

## 8. El pipeline de QA automatizado

Además del software, el proyecto entrega un pipeline de pruebas
end-to-end con Playwright controlando un navegador real:

- 4 archivos de prueba (`test_auth.py`, `test_products.py`,
  `test_invoices.py`, `test_stock_limits.py`), cada uno cubriendo un flujo
  de negocio completo, no clics sueltos.
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
3. **Cerrar sesión** (borrar el almacenamiento local o abrir una ventana
   privada) e iniciar sesión como **vendedor** (`vendedor` / `vendedor123`).
4. Ir a `/invoices/new`, agregar ese producto con cantidad `2`, mostrar
   cómo se calculan subtotal, IVA 12% y total en vivo, y crear la factura.
5. Volver a `/products` (como admin) y mostrar que el stock bajó de `5` a
   `3`.
6. Repetir la creación de una factura pero pidiendo **más cantidad de la
   disponible** (por ejemplo, `10` cuando solo hay `3`): mostrar que el
   botón de envío se deshabilita solo, y que si se fuerza la petición al
   backend, este la rechaza con `INSUFFICIENT_STOCK` sin tocar el stock.
7. Ir a `/invoices` como vendedor: mostrar que solo aparece su propia
   factura.
8. Iniciar sesión como admin y volver a `/invoices`: mostrar que ahora
   aparecen **todas** las facturas, con la columna "Vendedor" indicando
   quién generó cada una.
9. Cerrar la demo mostrando `tests/reports/report.html` (resultado de la
   suite completa) y una diapositiva de `tests/reports/evidencia.pptx`
   con la evidencia del mismo flujo que se acaba de demostrar en vivo.
