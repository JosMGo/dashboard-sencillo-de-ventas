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

const fs = require("fs");
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

/* "28/09/2026" en la hora local del equipo, para la bitácora */
function fechaCorta(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return String(d.getDate()).padStart(2, "0") + "/" +
    String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
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
  const previo = obtener(fila.id);

  /* La fecha es la de la cotización y se puede corregir: es lo
     que permite pasar a septiembre algo capturado el 1 de
     octubre. Lo que no se toca nunca es el autor original ni
     creado_en, que dicen cuándo se capturó de verdad.

     Si no llega fecha se conserva la que había. aFila pondría
     "ahora", y eso mudaría la cotización al mes en curso sin
     que nadie lo pidiera. */
  const fecha = registro.fecha ? fila.fecha : null;

  /* Solo se mandan los campos que usa el UPDATE: node:sqlite
     no admite parámetros de más. */
  const r = db.prepare(
    "UPDATE registros SET nombre = :nombre, empresa = :empresa, monto = :monto, " +
    "fecha = COALESCE(:fecha, fecha), " +
    "venta = :venta, cobro = :cobro, actualizado_en = :actualizado_en, " +
    "actualizado_por = :actualizado_por WHERE id = :id"
  ).run({
    id: fila.id,
    nombre: fila.nombre,
    empresa: fila.empresa,
    monto: fila.monto,
    fecha: fecha,
    venta: fila.venta,
    cobro: fila.cobro,
    actualizado_en: ahora(),
    actualizado_por: autor
  });

  if (r.changes > 0) {
    let detalle = fila.empresa + " · " + fila.nombre;

    /* Cambiar la fecha pasa el monto de un mes a otro, así que
       queda anotado de dónde a dónde */
    if (previo && fecha && fechaCorta(previo.fecha) !== fechaCorta(fecha)) {
      detalle += " · fecha " + fechaCorta(previo.fecha) + " → " + fechaCorta(fecha);
    }

    anotar(autor, "actualizar", fila.id, detalle);
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

/* ---------------------------------------------------------
   Respaldo

   VACUUM INTO escribe una copia completa y consistente sin
   detener el servicio. Copiar el archivo .db a mano sería un
   error: en modo WAL los últimos cambios viven en el archivo
   -wal, así que la copia saldría incompleta o corrupta según
   el momento en que se hiciera.

   La copia que sale ya viene compactada y sin el -wal, así
   que es un solo archivo listo para guardar o restaurar.
   --------------------------------------------------------- */
function respaldar(rutaDestino) {
  db.prepare("VACUUM INTO ?").run(String(rutaDestino));
  return rutaDestino;
}

/* ---------------------------------------------------------
   Leer un respaldo sin restaurarlo

   Cada archivo se abre con su propia conexión y se cierra al
   terminar: la base en uso no se entera de que alguien está
   mirando una copia.
   --------------------------------------------------------- */

/* Un error cuyo mensaje se le puede enseñar tal cual a quien
   administra. Los demás se resumen en uno genérico. */
function rechazo(mensaje) {
  const e = new Error(mensaje);
  e.paraMostrar = true;
  return e;
}

/* Las columnas sin las que abrir() no puede trabajar. Un
   archivo con una tabla "registros" de otro programa pasaría
   la revisión de tablas y rompería el servidor al abrirlo. */
const COLUMNAS_NECESARIAS = {
  registros: ["id", "nombre", "empresa", "monto", "fecha", "venta", "cobro"],
  usuarios: ["usuario", "nombre", "hash", "rol", "activo"]
};

/* Lo justo para reconocer una base de un vistazo: cuántas
   cotizaciones tiene, de qué meses y quién la administra.
   Fue lo que faltó para distinguir la base real de la de
   prueba cuando las dos estaban en la misma carpeta. */
function resumirConexion(conexion) {
  Object.keys(COLUMNAS_NECESARIAS).forEach(function (tabla) {
    const columnas = conexion.prepare("PRAGMA table_info(" + tabla + ")").all()
      .map(function (c) { return c.name; });
    const faltan = COLUMNAS_NECESARIAS[tabla].filter(function (c) {
      return columnas.indexOf(c) === -1;
    });
    if (faltan.length) {
      throw rechazo("No es una base de este sistema: " +
        (columnas.length ? "a la tabla " + tabla + " le falta " + faltan.join(", ") + "."
                         : "no tiene la tabla " + tabla + "."));
    }
  });

  /* El mes se agrupa en la hora local del servidor, igual que
     el dashboard. Cortar el texto ISO lo haría en UTC y una
     venta del 30 a la noche saltaría al mes siguiente. */
  const porMes = {};
  let total = 0;
  let cantidad = 0;

  conexion.prepare("SELECT fecha, monto FROM registros").all().forEach(function (r) {
    const d = new Date(r.fecha);
    const periodo = isNaN(d.getTime())
      ? "sin fecha"
      : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const monto = Number(r.monto) || 0;

    if (!porMes[periodo]) porMes[periodo] = { periodo: periodo, cantidad: 0, total: 0 };
    porMes[periodo].cantidad++;
    porMes[periodo].total += monto;
    cantidad++;
    total += monto;
  });

  const admins = conexion.prepare(
    "SELECT usuario FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY usuario"
  ).all().map(function (u) { return u.usuario; });

  return {
    cotizaciones: cantidad,
    total: total,
    meses: Object.keys(porMes).sort().map(function (p) { return porMes[p]; }),
    cuentas: conexion.prepare("SELECT COUNT(*) AS n FROM usuarios").get().n,
    admins: admins
  };
}

/* completo = además de resumir, comprobar que el archivo está
   sano y que alguien podría entrar después de restaurarlo.
   Es lo que se pide antes de subir o restaurar; para el
   listado basta el resumen, que es mucho más rápido. */
function revisarConexion(conexion, completo) {
  let resumen;

  try {
    if (completo) {
      const r = conexion.prepare("PRAGMA integrity_check").get();
      if (!r || r.integrity_check !== "ok") {
        throw rechazo("El archivo está dañado: SQLite encontró errores al revisarlo.");
      }
    }
    resumen = resumirConexion(conexion);
  } catch (e) {
    if (e.paraMostrar) throw e;
    throw rechazo("El archivo no es una base de datos de este sistema, o está dañado.");
  }

  /* Sin una cuenta de administración activa, restaurar dejaría
     a todo el mundo fuera, sin forma de entrar a deshacerlo */
  if (completo && !resumen.admins.length) {
    throw rechazo("Ese respaldo no tiene ninguna cuenta de administración activa: " +
      "después de restaurarlo nadie podría entrar.");
  }

  return resumen;
}

function examinarArchivo(ruta, completo) {
  let conexion;
  try {
    conexion = new DatabaseSync(String(ruta), { readOnly: true });
  } catch (e) {
    throw rechazo("El archivo no es una base de datos de este sistema, o está dañado.");
  }

  try {
    return revisarConexion(conexion, completo);
  } finally {
    conexion.close();
  }
}

function resumenActual() {
  return resumirConexion(db);
}

/* Un archivo subido puede venir de cualquier lado, incluso
   copiado a mano de una base en modo WAL. Pasarlo por VACUUM
   INTO lo deja igual que un respaldo hecho aquí: un solo
   archivo, compacto y sin -wal pendiente. */
function importarArchivo(rutaOrigen, rutaDestino) {
  let conexion;
  try {
    conexion = new DatabaseSync(String(rutaOrigen));
  } catch (e) {
    throw rechazo("El archivo no es una base de datos de este sistema, o está dañado.");
  }

  try {
    const resumen = revisarConexion(conexion, true);
    conexion.prepare("VACUUM INTO ?").run(String(rutaDestino));
    return resumen;
  } finally {
    conexion.close();
  }
}

/* ---------------------------------------------------------
   Restauración

   Cambia la base en uso por otro archivo, entera:
   cotizaciones, metas, cuentas y bitácora.

   Todo es síncrono de principio a fin, así que ninguna otra
   petición alcanza a llegar con la base cerrada.

   El orden es lo que evita perder datos:
   1. El archivo se copia junto a la base con otro nombre. Si
      eso falla, la base en uso ni se tocó.
   2. Se vacía el -wal dentro de la base y se cierra. Así no
      queda nada pendiente que perder, ni un -wal viejo que
      SQLite le aplicaría al archivo nuevo (eso lo corrompe).
   3. La base actual se aparta como .anterior y la nueva ocupa
      su lugar. Se renombra en vez de copiar: es de un golpe.
   4. Se abre la nueva, lo que de paso migra un respaldo viejo.
      Si no abre, vuelve la anterior.
   --------------------------------------------------------- */
function borrarSiExiste(ruta) {
  try {
    fs.unlinkSync(ruta);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

function restaurar(rutaOrigen) {
  const carpeta = path.dirname(rutaArchivo);
  const actual = rutaArchivo;
  const nueva = actual + ".restaurando";
  const anterior = actual + ".anterior";

  fs.copyFileSync(String(rutaOrigen), nueva);

  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  db = null;

  try {
    borrarSiExiste(actual + "-wal");
    borrarSiExiste(actual + "-shm");
    borrarSiExiste(anterior);
    fs.renameSync(actual, anterior);
  } catch (e) {
    borrarSiExiste(nueva);
    abrir(carpeta);
    throw e;
  }

  try {
    fs.renameSync(nueva, actual);
    abrir(carpeta);
  } catch (e) {
    if (db) {
      db.close();
      db = null;
    }
    borrarSiExiste(actual + "-wal");
    borrarSiExiste(actual + "-shm");
    borrarSiExiste(actual);
    fs.renameSync(anterior, actual);
    abrir(carpeta);
    throw e;
  }

  borrarSiExiste(anterior);

  /* Las sesiones que trae el respaldo son de otro momento: una
     cookie olvidada en algún navegador podría volver a valer.
     Se empieza de cero y todos entran de nuevo. */
  db.exec("DELETE FROM sesiones");
}

/* De dónde salió cada respaldo, según la bitácora. Solo
   aparecen los que se hicieron con esta misma base: los que
   llegaron de otro servidor no tienen rastro aquí. */
function origenesDeRespaldos() {
  const origenes = {};
  db.prepare(
    "SELECT registro, usuario, accion, detalle FROM bitacora " +
    "WHERE accion IN ('respaldo', 'subida') ORDER BY id"
  ).all().forEach(function (f) {
    origenes[f.registro] = { usuario: f.usuario, accion: f.accion, detalle: f.detalle };
  });
  return origenes;
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
  respaldar: respaldar,
  examinarArchivo: examinarArchivo,
  resumenActual: resumenActual,
  importarArchivo: importarArchivo,
  restaurar: restaurar,
  origenesDeRespaldos: origenesDeRespaldos,
  /* Se expone para que el alta y la baja de cuentas dejen el
     mismo rastro que las cotizaciones */
  anotar: anotar,
  leerBitacora: leerBitacora,
  info: info,
  cerrar: cerrar
};
