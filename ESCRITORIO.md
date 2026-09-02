# Aplicación de escritorio (SQLite)

Esta es la versión que se instala en la máquina de cada persona y guarda los datos
en una base **SQLite real** en el disco duro, no en el navegador.

## Cómo ejecutarla en tu máquina

Necesitas [Node.js](https://nodejs.org) instalado. Una sola vez:

```
npm install
```

Y para abrirla:

```
npm start
```

## Cómo generar el instalador para otra persona

```
npm run build
```

Esto crea la carpeta `dist/` con un instalador `.exe`. Esa persona lo ejecuta,
instala la aplicación como cualquier otro programa de Windows, y listo: no necesita
Node.js ni nada más. Le aparece en el menú de inicio como **Cotizaciones**.

## Instalación en una máquina virtual compartida

Este es el caso de "la app vive en una VM y entra quien sea del equipo de ventas".

**Paso obligatorio.** Por defecto la base se guarda en la carpeta del usuario de Windows,
así que si cada persona entra con su propia cuenta, cada una tendría una base distinta.
Para que todos vean lo mismo, hay que fijar una carpeta común.

Crea un archivo `config.json` **junto al ejecutable instalado**
(normalmente `C:\Program Files\Cotizaciones\`) con este contenido:

```json
{
  "carpetaDatos": "C:/DatosCotizaciones"
}
```

La aplicación crea esa carpeta sola la primera vez. A partir de ahí, entre quien entre a
la VM, todos trabajan sobre la misma base.

También funciona con una variable de entorno del sistema, si prefieres no tocar archivos:

```
COTIZACIONES_DATOS=C:\DatosCotizaciones
```

Da permisos de lectura y escritura sobre esa carpeta a todos los usuarios que vayan a
usar la aplicación.

### Reglas para que no haya problemas

- **La carpeta debe estar en el disco local de la VM.** No uses una unidad de red ni una
  carpeta compartida por SMB: SQLite no es confiable sobre red y la base se puede corromper.
- **Si dos personas la usan al mismo tiempo**, los datos no se pierden (SQLite lo maneja
  bien), pero cada quien ve la foto de cuando abrió la app. Para ver lo que capturó el
  otro está el botón **Actualizar**. También se refresca solo al volver a la ventana.
- **Con Windows 10 u 11 solo entra una persona a la vez** por Escritorio Remoto. Eso en
  realidad simplifica todo. Varias sesiones simultáneas requieren Windows Server con RDS.
- **No hay usuarios ni contraseñas.** Cualquiera que entre a la VM puede ver, editar y
  borrar todos los registros, y no queda constancia de quién hizo cada cambio.
- **Respalda la carpeta.** Es un solo archivo; basta con copiarlo periódicamente.

## Dónde quedan los datos

En un archivo `cotizaciones.db`. Si no configuraste nada, queda en la carpeta del
usuario de Windows:

```
C:\Users\<usuario>\AppData\Roaming\Cotizaciones\cotizaciones.db
```

Si configuraste `config.json` o la variable de entorno, queda en la carpeta que indicaste.

La ruta exacta se muestra siempre en el pie de la ventana.

Tiene dos tablas: `registros` (las cotizaciones) y `metas` (la meta de cada mes).

Es un archivo SQLite normal. Puedes abrirlo con
[DB Browser for SQLite](https://sqlitebrowser.org/) para verlo o consultarlo,
y respaldarlo simplemente copiándolo.

Importante: **los datos son de esa máquina**. Cada persona que instale la aplicación
tendrá su propia base. No se comparten entre computadoras. Para pasar información de
una a otra se usan los botones *Exportar copia* e *Importar copia*.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `main.js` | Abre la ventana y atiende las peticiones de guardado |
| `preload.js` | Puente seguro entre la página y la base de datos |
| `db.js` | Todas las consultas SQL |
| `almacen.js` | Decide si guardar en SQLite o en el navegador |

La interfaz (`index.html`, `styles.css`, `app.js`) es **exactamente la misma** que la
versión web. `almacen.js` detecta dónde se está ejecutando: si encuentra `window.api`
usa SQLite, y si no, usa `localStorage`. Por eso el mismo repositorio sirve para las
dos cosas sin duplicar código.

## Nota técnica

SQLite viene incluido en Node 24 (`node:sqlite`), así que **no hay dependencias
nativas que compilar**. Esto también evita un problema conocido: `node-gyp` no puede
compilar en rutas que contienen espacios, y esta carpeta tiene espacios en el nombre.

## Seguridad

La ventana usa `contextIsolation: true` y `nodeIntegration: false`. La página no tiene
acceso directo a Node ni al sistema de archivos: solo puede llamar a los seis métodos
que expone `preload.js`.
