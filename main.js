/* =========================================================
   Proceso principal de Electron

   Abre la ventana, carga index.html (el mismo del sitio web)
   y atiende las peticiones de guardado contra SQLite.
   ========================================================= */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const db = require("./db");

let ventana = null;

/* ---------------------------------------------------------
   ¿Dónde se guarda la base de datos?

   Orden de prioridad:

   1. La variable de entorno COTIZACIONES_DATOS
   2. El archivo config.json que está junto a la aplicación
   3. La carpeta de datos del usuario de Windows (por defecto)

   Las dos primeras sirven para que TODOS los usuarios de una
   misma máquina (por ejemplo una máquina virtual compartida)
   trabajen sobre la misma base, sin importar con qué cuenta
   de Windows hayan entrado.
   --------------------------------------------------------- */
function carpetaDeDatos() {
  if (process.env.COTIZACIONES_DATOS) {
    return process.env.COTIZACIONES_DATOS;
  }

  /* config.json puede estar junto al .exe instalado o junto al
     código cuando se ejecuta con "npm start" */
  const posibles = [
    path.join(path.dirname(app.getPath("exe")), "config.json"),
    path.join(__dirname, "config.json")
  ];

  for (const ruta of posibles) {
    try {
      if (!fs.existsSync(ruta)) continue;
      const config = JSON.parse(fs.readFileSync(ruta, "utf8"));
      if (config.carpetaDatos) return config.carpetaDatos;
    } catch (e) {
      console.error("config.json no se pudo leer:", ruta, e.message);
    }
  }

  return app.getPath("userData");
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: "Cotizaciones y Proyectos",
    backgroundColor: "#f5f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      /* La página no tiene acceso directo a Node: todo pasa
         por preload.js y los canales de abajo */
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  ventana.setMenuBarVisibility(false);
  ventana.loadFile("index.html");

  /* Fuera de la versión instalada, los errores de la página se
     muestran en la terminal. Ayuda a diagnosticar problemas. */
  if (!app.isPackaged) {
    ventana.webContents.on("console-message", function (e, nivel, mensaje) {
      if (nivel >= 2) console.log("[página]", mensaje);
    });
  }
}

app.whenReady().then(function () {
  const carpeta = carpetaDeDatos();

  /* Si la carpeta configurada no existe todavía, se crea */
  fs.mkdirSync(carpeta, { recursive: true });

  console.log("Base de datos en:", db.abrir(carpeta));
  crearVentana();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", function () {
  db.cerrar();
  if (process.platform !== "darwin") app.quit();
});

/* ---------------------------------------------------------
   Canales que usa preload.js
   --------------------------------------------------------- */
ipcMain.handle("listar", function () {
  return db.listar();
});

ipcMain.handle("crear", function (evento, registro) {
  db.crear(registro);
});

ipcMain.handle("actualizar", function (evento, registro) {
  db.actualizar(registro);
});

ipcMain.handle("eliminar", function (evento, id) {
  db.eliminar(id);
});

ipcMain.handle("reemplazar", function (evento, lista) {
  db.reemplazar(lista);
});

ipcMain.handle("leerMetas", function () {
  return db.leerMetas();
});

ipcMain.handle("guardarMeta", function (evento, periodo, monto) {
  db.guardarMeta(periodo, monto);
});

ipcMain.handle("info", function () {
  return db.info();
});
