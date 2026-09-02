# Dashboard de Cotizaciones y Proyectos

Dashboard web sencillo para registrar y dar seguimiento a cotizaciones y proyectos.
Hecho con **HTML5, CSS3 y JavaScript vanilla**. Sin frameworks y sin backend:
todos los datos se guardan en el `localStorage` del navegador.

## Dos versiones, el mismo código

| | Versión web | Versión escritorio |
|---|---|---|
| Cómo se abre | Doble clic en `index.html`, o el link de GitHub Pages | `npm start`, o el instalador `.exe` |
| Dónde guarda | `localStorage` del navegador | **SQLite** (`cotizaciones.db`) en el disco |
| Instalar algo | No | Sí |
| Funciona en celular | Sí | No |

La interfaz es idéntica en las dos. `almacen.js` detecta dónde se está ejecutando y
elige el guardado que corresponde.

Para la versión de escritorio, ver **[ESCRITORIO.md](ESCRITORIO.md)**.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `app.js` | Toda la lógica del dashboard |
| `almacen.js` | Decide dónde guardar: SQLite o localStorage |
| `main.js`, `preload.js`, `db.js` | Solo la app de escritorio |

## Funciones

- Tarjetas con: total de proyectos, total cotizado, ventas realizadas, total cobrado y pendiente de cobro.
- **Meta de venta mensual**, capturada a mano, con semáforo verde / ámbar / rojo.
- **Métricas por empresa**: tabla comparativa con una fila por empresa (SIRT, ANARTEC,
  LUCMAR y las que se vayan creando), filtrable por mes y año.
- Métricas: tasa de conversión, ticket promedio cotizado, ticket promedio vendido y avance de cobro.
- Gráfica de barras "cotizado vs. vendido" por mes (sin librerías, solo CSS).
- Ranking de las 5 empresas con mayor monto cotizado.
- Tabla ordenada del registro más reciente al más antiguo.
- Fecha y hora automáticas al crear cada registro.
- Checkboxes de **Venta** y **Se cobró** editables desde la misma tabla.
- Buscador por empresa o proyecto.
- Filtro por mes y por año (los totales se recalculan solos).
- Editar y eliminar registros (eliminar pide confirmación).
- Precios formateados como moneda.

## La meta y el semáforo

La meta es **global y mensual**: un solo monto que persiguen todas las empresas juntas.

1. Elige un mes y un año concretos en los filtros.
2. Escribe el monto en "Meta de venta" y pulsa Guardar.

La meta se compara contra el **monto vendido** (las cotizaciones marcadas como Venta).
Los colores son:

| Avance | Color |
|---|---|
| 100% o más | Verde |
| 70% a 99% | Ámbar |
| Menos de 70% | Rojo |

Se pintan el porcentaje de avance, la barra, el mensaje de estado y la celda de total
de la tabla por empresa.

Con el mes en "Todos" se muestra la suma de las metas del periodo, pero no se puede
editar: hay que elegir un mes concreto para capturarla.

Para cambiar los umbrales, edita `META_VERDE` y `META_AMBAR` al inicio de `app.js`.

## Métricas por empresa

La tabla comparativa muestra, por cada empresa: número de cotizaciones, cotizado,
vendido, cobrado, pendiente, tasa de conversión y cuánto aporta a la meta del periodo.
La última fila es el total, y es la que lleva el semáforo.

Las empresas **no se dan de alta en ningún lado**: aparecen solas en cuanto alguien
captura una cotización con ese nombre. Para evitar duplicados por escribir el nombre
distinto ("SIRT" y "Sirt "), el campo Empresa sugiere las que ya existen.

## Cambiar la moneda

En las primeras líneas de `app.js`:

```js
const LOCALE = "es-BO";
const MONEDA = "BOB";
```

Ejemplos: Venezuela `"es-VE"` / `"VES"`, México `"es-MX"` / `"MXN"`,
Colombia `"es-CO"` / `"COP"`, España `"es-ES"` / `"EUR"`.

## Publicar en GitHub Pages

1. Sube los archivos a un repositorio de GitHub.
2. En el repositorio ve a **Settings → Pages**.
3. En *Source* elige la rama `main` y la carpeta `/ (root)`.
4. Guarda y espera un minuto: tu dashboard quedará en
   `https://TU-USUARIO.github.io/TU-REPOSITORIO/`

## Copia de seguridad (Exportar / Importar)

Los botones **Exportar copia** e **Importar copia** de la barra superior descargan y
cargan un archivo `.json` con todos los registros. Úsalos para:

- Guardar un respaldo real fuera del navegador.
- Pasar los datos a otra computadora o a otro navegador.
- Recuperar la información si el navegador borra el almacenamiento.

## Si los datos no se guardan al cerrar

El dashboard usa `localStorage`. Si al volver a abrir aparece vacío, casi siempre es
una de estas causas:

1. **El navegador borra los datos al cerrar.** En Chrome/Edge revisa
   *Configuración → Privacidad → Cookies → "Eliminar cookies y datos de sitios al cerrar
   todas las ventanas"* y desactívalo. En Firefox, *Configuración → Privacidad →
   "Eliminar cookies y datos del sitio cuando se cierre Firefox"*.
2. **Ventana de incógnito / privada.** Ahí el almacenamiento se borra siempre al cerrar.
3. **Safari abriendo el archivo local.** Safari bloquea `localStorage` en archivos
   `file://`. Usa Chrome, Edge o Firefox, o publica el proyecto en GitHub Pages.
4. **Se movió o renombró la carpeta.** Al abrirlo como archivo local, la ruta forma parte
   de la identidad del sitio para el navegador.

Si el navegador está bloqueando el almacenamiento, la página muestra un aviso amarillo
en la parte superior al cargar.

**La opción más estable es publicarlo en GitHub Pages** y usarlo siempre desde esa
dirección `https://`: ahí el almacenamiento del navegador es mucho más confiable que
con archivos locales.

## Nota sobre los datos

Los datos viven en el navegador de cada persona (`localStorage`).
No se comparten entre distintos equipos ni navegadores, y se pierden
si se borran los datos del sitio.
