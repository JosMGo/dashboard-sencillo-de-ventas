# Guía de instalación

Aplicación de escritorio del Dashboard de Cotizaciones y Proyectos.

Para el uso diario, ver [MANUAL-USUARIO.md](MANUAL-USUARIO.md).

---

## Resumen

Hay dos momentos distintos:

| | Dónde | Qué se hace |
|---|---|---|
| **Parte A** | En tu máquina de desarrollo | Generar el instalador `.exe` |
| **Parte B** | En la máquina virtual | Instalar y configurar |

La persona que use el sistema **no necesita instalar Node.js ni nada más**. Solo ejecuta
el `.exe`.

---

## Parte A — Generar el instalador

### Requisitos

- [Node.js](https://nodejs.org) versión 22 o superior (probado con la 24).
- Windows.

Para comprobar que lo tienes:

```powershell
node --version
```

### Pasos

1. Abre PowerShell en la carpeta del proyecto:

```powershell
cd "C:\Users\malva\OneDrive\Desktop\dashboard ventas sencillo"
```

Las comillas son obligatorias porque la ruta tiene espacios.

2. Instala las dependencias (solo la primera vez):

```powershell
npm install
```

3. Genera el instalador:

```powershell
npm run build
```

Al terminar, dentro de la carpeta `dist\` queda un archivo parecido a:

```
Cotizaciones Setup 1.0.0.exe
```

Ese archivo es el que se lleva a la máquina virtual.

### Probar sin instalar

Si solo quieres abrir la aplicación para revisarla:

```powershell
npm start
```

> **Ojo:** `npm start` y la aplicación instalada **usan bases de datos distintas**. Lo que
> captures probando con `npm start` no aparecerá en la versión instalada. No se perdió
> nada; simplemente son dos archivos diferentes. Ver la tabla de rutas más abajo.

---

## Parte B — Instalar en la máquina virtual

### 1. Instalar

Copia el `.exe` a la máquina virtual y ejecútalo. El instalador permite elegir la carpeta
de destino; lo normal es dejar la que propone.

Al terminar queda **Cotizaciones** en el menú de inicio.

### 2. Fijar la carpeta de datos (recomendado)

Por defecto, la base de datos se guarda dentro del perfil del usuario de Windows que
instaló la aplicación. Eso trae un problema: **si algún día se entra con otra cuenta de
Windows, el sistema aparece vacío**, porque estaría leyendo otra carpeta.

Para evitarlo, fija una carpeta única. Crea un archivo llamado `config.json` **junto al
ejecutable instalado** (normalmente `C:\Program Files\Cotizaciones\`) con este contenido:

```json
{
  "carpetaDatos": "C:/DatosCotizaciones"
}
```

La aplicación crea esa carpeta sola la primera vez que arranca.

Usa barras normales `/` o barras dobles `\\`. Una sola barra invertida rompe el archivo.

Como alternativa, sirve una variable de entorno del sistema:

```
COTIZACIONES_DATOS=C:\DatosCotizaciones
```

### 3. Dar permisos

El usuario que vaya a trabajar necesita permisos de **lectura y escritura** sobre esa
carpeta.

### 4. Comprobar

Abre la aplicación. Al pie de la ventana debe aparecer la ruta que configuraste:

```
Base de datos SQLite: C:\DatosCotizaciones\cotizaciones.db
```

Si dice otra ruta, el `config.json` no se está leyendo: revisa que esté junto al `.exe` y
que el JSON sea válido.

---

## Cómo funciona la base de datos

### Qué es

Una base de datos **SQLite**: un único archivo en el disco duro. No hay servidor, no hay
servicio que administrar, no hay puertos ni conexiones.

Tiene dos tablas:

| Tabla | Contenido |
|---|---|
| `registros` | Las cotizaciones y proyectos |
| `metas` | La meta de venta de cada mes |

### Cuándo se guarda

**En el instante de cada acción, no al cerrar.** Cada vez que se guarda un formulario, se
marca una casilla, se elimina un registro o se guarda una meta, el dato baja a disco de
inmediato.

Consecuencias prácticas:

- Cerrar la aplicación no guarda nada, porque ya estaba guardado.
- Un corte de luz o un apagón de la máquina **no pierde información**. Está comprobado:
  escribir sin cerrar la aplicación y volver a abrirla recupera todos los registros.
- Al abrir, la aplicación lee el archivo completo y lo muestra.

### Los tres archivos

La base usa modo WAL (*Write-Ahead Logging*), que es lo que la hace resistente a cierres
inesperados. Por eso verás distinto número de archivos según el momento:

**Con la aplicación abierta:**

```
cotizaciones.db
cotizaciones.db-wal    <- escrituras recientes
cotizaciones.db-shm    <- índice de apoyo
```

**Con la aplicación cerrada:**

```
cotizaciones.db        <- todo consolidado aquí
```

Los tres archivos son **un solo conjunto**. Nunca borres el `-wal` a mano con la
aplicación abierta: ahí puede estar lo último que se capturó.

### Dónde queda el archivo

| Cómo se abre | Ruta |
|---|---|
| Con `config.json` configurado | La carpeta que indicaste |
| Instalada, sin configurar | `C:\Users\<usuario>\AppData\Roaming\Cotizaciones\` |
| Con `npm start` | `C:\Users\<usuario>\AppData\Roaming\dashboard-cotizaciones\` |

La ruta real siempre se muestra al pie de la ventana.

### Verlo por fuera

`cotizaciones.db` es un archivo SQLite estándar. Puedes abrirlo con
[DB Browser for SQLite](https://sqlitebrowser.org/) para consultarlo o sacar reportes
propios. Hazlo con la aplicación cerrada.

---

## Respaldo

La aplicación **no tiene botón de respaldo**. El respaldo es copiar el archivo.

### Procedimiento

1. **Cierra la aplicación.** Esto es importante: al cerrar, todo se consolida en
   `cotizaciones.db` y desaparecen los archivos `-wal` y `-shm`.
2. Copia `cotizaciones.db` a otro disco, a una carpeta de red o a la nube.
3. Ponle la fecha en el nombre: `cotizaciones-2026-09-02.db`.

### Restaurar

Con la aplicación cerrada, copia el respaldo de vuelta a la carpeta de datos y renómbralo
a `cotizaciones.db`, reemplazando el que esté.

### Con qué frecuencia

Al menos una vez por semana, y siempre al cerrar el mes. **Si ese archivo se pierde, no
hay forma de recuperar la información**: no existe copia en ningún otro lado.

Lo más seguro es que la máquina virtual tenga respaldo automático, o que la carpeta
`C:\DatosCotizaciones` esté sincronizada con OneDrive o similar.

---

## Actualizar la aplicación

1. Genera el nuevo instalador con `npm run build`.
2. Ejecútalo en la máquina virtual, encima de la versión anterior.

**Los datos no se tocan.** La base vive fuera de la carpeta del programa, así que
actualizar no borra nada. Aun así, haz un respaldo antes.

---

## Desinstalar

Desde *Panel de control → Programas → Cotizaciones*.

Desinstalar **no borra la base de datos**. Si además quieres eliminar la información, hay
que borrar la carpeta de datos a mano. Y si el plan es reinstalar más adelante, guarda
antes una copia de `cotizaciones.db`.

---

## Advertencias importantes

- **La carpeta de datos debe estar en el disco local de la máquina.** No pongas la base en
  una unidad de red ni en una carpeta compartida por SMB: SQLite no es confiable sobre red
  y el archivo se puede corromper. Sincronizar la carpeta con la nube está bien, siempre
  que la aplicación se cierre antes de que suba.
- **Una persona a la vez.** El sistema está pensado para el administrador que lleva el
  registro. Los datos se cargan al abrir, así que si alguien más los modificara por fuera,
  habría que cerrar y volver a abrir para verlos.
- **No hay usuarios ni contraseñas en la aplicación.** El control de acceso es el de la
  máquina virtual: quien pueda entrar puede ver, editar y borrar todo, y no queda registro
  de quién hizo cada cambio.

---

## Si algo falla

**La ventana abre en blanco**
Pulsa `Ctrl+Shift+I` para abrir las herramientas de desarrollo y revisa la pestaña
Console. Suele indicar el archivo y la línea del problema.

**Al pie dice "Guardado en este navegador (localStorage)"**
Estás viendo `index.html` abierto en un navegador, no la aplicación. Ábrela desde el menú
de inicio.

**Sale un aviso amarillo de que no se están guardando los datos**
La aplicación no puede escribir en la carpeta de datos. Revisa los permisos y que la ruta
del `config.json` exista.

**`npm run build` falla**
Verifica que la ruta del proyecto no haya cambiado y que `npm install` se haya completado.

**La aplicación aparece vacía después de haber capturado datos**
Casi siempre es que está leyendo otra carpeta. Compara la ruta del pie de la ventana con
la que esperabas. Suele pasar al entrar con otra cuenta de Windows sin haber configurado
`config.json`.

---

## Nota técnica

El SQLite que se usa es `node:sqlite`, el que viene incluido en Node 24 (Electron 44 lo
trae dentro). **No hay dependencias nativas que compilar**, lo que evita un problema
conocido: `node-gyp` no puede compilar módulos en rutas que contienen espacios, y esta
carpeta los tiene.

La ventana usa `contextIsolation: true` y `nodeIntegration: false`. La página no tiene
acceso directo a Node ni al sistema de archivos: solo puede llamar a los métodos que
expone `preload.js`.

| Archivo | Qué hace |
|---|---|
| `main.js` | Abre la ventana, decide la carpeta de datos y atiende el guardado |
| `preload.js` | Puente entre la página y la base de datos |
| `db.js` | Las consultas SQL |
| `almacen.js` | Decide si guardar en SQLite o en el navegador |
| `index.html`, `styles.css`, `app.js` | La interfaz, compartida con la versión web |
