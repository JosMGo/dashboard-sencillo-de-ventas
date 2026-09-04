/* =========================================================
   Base de datos SQLite

   Usa node:sqlite, el SQLite que ya viene incluido en Node.
   No hay que instalar ni compilar nada.

   La usan dos programas:

   - main.js  (app de escritorio Electron)
   - server.js (servidor web de la red local)

   Los dos abren el mismo archivo con abrir(carpeta). Nunca
   deben apuntar a la misma carpeta al mismo tiempo desde
   máquinas distintas: SQLite exige disco local.
   ========================================================= */

const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let db = null;
let rutaArchivo = "";

/* Quién aparece como autor cuando no hay sesión, es decir
   cuando los datos se capturan desde la app de escritorio */
const AUTOR_ESCRITORIO = "escritorio";

function ahora() {
  return new Date().toISOString();
}

function abrir(carpetaDatos) {
  rutaArchivo = path.join(carpetaDatos, "cotizaciones.db");
  db = new DatabaseSync(rutaArchivo);

  /* WAL hace las escrituras más seguras ante cierres inesperados
     y permite leer mientras otro proceso escribe */
  db.exec("PRAGMA journal_mode = WAL");

  /* Espera hasta 5 s si otra escritura tiene el archivo tomado,
     en vez de fallar de inmediato. Con varios usuarios web es
     la diferencia entre un error visible y ninguno. */
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");

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

  /* Personal que puede entrar al servidor web. La app de
     escritorio ignora esta tabla. */
  db.exec(
    "CREATE TABLE IF NOT EXISTS usuarios (" +
    "  usuario   TEXT PRIMARY KEY," +
    "  nombre    TEXT NOT NULL," +
    "  hash      TEXT NOT NULL," +
    "  rol       TEXT NOT NULL DEFAULT 'usuario'," +
    "  activo    INTEGER NOT NULL DEFAULT 1," +
    "  creado_en TEXT NOT NULL" +
    ")"
  );

  /* Sesiones abiertas. Solo se guarda el hash del token. */
  db.exec(
    "CREATE TABLE IF NOT EXISTS sesiones (" +
    "  token_hash TEXT PRIMARY KEY," +
    "  usuario    TEXT NOT NULL," +
    "  creada_en  TEXT NOT NULL," +
    "  expira_en  TEXT NOT NULL" +
    ")"
  );

  /* Rastro de lo que se borra o se modifica. Sin esto, un
     registro eliminado no deja ninguna huella de quién fue. */
  db.exec(
    "CREATE TABLE IF NOT EXISTS bitacora (" +
    "  id       INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  fecha    TEXT NOT NULL," +
    "  usuario  TEXT NOT NULL," +
    "  accion   TEXT NOT NULL," +
    "  registro TEXT NOT NULL," +
    "  detalle  TEXT NOT NULL DEFAULT ''" +
    ")"
  );

  db.exec("CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora (fecha)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros (fecha)");

  migrar();

  return rutaArchivo;
}

/* ---------------------------------------------------------
   Migración

   Las bases creadas por la versión de escritorio no tienen
   las columnas de auditoría. Se agregan aquí, una sola vez,
   sin perder lo ya capturado.
   --------------------------------------------------------- */
function migrar() {
  const columnas = db.prepare("PRAGMA table_info(registros)").all()
    .map(function (c) { return c.name; });

  const nuevas = [
    ["usuario", "TEXT NOT NULL DEFAULT ''"],
    ["creado_en", "TEXT NOT NULL DEFAULT ''"],
    ["actualizado_en", "TEXT NOT NULL DEFAULT ''"],
    ["actualizado_por", "TEXT NOT NULL DEFAULT ''"]
  ];

  nuevas.forEach(function (col) {
    if (columnas.indexOf(col[0]) === -1) {
      db.exec("ALTER TABLE registros ADD COLUMN " + col[0] + " " + col[1]);
    }
  });

  /* El rol "captura" se renombró a "usuario". Sin esta línea,
     las cuentas creadas antes del cambio se quedan con un rol
     que ya no está en auth.ROLES: seguirían entrando, pero
     cualquier intento de editarlas fallaría la validación.
     Es idempotente, así que correrla de más no hace nada. */
  db.exec("UPDATE usuarios SET rol = 'usuario' WHERE rol = 'captura'");
}

/* SQLite no tiene booleanos: se guardan como 0 y 1 */
function aFila(r) {
  return {
    id: String(r.id),
    nombre: String(r.nombre || ""),
    empresa: String(r.empresa || ""),
    monto: Number(r.monto) || 0,
    fecha: String(r.fecha || ahora()),
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
    cobro: fila.cobro === 1,
    usuario: fila.usuario || "",
    creadoEn: fila.creado_en || "",
    actualizadoEn: fila.actualizado_en || "",
    actualizadoPor: fila.actualizado_por || ""
  };
}

function anotar(usuario, accion, registro, detalle) {
  db.prepare(
    "INSERT INTO bitacora (fecha, usuario, accion, registro, detalle) " +
    "VALUES (:fecha, :usuario, :accion, :registro, :detalle)"
  ).run({
    fecha: ahora(),
    usuario: String(usuario || AUTOR_ESCRITORIO),
    accion: String(accion),
    registro: String(registro),
    detalle: String(detalle || "")
  });
}

/* ---------------------------------------------------------
   Registros
   --------------------------------------------------------- */
function listar() {
  const filas = db.prepare("SELECT * FROM registros ORDER BY fecha DESC").all();
  return filas.map(aRegistro);
}

function obtener(id) {
  const fila = db.prepare("SELECT * FROM registros WHERE id = ?").get(String(id));
  return fila ? aRegistro(fila) : null;
}

function crear(registro, usuario) {
  const fila = aFila(registro);
  const autor = String(usuario || AUTOR_ESCRITORIO);
  const momento = ahora();

  db.prepare(
    "INSERT INTO registros (id, nombre, empresa, monto, fecha, venta, cobro, " +
    "usuario, creado_en, actualizado_en, actualizado_por) " +
    "VALUES (:id, :nombre, :empresa, :monto, :fecha, :venta, :cobro, " +
    ":usuario, :creado_en, :actualizado_en, :actualizado_por)"
  ).run({
    id: fila.id,
    nombre: fila.nombre,
    empresa: fila.empresa,
    monto: fila.monto,
    fecha: fila.fecha,
    venta: fila.venta,
    cobro: fila.cobro,
    usuario: autor,
    creado_en: momento,
    actualizado_en: momento,
    actualizado_por: autor
  });

  anotar(autor, "crear", fila.id, fila.empresa + " · " + fila.nombre);
}

function actualizar(registro, usuario) {
  const fila = aFila(registro);
  const autor = String(usuario || AUTOR_ESCRITORIO);

  /* Solo se mandan los campos que usa el UPDATE: node:sqlite
     no admite parámetros de más. La fecha y el autor original
     no se modifican nunca. */
  const r = db.prepare(
    "UPDATE registros SET nombre = :nombre, empresa = :empresa, monto = :monto, " +
    "venta = :venta, cobro = :cobro, actualizado_en = :actualizado_en, " +
    "actualizado_por = :actualizado_por WHERE id = :id"
  ).run({
    id: fila.id,
    nombre: fila.nombre,
    empresa: fila.empresa,
    monto: fila.monto,
    venta: fila.venta,
    cobro: fila.cobro,
    actualizado_en: ahora(),
    actualizado_por: autor
  });

  if (r.changes > 0) {
    anotar(autor, "actualizar", fila.id, fila.empresa + " · " + fila.nombre);
  }

  return r.changes > 0;
}

function eliminar(id, usuario) {
  const previo = obtener(id);

  const r = db.prepare("DELETE FROM registros WHERE id = ?").run(String(id));

  if (r.changes > 0) {
    /* El detalle guarda lo que había, porque la fila ya no existe */
    anotar(
      usuario, "eliminar", String(id),
      previo ? previo.empresa + " · " + previo.nombre + " · " + previo.monto : ""
    );
  }

  return r.changes > 0;
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

function guardarMeta(periodo, monto, usuario) {
  if (Number(monto) > 0) {
    db.prepare(
      "INSERT INTO metas (periodo, monto) VALUES (:periodo, :monto) " +
      "ON CONFLICT(periodo) DO UPDATE SET monto = :monto"
    ).run({ periodo: String(periodo), monto: Number(monto) });
    anotar(usuario, "meta", String(periodo), String(Number(monto)));
  } else {
    /* Una meta en cero equivale a no tener meta */
    db.prepare("DELETE FROM metas WHERE periodo = ?").run(String(periodo));
    anotar(usuario, "meta-borrada", String(periodo), "");
  }
}

/* ---------------------------------------------------------
   Usuarios
   --------------------------------------------------------- */
function crearUsuario(usuario, nombre, hash, rol) {
  db.prepare(
    "INSERT INTO usuarios (usuario, nombre, hash, rol, activo, creado_en) " +
    "VALUES (:usuario, :nombre, :hash, :rol, 1, :creado_en)"
  ).run({
    usuario: String(usuario),
    nombre: String(nombre),
    hash: String(hash),
    rol: String(rol || "usuario"),
    creado_en: ahora()
  });
}

function buscarUsuario(usuario) {
  return db.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(String(usuario)) || null;
}

function listarUsuarios() {
  return db.prepare(
    "SELECT usuario, nombre, rol, activo, creado_en FROM usuarios ORDER BY usuario"
  ).all();
}

function cambiarContrasena(usuario, hash) {
  const r = db.prepare("UPDATE usuarios SET hash = ? WHERE usuario = ?")
    .run(String(hash), String(usuario));
  return r.changes > 0;
}

function cambiarRol(usuario, rol) {
  const r = db.prepare("UPDATE usuarios SET rol = ? WHERE usuario = ?")
    .run(String(rol), String(usuario));
  return r.changes > 0;
}

/* Cuántas cuentas de administración quedan en pie. Se consulta
   antes de quitarle el rol, el acceso o la cuenta a un admin:
   si se va la última, ya nadie puede entrar a administrar y la
   única salida queda ser la consola del servidor. */
function contarAdmins() {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1"
  ).get().n;
}

function activarUsuario(usuario, activo) {
  const r = db.prepare("UPDATE usuarios SET activo = ? WHERE usuario = ?")
    .run(activo ? 1 : 0, String(usuario));

  /* Dar de baja a alguien debe cerrarle las sesiones abiertas,
     o seguiría dentro hasta que expire su cookie */
  if (r.changes > 0 && !activo) cerrarSesionesDe(usuario);
  return r.changes > 0;
}

function contarUsuarios() {
  return db.prepare("SELECT COUNT(*) AS n FROM usuarios").get().n;
}

/* Cuánto ha hecho esta persona. Se consulta antes de borrarla:
   si ya capturó o modificó algo, borrar su cuenta dejaría esos
   movimientos atribuidos a un usuario que ya no existe. */
function contarActividadDe(usuario) {
  const u = String(usuario);
  return {
    registros: db.prepare(
      "SELECT COUNT(*) AS n FROM registros WHERE usuario = ? OR actualizado_por = ?"
    ).get(u, u).n,
    movimientos: db.prepare(
      "SELECT COUNT(*) AS n FROM bitacora WHERE usuario = ?"
    ).get(u).n
  };
}

function eliminarUsuario(usuario) {
  cerrarSesionesDe(usuario);
  const r = db.prepare("DELETE FROM usuarios WHERE usuario = ?").run(String(usuario));
  return r.changes > 0;
}

/* ---------------------------------------------------------
   Sesiones
   --------------------------------------------------------- */
function abrirSesion(tokenHash, usuario, expiraEn) {
  db.prepare(
    "INSERT INTO sesiones (token_hash, usuario, creada_en, expira_en) " +
    "VALUES (:token_hash, :usuario, :creada_en, :expira_en)"
  ).run({
    token_hash: String(tokenHash),
    usuario: String(usuario),
    creada_en: ahora(),
    expira_en: String(expiraEn)
  });
}

/* Devuelve el usuario de la sesión, o null si no existe,
   expiró o la cuenta fue dada de baja */
function leerSesion(tokenHash) {
  const fila = db.prepare(
    "SELECT s.usuario, s.expira_en, u.nombre, u.rol, u.activo " +
    "FROM sesiones s JOIN usuarios u ON u.usuario = s.usuario " +
    "WHERE s.token_hash = ?"
  ).get(String(tokenHash));

  if (!fila) return null;
  if (fila.activo !== 1) return null;
  if (new Date(fila.expira_en).getTime() < Date.now()) return null;

  return { usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol };
}

function renovarSesion(tokenHash, expiraEn) {
  db.prepare("UPDATE sesiones SET expira_en = ? WHERE token_hash = ?")
    .run(String(expiraEn), String(tokenHash));
}

function cerrarSesion(tokenHash) {
  db.prepare("DELETE FROM sesiones WHERE token_hash = ?").run(String(tokenHash));
}

function cerrarSesionesDe(usuario) {
  db.prepare("DELETE FROM sesiones WHERE usuario = ?").run(String(usuario));
}

function purgarSesiones() {
  const r = db.prepare("DELETE FROM sesiones WHERE expira_en < ?").run(ahora());
  return r.changes;
}

/* ---------------------------------------------------------
   Bitácora
   --------------------------------------------------------- */
function leerBitacora(limite) {
  return db.prepare(
    "SELECT fecha, usuario, accion, registro, detalle FROM bitacora " +
    "ORDER BY id DESC LIMIT ?"
  ).all(Number(limite) || 200);
}

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */
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
  obtener: obtener,
  crear: crear,
  actualizar: actualizar,
  eliminar: eliminar,
  leerMetas: leerMetas,
  guardarMeta: guardarMeta,
  crearUsuario: crearUsuario,
  buscarUsuario: buscarUsuario,
  listarUsuarios: listarUsuarios,
  cambiarContrasena: cambiarContrasena,
  cambiarRol: cambiarRol,
  activarUsuario: activarUsuario,
  contarUsuarios: contarUsuarios,
  contarAdmins: contarAdmins,
  contarActividadDe: contarActividadDe,
  eliminarUsuario: eliminarUsuario,
  abrirSesion: abrirSesion,
  leerSesion: leerSesion,
  renovarSesion: renovarSesion,
  cerrarSesion: cerrarSesion,
  cerrarSesionesDe: cerrarSesionesDe,
  purgarSesiones: purgarSesiones,
  /* Se expone para que el alta y la baja de cuentas dejen el
     mismo rastro que las cotizaciones */
  anotar: anotar,
  leerBitacora: leerBitacora,
  info: info,
  cerrar: cerrar
};
