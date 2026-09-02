# Dashboard de Cotizaciones y Proyectos

Dashboard web sencillo para registrar y dar seguimiento a cotizaciones y proyectos.
Hecho con **HTML5, CSS3 y JavaScript vanilla**. Sin frameworks y sin backend:
todos los datos se guardan en el `localStorage` del navegador.

## Cómo usarlo

Abre el archivo `index.html` con doble clic. Eso es todo.

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `app.js` | Toda la lógica y el guardado en localStorage |

## Funciones

- Tarjetas con: total de proyectos, total cotizado, ventas realizadas, total cobrado y pendiente de cobro.
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

## Cambiar la moneda

En las primeras líneas de `app.js`:

```js
const LOCALE = "es-MX";
const MONEDA = "MXN";
```

Ejemplos: `"es-CO"` / `"COP"`, `"es-CL"` / `"CLP"`, `"es-ES"` / `"EUR"`, `"en-US"` / `"USD"`.

## Publicar en GitHub Pages

1. Sube los archivos a un repositorio de GitHub.
2. En el repositorio ve a **Settings → Pages**.
3. En *Source* elige la rama `main` y la carpeta `/ (root)`.
4. Guarda y espera un minuto: tu dashboard quedará en
   `https://TU-USUARIO.github.io/TU-REPOSITORIO/`

## Nota sobre los datos

Los datos viven en el navegador de cada persona (`localStorage`).
No se comparten entre distintos equipos ni navegadores, y se pierden
si se borran los datos del sitio.
