/* =========================================================
   Base de datos SQLite (solo app de escritorio)

   Usa node:sqlite, el SQLite que ya viene incluido en Node.
   No hay que instalar ni compilar nada.

   Se ejecuta en el proceso principal de Electron, nunca en la
   página. El archivo .db queda en la carpeta de datos del
   usuario, así que sobrevive a las actualizaciones de la app.
   ========================================================= */

const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let db = null;
let rutaArchivo = "";

function abrir(carpetaDatos) {
  rutaArchivo = path.join(carpetaDatos, "cotizaciones.db");
  db = new DatabaseSync(rutaArchivo);

  /* WAL hace las escrituras más seguras ante cierres inesperados */
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(
    "CREATE TABLE IF NOT EXISTS registros (" +
    "  id      TEXT PRIMARY KEY," +
    "  nombre  TEXT NOT NULL," +
    "  empresa TEXT NOT NULL," +
    "  monto   REAL NOT NULL DEFAULT 0," +
    "  fecha   TEXT NOT NULL," +
    "  venta   INTEGER NOT NULL DEFAULT 0," +
    "  cobro   INTEGER NOT NULL DEFAULT 0" +
    ")"
  );

  /* Meta global de venta por mes. El periodo es "2026-09". */
  db.exec(
    "CREATE TABLE IF NOT EXISTS metas (" +
    "  periodo TEXT PRIMARY KEY," +
    "  monto   REAL NOT NULL DEFAULT 0" +
    ")"
  );

  return rutaArchivo;
}

/* SQLite no tiene booleanos: se guardan como 0 y 1 */
function aFila(r) {
  return {
    id: String(r.id),
    nombre: String(r.nombre || ""),
    empresa: String(r.empresa || ""),
    monto: Number(r.monto) || 0,
    fecha: String(r.fecha || new Date().toISOString()),
    venta: r.venta ? 1 : 0,
    cobro: r.cobro ? 1 : 0
  };
}

function aRegistro(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    empresa: fila.empresa,
    monto: fila.monto,
    fecha: fila.fecha,
    venta: fila.venta === 1,
    cobro: fila.cobro === 1
  };
}

function listar() {
  const filas = db.prepare("SELECT * FROM registros ORDER BY fecha DESC").all();
  return filas.map(aRegistro);
}

function crear(registro) {
  db.prepare(
    "INSERT INTO registros (id, nombre, empresa, monto, fecha, venta, cobro) " +
    "VALUES (:id, :nombre, :empresa, :monto, :fecha, :venta, :cobro)"
  ).run(aFila(registro));
}

function actualizar(registro) {
  const fila = aFila(registro);

  /* Solo se mandan los campos que usa el UPDATE: node:sqlite
     no admite parámetros de más. La fecha no se modifica. */
  db.prepare(
    "UPDATE registros SET nombre = :nombre, empresa = :empresa, monto = :monto, " +
    "venta = :venta, cobro = :cobro WHERE id = :id"
  ).run({
    id: fila.id,
    nombre: fila.nombre,
    empresa: fila.empresa,
    monto: fila.monto,
    venta: fila.venta,
    cobro: fila.cobro
  });
}

function eliminar(id) {
  db.prepare("DELETE FROM registros WHERE id = ?").run(String(id));
}

/* ---------------------------------------------------------
   Metas
   --------------------------------------------------------- */
function leerMetas() {
  const filas = db.prepare("SELECT periodo, monto FROM metas").all();
  const metas = {};
  filas.forEach(function (f) { metas[f.periodo] = f.monto; });
  return metas;
}

function guardarMeta(periodo, monto) {
  if (Number(monto) > 0) {
    db.prepare(
      "INSERT INTO metas (periodo, monto) VALUES (:periodo, :monto) " +
      "ON CONFLICT(periodo) DO UPDATE SET monto = :monto"
    ).run({ periodo: String(periodo), monto: Number(monto) });
  } else {
    /* Una meta en cero equivale a no tener meta */
    db.prepare("DELETE FROM metas WHERE periodo = ?").run(String(periodo));
  }
}

function info() {
  return {
    tipo: "sqlite",
    ruta: rutaArchivo,
    descripcion: "Base de datos SQLite: " + rutaArchivo
  };
}

function cerrar() {
  if (db) db.close();
}

module.exports = {
  abrir: abrir,
  listar: listar,
  crear: crear,
  actualizar: actualizar,
  eliminar: eliminar,
  leerMetas: leerMetas,
  guardarMeta: guardarMeta,
  info: info,
  cerrar: cerrar
};
