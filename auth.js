/* =========================================================
   Contraseñas y tokens de sesión

   Todo se resuelve con node:crypto, que ya viene incluido en
   Node. No hay dependencias que compilar: bcrypt y argon2
   necesitan Visual Studio Build Tools en Windows y aquí no
   hacen falta, scrypt es igual de sólido para este caso.

   Este archivo no toca la base de datos: solo calcula,
   compara y dice qué datos son aceptables. Las consultas
   viven en db.js.
   ========================================================= */

const crypto = require("crypto");

/* Parámetros de scrypt. Subirlos hace el login más lento y
   más caro de atacar por fuerza bruta. Con estos valores el
   cálculo tarda unos 100 ms, que es un buen punto medio. */
const N = 16384;
const R = 8;
const P = 1;
const LARGO_CLAVE = 64;
const MEMORIA = 64 * 1024 * 1024;

/* ---------------------------------------------------------
   Contraseñas

   El hash guardado incluye los parámetros y la sal, así que
   se pueden subir los costos más adelante sin invalidar las
   contraseñas que ya existen.
   --------------------------------------------------------- */
function hashContrasena(contrasena) {
  const sal = crypto.randomBytes(16);
  const clave = crypto.scryptSync(
    String(contrasena).normalize("NFKC"),
    sal,
    LARGO_CLAVE,
    { N: N, r: R, p: P, maxmem: MEMORIA }
  );

  return [
    "scrypt", N, R, P,
    sal.toString("base64"),
    clave.toString("base64")
  ].join("$");
}

function verificarContrasena(contrasena, guardado) {
  try {
    const partes = String(guardado).split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") return false;

    const n = Number(partes[1]);
    const r = Number(partes[2]);
    const p = Number(partes[3]);
    const sal = Buffer.from(partes[4], "base64");
    const esperado = Buffer.from(partes[5], "base64");

    const clave = crypto.scryptSync(
      String(contrasena).normalize("NFKC"),
      sal,
      esperado.length,
      { N: n, r: r, p: p, maxmem: MEMORIA }
    );

    /* timingSafeEqual evita filtrar por tiempo cuántos bytes
       coincidieron. Exige buffers del mismo largo. */
    if (clave.length !== esperado.length) return false;
    return crypto.timingSafeEqual(clave, esperado);
  } catch (e) {
    return false;
  }
}

/* ---------------------------------------------------------
   Tokens de sesión

   Al navegador se le entrega el token en claro dentro de una
   cookie httpOnly. En la base solo queda su hash: si alguien
   se lleva una copia del .db, no obtiene sesiones usables.
   --------------------------------------------------------- */
function nuevoToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/* ---------------------------------------------------------
   Reglas de la cuenta

   Viven aquí porque hay dos caminos para dar de alta a
   alguien: la consola (usuarios.js) y la pantalla de
   administración (server.js). Con la regla copiada en los dos
   lados, tarde o temprano una se queda atrás y aparecen
   cuentas que solo se pueden crear por una de las dos vías.
   --------------------------------------------------------- */
const MINIMO_CONTRASENA = 8;
/* "usuario" se llamó "captura" hasta que se renombró. Las
   filas viejas las convierte la migración de db.js, así que
   aquí ya no hace falta aceptar el nombre antiguo. */
const ROLES = ["usuario", "admin"];

/* Minúsculas a propósito: el login normaliza a minúsculas
   antes de buscar, así que permitir mayúsculas aquí crearía
   cuentas imposibles de usar. */
function usuarioValido(usuario) {
  return /^[a-z0-9._-]{3,32}$/.test(String(usuario));
}

function rolValido(rol) {
  return ROLES.indexOf(String(rol)) !== -1;
}

module.exports = {
  hashContrasena: hashContrasena,
  verificarContrasena: verificarContrasena,
  nuevoToken: nuevoToken,
  hashToken: hashToken,
  MINIMO_CONTRASENA: MINIMO_CONTRASENA,
  ROLES: ROLES,
  usuarioValido: usuarioValido,
  rolValido: rolValido
};
