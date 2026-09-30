# Manual de Usuario — Sistema de Facturación e Inventario

> La aplicación tiene una barra de navegación fija en la parte superior de
> cada pantalla (excepto en `/login`), con enlaces a las secciones
> disponibles según el rol, el usuario conectado y el botón para cerrar
> sesión. Este manual también indica la ruta exacta de cada pantalla.

## 1. Iniciar sesión (`/login`)

Al abrir la aplicación se muestra la pantalla de login, con dos campos:

- **Usuario**
- **Contraseña**

Y un botón **Ingresar**. Con las cuentas por defecto (creadas por el
script de seed):

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Vendedor | `vendedor` | `vendedor123` |

Si el usuario o la contraseña son incorrectos, se muestra el mensaje
**"Usuario o contraseña incorrectos"** debajo del formulario (el sistema
no distingue si el usuario no existe o si la contraseña es la incorrecta,
por seguridad). Al iniciar sesión correctamente, se redirige a la página
principal (`/`).

La sesión se guarda en el navegador (almacenamiento local) y se mantiene
mientras el token no expire (8 horas por defecto) o mientras no se cierre
sesión manualmente con el botón **Cerrar sesión** de la barra de
navegación.

## 2. Barra de navegación

Visible en todas las pantallas protegidas (es decir, en todas excepto
`/login`). Muestra:

- El nombre del sistema ("Sistema de Facturación").
- Enlaces a **Inicio** (`/`), **Nueva factura** (`/invoices/new`) e
  **Historial** (`/invoices`), disponibles para ambos roles.
- Enlace a **Productos** (`/products`), visible únicamente para el rol
  **admin** (el vendedor no ve este enlace, ya que no tiene acceso a esa
  pantalla).
- El usuario conectado y su rol (por ejemplo, "admin (admin)").
- El botón **Cerrar sesión**, que termina la sesión y regresa a la
  pantalla de login.

## 3. Página principal (`/`)

Solo muestra el título "Sistema de Facturación". Para ir a las demás
pantallas se usan los enlaces de la barra de navegación.

## 4. Administrador — gestionar productos e inventario (`/products`)

Pantalla exclusiva del rol **admin**. Si un vendedor intenta entrar a esta
URL, es redirigido automáticamente a `/`.

### 4.1 Ver el catálogo

La tabla de productos muestra: **Nombre**, **SKU**, **Categoría**,
**Precio**, **Stock** y **Acciones**. El stock se muestra como una
etiqueta: verde con el número disponible, o roja con el texto **"Sin
stock"** cuando llega a 0.

### 4.2 Crear un producto

1. Clic en **Nuevo producto**.
2. Completar el formulario: **Nombre**, **SKU**, **Precio**, **Stock**
   (todos obligatorios) y **Categoría** (opcional).
3. Clic en **Crear**.

Validaciones:

- Nombre y SKU no pueden estar vacíos.
- El precio debe ser mayor que 0.
- El stock no puede ser negativo.
- Si el SKU ya existe en otro producto, el formulario muestra el error
  **"El SKU ya existe"** directamente junto al campo SKU (no como un
  error general).

### 4.3 Editar un producto

1. Clic en **Editar** en la fila del producto.
2. El mismo formulario aparece con los valores actuales cargados.
3. Modificar lo necesario y clic en **Guardar cambios** (o **Cancelar**
   para descartar).

Las mismas validaciones de creación aplican, incluyendo el chequeo de SKU
duplicado (el producto puede conservar su propio SKU sin que se marque
como duplicado).

> **Ajustar solo el stock:** la aplicación no tiene un control dedicado
> para sumar/restar unidades de stock sin tocar el resto del producto. En
> la práctica, para ajustar el inventario manualmente hay que editar el
> producto y cambiar el campo **Stock** al valor final deseado.

### 4.4 Eliminar un producto

Clic en **Eliminar** en la fila del producto. El navegador pide
confirmación ("¿Eliminar el producto "{nombre}"?"); si se confirma, el
producto se borra de la lista.

## 5. Ambos roles — generar una factura (`/invoices/new`)

Disponible para **admin** y **vendedor**.

1. Completar **Cliente** (obligatorio) y, opcionalmente, **NIT** (si se
   deja vacío, la factura queda a nombre de "CF" — consumidor final).
2. En la sección **Agregar producto**: elegir un producto del selector
   (muestra nombre, precio y stock disponible) y una **Cantidad** (entero,
   mínimo 1), luego clic en **Agregar**. El producto se suma al detalle de
   la factura; si se agrega el mismo producto dos veces, las cantidades se
   acumulan en una sola línea.
3. En el detalle de la factura se puede ajustar la cantidad de cada línea
   o quitarla con el botón correspondiente.
4. Debajo del detalle se muestran, en vivo, **Subtotal**, **IVA (12%)** y
   **Total**.
5. Clic en **Crear factura**.

El botón **Crear factura** permanece deshabilitado mientras:

- no se haya agregado ningún producto al detalle,
- el campo **Cliente** esté vacío, o
- alguna línea pida más cantidad de la que hay en stock (la app avisa
  **antes** de enviar la petición al backend).

Si aun así el stock cambió entre que se cargó la pantalla y se envió la
factura (por ejemplo, otra venta consumió el stock), el backend rechaza la
operación completa con el error **"Stock insuficiente para {producto}"**
y no se crea ninguna factura ni se modifica el inventario.

Al crear la factura exitosamente, aparece un mensaje de confirmación con
el número de factura (formato `FAC-000001`) y el total, y el formulario se
limpia para la siguiente venta. El stock de los productos vendidos queda
descontado de inmediato.

## 6. Ambos roles — historial de facturas (`/invoices`)

Disponible para **admin** y **vendedor**, pero con alcance distinto:

- **Vendedor:** ve únicamente las facturas que él mismo generó.
- **Administrador:** ve **todas** las facturas del sistema, sin importar
  quién las generó.

La tabla muestra: **No. Factura**, **Cliente**, **NIT**, **Fecha**,
**Vendedor** (usuario que generó la factura) y **Total**. Si no hay
facturas para mostrar, aparece el texto "No hay facturas registradas."

## 7. Mensajes de carga y de error

Mientras se cargan datos (productos, facturas), se muestra un indicador de
carga. Los errores devueltos por el backend (por ejemplo, sesión expirada,
producto no encontrado, stock insuficiente) se muestran en un recuadro rojo
con el mensaje exacto que envía la API.
