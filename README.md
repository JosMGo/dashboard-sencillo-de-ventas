# Dashboard de Cotizaciones y Proyectos

Sistema sencillo para registrar y dar seguimiento a cotizaciones y proyectos, con metas
mensuales, semáforo de cumplimiento y métricas por empresa.

Hecho con **HTML5, CSS3 y JavaScript vanilla**. Sin React, sin Vue, sin Angular y sin
servidor.

---

## Documentación

| Documento | Para quién |
|---|---|
| **[MANUAL-USUARIO.md](MANUAL-USUARIO.md)** | Quien va a usar el sistema todos los días |
| **[INSTALACION.md](INSTALACION.md)** | Quien instala y mantiene la aplicación de escritorio |

---

## Dos versiones, el mismo código

| | Versión escritorio | Versión web |
|---|---|---|
| Cómo se abre | Instalador `.exe`, o `npm start` | Doble clic en `index.html`, o GitHub Pages |
| Dónde guarda | **SQLite** (`cotizaciones.db`) en el disco | `localStorage` del navegador |
| Se puede respaldar | Sí, copiando un archivo | No |
| Instalar algo | Sí | No |
| Funciona en celular | No | Sí |

**La versión de escritorio es la buena para llevar la información de la empresa**, porque
los datos quedan en un archivo que se puede copiar y respaldar. La versión web sirve para
consultar o para probar.

La interfaz es idéntica en las dos: `almacen.js` detecta dónde se está ejecutando y elige
el guardado que corresponde.

---

## Funciones

- Cinco tarjetas: total de proyectos, total cotizado, ventas realizadas, total cobrado y
  pendiente de cobro.
- **Meta de venta mensual**, capturada a mano, con semáforo verde / ámbar / rojo.
- **Métricas por empresa**: tabla comparativa con una fila por empresa (SIRT, ANARTEC,
  LUCMAR y las que se vayan creando).
- Métricas: tasa de conversión, ticket promedio cotizado, ticket promedio vendido y
  avance de cobro.
- Gráfica de barras "cotizado vs. vendido" por mes, sin librerías.
- Ranking de las 5 empresas con mayor monto cotizado.
- Buscador por empresa o proyecto, y filtros por mes y por año.
- Fecha de cada cotización elegible al crearla o editarla (meses y años anteriores, nunca
  futura). Propone hoy, o el mes que se esté mirando si ya pasó.
- Casillas de **Venta** y **Se cobró** editables desde la misma tabla.
- Editar y eliminar registros, con confirmación al eliminar.
- Montos formateados como moneda.

---

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `app.js` | Toda la lógica del dashboard |
| `almacen.js` | Decide dónde guardar: SQLite o localStorage |
| `main.js`, `preload.js`, `db.js` | Solo la aplicación de escritorio |
| `config.ejemplo.json` | Plantilla para fijar la carpeta de datos |

---

## Ajustes que se hacen en el código

### Moneda

En las primeras líneas de `app.js`:

```js
const LOCALE = "es-BO";
const MONEDA = "BOB";
```

Ejemplos: Venezuela `"es-VE"` / `"VES"`, México `"es-MX"` / `"MXN"`,
Colombia `"es-CO"` / `"COP"`, España `"es-ES"` / `"EUR"`.

### Umbrales del semáforo

También al inicio de `app.js`:

```js
const META_VERDE = 100;   // desde este % se pinta verde
const META_AMBAR = 70;    // desde este % se pinta ámbar; abajo, rojo
```

---

## Publicar la versión web en GitHub Pages

1. Sube los archivos a un repositorio de GitHub.
2. Ve a **Settings → Pages**.
3. En *Source* elige la rama `main` y la carpeta `/ (root)`.
4. Espera un minuto: queda en `https://TU-USUARIO.github.io/TU-REPOSITORIO/`

### Si la versión web no guarda los datos

Usa `localStorage`. Si al volver a abrir aparece vacía, casi siempre es una de estas:

1. **El navegador borra los datos al cerrar.** En Chrome/Edge, *Configuración → Privacidad
   → Cookies → "Eliminar cookies y datos de sitios al cerrar todas las ventanas"*.
   Desactívalo.
2. **Ventana de incógnito.** Ahí siempre se borra al cerrar.
3. **Safari abriendo el archivo local.** Safari bloquea `localStorage` en `file://`.
4. **Se movió o renombró la carpeta.** Para el navegador, la ruta forma parte de la
   identidad del sitio.

Si el navegador está bloqueando el almacenamiento, la página muestra un aviso amarillo al
cargar.

Usarla desde GitHub Pages (`https://`) es más estable que abrir el archivo local. Aun así,
**para información formal usa la versión de escritorio**: la web no se puede respaldar.
