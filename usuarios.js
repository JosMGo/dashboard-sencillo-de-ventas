/* =========================================================
   Alta y baja del personal que entra al servidor

   Se ejecuta en el servidor, desde la consola. No hay
   pantalla de administración dentro del dashboard a
   propósito: dar de alta a alguien es una tarea de quien
   administra la máquina, no de quien captura.

     node usuarios.js listar
     node usuarios.js crear <usuario> "<nombre>" [rol]
     node usuarios.js contrasena <usuario>
     node usuarios.js verificar <usuario>
     node usuarios.js baja <usuario>
     node usuarios.js alta <usuario>
     node usuarios.js borrar <usuario>

   La contraseña se pide aparte y no se escribe en pantalla,
   para que no quede en el historial de la consola. Como se
   teclea a ciegas, cada prompt confirma cuántos caracteres
   recibió: si el número no cuadra con lo que escribiste, la
   terminal se está comiendo teclas.

   Roles: captura (por defecto) y admin, que además puede
   consultar la bitácora.
   ========================================================= */

const path = require("path");
const fs = require("fs");
const readline = require("readline");
const db = require("./db");
const auth = require("./auth");

const CARPETA_DATOS = process.env.COTIZACIONES_DATOS ||
  path.join(__dirname, "datos");

const MINIMO_CONTRASENA = 8;
const ROLES = ["captura", "admin"];

/* ---------------------------------------------------------
   Pedir la contraseña sin mostrarla

   La interfaz de lectura se crea una sola vez y se reutiliza:
   abrir una segunda sobre el mismo stdin devuelve vacío,
   porque el flujo ya quedó consumido por la primera.
   --------------------------------------------------------- */
let lector = null;
let silenciar = false;
let pendiente = null;

function abrirLector() {
  if (lector) return lector;

  lector = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  /* Se intercepta la salida para que las teclas no se vean */
  const escribir = lector._writeToOutput.bind(lector);

  lector._writeToOutput = function (texto) {
    if (silenciar) {
      if (texto.indexOf("\n") !== -1) process.stdout.write("\n");
      return;
    }
    escribir(texto);
  };

  /* Si la entrada se acaba antes de responder (Ctrl+C, o la
     orden llegó por tubería), la pregunta se resuelve vacía y
     la validación de más abajo da el mensaje correcto. Sin
     esto el proceso terminaría en silencio. */
  lector.on("close", function () {
    if (pendiente) {
      const resolver = pendiente;
      pendiente = null;
      resolver("");
    }
  });

  return lector;
}

function cerrarLector() {
  if (lector) {
    lector.close();
    lector = null;
  }
}

function pedirContrasena(mensaje) {
  /* Vía para instalaciones desatendidas. Solo conviene en un
     script de aprovisionamiento: la variable queda visible
     para otros procesos de la misma sesión. */
  if (process.env.COTIZACIONES_CONTRASENA) {
    return Promise.resolve(process.env.COTIZACIONES_CONTRASENA);
  }

  return new Promise(function (resolver) {
    const l = abrirLector();
    silenciar = false;
    pendiente = resolver;

    l.question(mensaje, function (respuesta) {
      silenciar = false;
      pendiente = null;

      /* Como la escritura va a ciegas, se confirma cuántos
         caracteres llegaron. Sin esto, una terminal que se
         coma teclas guarda una contraseña que nadie podrá
         volver a escribir, y el error solo aparece después,
         al intentar entrar. */
      process.stdout.write("  (se recibieron " + respuesta.length + " caracteres)\n");

      resolver(respuesta);
    });

    silenciar = true;
  });
}

function nombreValido(usuario) {
  return /^[a-z0-9._-]{3,32}$/.test(usuario);
}

/* No se usa process.exit aquí: en Windows corta la salida
   antes de que el mensaje llegue a la consola. Se lanza el
   error y principal() lo reporta al terminar. */
function salirCon(mensaje) {
  const e = new Error(mensaje);
  e.esperado = true;
  throw e;
}

/* ---------------------------------------------------------
   Órdenes
   --------------------------------------------------------- */
function listar() {
  const filas = db.listarUsuarios();

  if (!filas.length) {
    console.log("No hay usuarios dados de alta.");
    return;
  }

  console.log("");
  console.log("USUARIO".padEnd(20) + "NOMBRE".padEnd(28) + "ROL".padEnd(10) + "ESTADO");
  console.log("-".repeat(70));

  filas.forEach(function (f) {
    console.log(
      String(f.usuario).padEnd(20) +
      String(f.nombre).slice(0, 26).padEnd(28) +
      String(f.rol).padEnd(10) +
      (f.activo === 1 ? "activo" : "dado de baja")
    );
  });

  console.log("");
}

/* La contraseña se pide aparte, nunca como argumento. Es lo
   primero que intenta todo el mundo, así que conviene decirlo
   en vez de fallar por "el rol es inválido". */
const AVISO_CONTRASENA = [
  "La contraseña no se escribe en el comando: se pide aparte,",
  "sin mostrarla, para que no quede en el historial de la consola.",
  "",
  "  node usuarios.js crear <usuario> \"<nombre completo>\" [captura|admin]",
  "",
  "Ejemplo:",
  "  node usuarios.js crear milton \"Milton Ramírez\" admin"
].join("\n");

async function crear(args) {
  const usuario = String(args[0] || "").trim().toLowerCase();
  const nombre = String(args[1] || "").trim();
  const rol = String(args[2] || "captura").trim().toLowerCase();

  if (args.length > 3) {
    salirCon("Sobran datos en el comando.\n\n" + AVISO_CONTRASENA);
  }
  if (!nombreValido(usuario)) {
    salirCon("El usuario debe tener entre 3 y 32 caracteres: letras minúsculas,\n" +
             "números, punto, guion o guion bajo.\n\n" + AVISO_CONTRASENA);
  }
  if (!nombre) {
    salirCon("Falta el nombre completo.\n\n" + AVISO_CONTRASENA);
  }
  if (ROLES.indexOf(rol) === -1) {
    salirCon("\"" + args[2] + "\" no es un rol válido: solo existen " + ROLES.join(" y ") + ".\n\n" +
             AVISO_CONTRASENA);
  }
  if (db.buscarUsuario(usuario)) {
    salirCon("Ya existe el usuario " + usuario + ". Para cambiarle la contraseña:\n  node usuarios.js contrasena " + usuario);
  }

  const contrasena = await pedirContrasena("Contraseña para " + usuario + ": ");
  const repetida = await pedirContrasena("Repítela: ");

  if (contrasena !== repetida) salirCon("Las contraseñas no coinciden.");
  if (contrasena.length < MINIMO_CONTRASENA) {
    salirCon("La contraseña debe tener al menos " + MINIMO_CONTRASENA + " caracteres.");
  }

  db.crearUsuario(usuario, nombre, auth.hashContrasena(contrasena), rol);

  /* Se separan a propósito: confundir el nombre con el usuario
     es el tropiezo más común al entrar por primera vez */
  console.log("");
  console.log("Listo. Estos son los datos de acceso:");
  console.log("");
  console.log("  Usuario (lo que se escribe en el login):  " + usuario);
  console.log("  Nombre que verá en pantalla:              " + nombre);
  console.log("  Rol:                                      " + rol);
  console.log("");
}

async function contrasena(args) {
  const usuario = String(args[0] || "").trim().toLowerCase();
  if (!db.buscarUsuario(usuario)) salirCon("No existe el usuario " + usuario + ".");

  const nueva = await pedirContrasena("Nueva contraseña para " + usuario + ": ");
  const repetida = await pedirContrasena("Repítela: ");

  if (nueva !== repetida) salirCon("Las contraseñas no coinciden.");
  if (nueva.length < MINIMO_CONTRASENA) {
    salirCon("La contraseña debe tener al menos " + MINIMO_CONTRASENA + " caracteres.");
  }

  db.cambiarContrasena(usuario, auth.hashContrasena(nueva));

  /* Cambiar la contraseña cierra lo que estuviera abierto:
     es justo lo que se espera si se cambió por sospecha */
  db.cerrarSesionesDe(usuario);

  console.log("Contraseña cambiada. Las sesiones abiertas de " + usuario + " se cerraron.");
}

/* Comprueba una contraseña contra la que está guardada, sin
   abrir sesión ni tocar nada. Sirve para saber si el problema
   está en la contraseña o en otro lado. */
async function verificar(args) {
  const usuario = String(args[0] || "").trim().toLowerCase();
  const fila = db.buscarUsuario(usuario);
  if (!fila) salirCon("No existe el usuario " + usuario + ".");

  const contrasena = await pedirContrasena("Contraseña a comprobar para " + usuario + ": ");

  if (auth.verificarContrasena(contrasena, fila.hash)) {
    console.log("\nCoincide. Con esa contraseña sí se puede entrar como \"" + usuario + "\".\n");
  } else {
    console.log("\nNo coincide con la que está guardada.");
    console.log("Para cambiarla:  node usuarios.js contrasena " + usuario + "\n");
  }
}

/* Borra una cuenta por completo. Solo sirve para deshacer un
   alta recién hecha: si esa persona ya capturó algo, sus
   movimientos quedarían firmados por alguien inexistente, y
   entonces lo correcto es darla de baja, no borrarla. */
function borrar(args) {
  const usuario = String(args[0] || "").trim().toLowerCase();
  if (!db.buscarUsuario(usuario)) salirCon("No existe el usuario " + usuario + ".");

  const actividad = db.contarActividadDe(usuario);

  if (actividad.registros > 0 || actividad.movimientos > 0) {
    salirCon(
      "No se puede borrar a " + usuario + ": ya tiene actividad registrada\n" +
      "(" + actividad.registros + " cotizaciones y " + actividad.movimientos + " movimientos en la bitácora).\n\n" +
      "Borrar la cuenta dejaría esos movimientos firmados por alguien que\n" +
      "ya no existe. Para quitarle el acceso conservando el rastro:\n\n" +
      "  node usuarios.js baja " + usuario
    );
  }

  db.eliminarUsuario(usuario);
  console.log("Cuenta \"" + usuario + "\" borrada. No tenía actividad registrada.");
}

function cambiarEstado(args, activo) {
  const usuario = String(args[0] || "").trim().toLowerCase();
  if (!db.buscarUsuario(usuario)) salirCon("No existe el usuario " + usuario + ".");

  db.activarUsuario(usuario, activo);
  console.log(activo
    ? usuario + " puede entrar de nuevo."
    : usuario + " quedó dado de baja y sus sesiones se cerraron.");
}

function ayuda() {
  console.log([
    "",
    "  Uso:",
    "    node usuarios.js listar",
    "    node usuarios.js crear <usuario> \"<nombre completo>\" [captura|admin]",
    "    node usuarios.js contrasena <usuario>",
    "    node usuarios.js verificar <usuario>",
    "    node usuarios.js baja <usuario>          (quita el acceso, conserva el rastro)",
    "    node usuarios.js borrar <usuario>        (solo para deshacer un alta reciente)",
    "    node usuarios.js alta <usuario>",
    ""
  ].join("\n"));
}

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */
async function principal() {
  fs.mkdirSync(CARPETA_DATOS, { recursive: true });
  db.abrir(CARPETA_DATOS);

  const orden = String(process.argv[2] || "").toLowerCase();
  const args = process.argv.slice(3);

  switch (orden) {
    case "listar": listar(); break;
    case "crear": await crear(args); break;
    case "contrasena":
    case "contraseña": await contrasena(args); break;
    case "verificar": await verificar(args); break;
    case "borrar": borrar(args); break;
    case "baja": cambiarEstado(args, false); break;
    case "alta": cambiarEstado(args, true); break;
    default: ayuda();
  }
}

principal().catch(function (e) {
  /* Los errores esperados son mensajes para quien administra;
     los inesperados llevan traza para poder diagnosticarlos */
  if (e.esperado) console.error("\n" + e.message + "\n");
  else console.error("\nError inesperado:", e.stack, "\n");
  process.exitCode = 1;
}).finally(function () {
  cerrarLector();
  db.cerrar();
});
