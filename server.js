/* =========================================================
   Servidor web de la red local

   Un solo proceso hace dos cosas:

   - Entrega los archivos del dashboard (index.html y compañía)
   - Atiende la API contra la base SQLite compartida

   Al compartir origen no hace falta CORS.

   Arranque:   npm run servidor
   Variables:  PORT                 puerto TCP (3000)
               HOST                 interfaz (0.0.0.0)
               COTIZACIONES_DATOS   carpeta del .db
               COTIZACIONES_HTTPS   1 si hay TLS delante
   ========================================================= */

const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./db");
const auth = require("./auth");
const exportar = require("./exportar");

const PUERTO = Number(process.env.PORT) || 3000;

/* Escuchar en 0.0.0.0 y no en 127.0.0.1 es lo que permite que
   las demás computadoras de la empresa lleguen al servicio.
   Atado a localhost funciona en el servidor y en ningún otro
   lado, que es la falla número uno de estos despliegues. */
const HOST = process.env.HOST || "0.0.0.0";

const CARPETA_DATOS = process.env.COTIZACIONES_DATOS ||
  path.join(__dirname, "datos");

/* La cookie solo se marca Secure cuando hay HTTPS delante:
   con Secure sobre HTTP plano el navegador la descarta y
   nadie logra iniciar sesión. */
const HAY_HTTPS = process.env.COTIZACIONES_HTTPS === "1";

/* Duración de la sesión. Se renueva con cada petición, así
   que solo expira tras 12 horas de inactividad real. */
const HORAS_SESION = 12;

const LIMITE_INTENTOS = 5;
const MINUTOS_BLOQUEO = 5;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));

/* =========================================================
   Cookies

   Se leen y escriben a mano para no arrastrar una dependencia
   más. Es lo único que se necesita de cookie-parser.
   ========================================================= */
function leerCookies(req) {
  const crudo = req.headers.cookie;
  const cookies = {};
  if (!crudo) return cookies;

  crudo.split(";").forEach(function (parte) {
    const i = parte.indexOf("=");
    if (i < 0) return;
    const nombre = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    try {
      cookies[nombre] = decodeURIComponent(valor);
    } catch (e) {
      cookies[nombre] = valor;
    }
  });

  return cookies;
}

function ponerCookie(res, token, segundos) {
  const partes = [
    "sid=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + segundos
  ];
  if (HAY_HTTPS) partes.push("Secure");
  res.append("Set-Cookie", partes.join("; "));
}

function borrarCookie(res) {
  const partes = ["sid=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (HAY_HTTPS) partes.push("Secure");
  res.append("Set-Cookie", partes.join("; "));
}

function vencimiento() {
  return new Date(Date.now() + HORAS_SESION * 3600 * 1000).toISOString();
}

/* =========================================================
   Sesión

   Cada petición trae la cookie; aquí se traduce a un usuario.
   Si la sesión sigue viva se le corre el vencimiento.
   ========================================================= */
function identificar(req, res, next) {
  const token = leerCookies(req).sid;
  req.sesion = null;

  if (token) {
    const hash = auth.hashToken(token);
    const sesion = db.leerSesion(hash);

    if (sesion) {
      req.sesion = sesion;
      db.renovarSesion(hash, vencimiento());
      ponerCookie(res, token, HORAS_SESION * 3600);
    } else {
      /* Token viejo, vencido o de una cuenta dada de baja */
      db.cerrarSesion(hash);
      borrarCookie(res);
    }
  }

  next();
}

/* Puerta para la API: responde JSON, nunca redirige, porque
   quien llama es fetch y no el navegador navegando */
function exigirSesion(req, res, next) {
  if (!req.sesion) {
    return res.status(401).json({ error: "Sesión no iniciada" });
  }
  next();
}

/* Administrar cuentas y leer la bitácora son tareas de quien
   administra. La pantalla ya esconde lo que no aplica, pero
   esconder no es impedir: quien escriba la dirección a mano
   choca aquí. */
function exigirAdmin(req, res, next) {
  if (!req.sesion) {
    return res.status(401).json({ error: "Sesión no iniciada" });
  }
  if (req.sesion.rol !== "admin") {
    return res.status(403).json({ error: "Solo la administración puede hacer esto." });
  }
  next();
}

/* =========================================================
   Validación

   La validación del navegador es una comodidad para quien
   captura, no una defensa: el navegador es del usuario y
   cualquiera puede saltársela. Aquí se revisa de nuevo.
   ========================================================= */
const MAX_TEXTO = 200;
const MAX_MONTO = 1e12;

/* La pantalla ya limita la fecha a hoy. Aquí se deja un día de
   margen para no chocar con un reloj o un huso un poco distinto
   entre el equipo de quien captura y el servidor: lo que se
   quiere frenar son errores gordos, como un 2062. */
const ANIO_MINIMO = 2000;
const MARGEN_FUTURO = 24 * 3600 * 1000;

function texto(valor, campo, errores, obligatorio) {
  const v = String(valor === undefined || valor === null ? "" : valor).trim();

  if (obligatorio && !v) {
    errores.push("Falta " + campo);
  } else if (v.length > MAX_TEXTO) {
    errores.push(campo + " no puede pasar de " + MAX_TEXTO + " caracteres");
  }

  return v;
}

function validarRegistro(cuerpo, conId) {
  const errores = [];
  const r = {};

  if (conId) {
    r.id = texto(cuerpo.id, "el identificador", errores, true);
    if (r.id.length > 64) errores.push("El identificador es demasiado largo");
  }

  r.nombre = texto(cuerpo.nombre, "el nombre del proyecto", errores, true);
  r.empresa = texto(cuerpo.empresa, "la empresa", errores, true);

  const monto = Number(cuerpo.monto);
  if (!Number.isFinite(monto) || monto < 0) {
    errores.push("El monto debe ser un número mayor o igual a cero");
    r.monto = 0;
  } else if (monto > MAX_MONTO) {
    errores.push("El monto es demasiado grande");
    r.monto = 0;
  } else {
    r.monto = monto;
  }

  /* Sin fecha, el alta toma la de hoy (lo resuelve db.crear) y
     la edición conserva la que ya tenía. Nunca se rellena aquí
     con "ahora": en una edición eso mudaría la cotización al
     mes en curso. */
  if (cuerpo.fecha === undefined || cuerpo.fecha === null || cuerpo.fecha === "") {
    r.fecha = null;
  } else {
    const fecha = new Date(cuerpo.fecha);
    if (isNaN(fecha.getTime())) {
      errores.push("La fecha no es válida");
    } else if (fecha.getFullYear() < ANIO_MINIMO) {
      errores.push("La fecha no puede ser anterior al año " + ANIO_MINIMO);
    } else if (fecha.getTime() > Date.now() + MARGEN_FUTURO) {
      errores.push("La fecha no puede ser posterior a hoy");
    } else {
      r.fecha = fecha.toISOString();
    }
  }

  r.venta = cuerpo.venta ? 1 : 0;
  r.cobro = cuerpo.cobro ? 1 : 0;

  return { registro: r, errores: errores };
}

/* Periodo de meta: "2026-09" */
function validarPeriodo(periodo) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(periodo));
}

/* =========================================================
   Archivos que se entregan al navegador

   Es una lista explícita a propósito. Servir el directorio
   completo con express.static(__dirname) dejaría a la vista
   server.js, db.js y el archivo .db.
   ========================================================= */
const PUBLICOS = {
  "/login.html": ["login.html", "text/html; charset=utf-8"],
  "/login.js": ["login.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  /* Lo cargan la pantalla de acceso y la de cuentas. Va aquí
     porque la primera se ve sin haber entrado, y el archivo no
     contiene nada que valga la pena esconder. */
  "/ojo.js": ["ojo.js", "text/javascript; charset=utf-8"]
};

const PRIVADOS = {
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/almacen.js": ["almacen.js", "text/javascript; charset=utf-8"],
  "/sesion.js": ["sesion.js", "text/javascript; charset=utf-8"],
  /* El mismo archivo que usa el servidor para el PDF */
  "/calculos.js": ["calculos.js", "text/javascript; charset=utf-8"]
};

/* Las pantallas de cuentas y de respaldos. No basta con tener
   sesión: hay que ser admin. Van aparte de PRIVADOS porque la
   respuesta cuando falta permiso es distinta. */
const SOLO_ADMIN = {
  "/admin.html": ["admin.html", "text/html; charset=utf-8"],
  "/admin.js": ["admin.js", "text/javascript; charset=utf-8"],
  "/respaldos.html": ["respaldos.html", "text/html; charset=utf-8"],
  "/respaldos.js": ["respaldos.js", "text/javascript; charset=utf-8"]
};

function entregar(res, entrada) {
  const ruta = path.join(__dirname, entrada[0]);
  fs.readFile(ruta, function (e, contenido) {
    if (e) {
      console.error("No se pudo leer", entrada[0], e.message);
      return res.status(500).type("text/plain").send("Archivo no disponible");
    }
    res.type(entrada[1]);
    res.set("Cache-Control", "no-cache");
    res.send(contenido);
  });
}

app.use(identificar);

/* =========================================================
   Páginas
   ========================================================= */
app.get("/", function (req, res) {
  res.redirect(req.sesion ? "/index.html" : "/login.html");
});

app.get("/login.html", function (req, res) {
  if (req.sesion) return res.redirect("/index.html");
  entregar(res, PUBLICOS["/login.html"]);
});

Object.keys(PUBLICOS).forEach(function (ruta) {
  if (ruta === "/login.html") return;
  app.get(ruta, function (req, res) { entregar(res, PUBLICOS[ruta]); });
});

Object.keys(PRIVADOS).forEach(function (ruta) {
  app.get(ruta, function (req, res) {
    if (!req.sesion) {
      /* Una petición de página se redirige; una de script no,
         porque devolver HTML donde se espera JS solo produce
         un error confuso en la consola */
      if (ruta === "/index.html") return res.redirect("/login.html");
      return res.status(401).type("text/plain").send("Sesión no iniciada");
    }
    entregar(res, PRIVADOS[ruta]);
  });
});

Object.keys(SOLO_ADMIN).forEach(function (ruta) {
  const esPagina = /\.html$/.test(ruta);

  app.get(ruta, function (req, res) {
    if (!req.sesion) {
      if (esPagina) return res.redirect("/login.html");
      return res.status(401).type("text/plain").send("Sesión no iniciada");
    }

    /* A quien no administra se le devuelve al dashboard en vez de
       enseñarle un error: no hizo nada malo, esa pantalla
       simplemente no es suya */
    if (req.sesion.rol !== "admin") {
      if (esPagina) return res.redirect("/index.html");
      return res.status(403).type("text/plain").send("Solo la administración");
    }

    entregar(res, SOLO_ADMIN[ruta]);
  });
});

/* =========================================================
   Acceso

   El conteo de intentos vive en memoria: se reinicia si el
   servicio se reinicia. Es suficiente para frenar fuerza
   bruta, que es lo que se busca aquí.
   ========================================================= */
const intentos = new Map();

function bloqueadoHasta(clave) {
  const registro = intentos.get(clave);
  if (!registro) return 0;
  if (registro.hasta && registro.hasta > Date.now()) return registro.hasta;
  return 0;
}

function anotarFallo(clave) {
  const registro = intentos.get(clave) || { fallos: 0, hasta: 0 };
  registro.fallos += 1;

  if (registro.fallos >= LIMITE_INTENTOS) {
    registro.hasta = Date.now() + MINUTOS_BLOQUEO * 60 * 1000;
    registro.fallos = 0;
  }

  intentos.set(clave, registro);
}

app.post("/api/login", function (req, res) {
  const usuario = String((req.body && req.body.usuario) || "").trim().toLowerCase();
  const contrasena = String((req.body && req.body.contrasena) || "");
  const clave = usuario + "|" + (req.ip || "");

  const hasta = bloqueadoHasta(clave);
  if (hasta) {
    const minutos = Math.ceil((hasta - Date.now()) / 60000);
    return res.status(429).json({
      error: "Demasiados intentos fallidos. Vuelve a intentar en " + minutos +
             (minutos === 1 ? " minuto." : " minutos.")
    });
  }

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: "Escribe tu usuario y tu contraseña." });
  }

  const fila = db.buscarUsuario(usuario);

  /* El mismo mensaje para usuario inexistente y contraseña
     incorrecta: decir cuál de los dos falló le confirma a un
     atacante qué usuarios existen. */
  const generico = "Usuario o contraseña incorrectos.";

  if (!fila || fila.activo !== 1) {
    anotarFallo(clave);
    return res.status(401).json({ error: generico });
  }

  if (!auth.verificarContrasena(contrasena, fila.hash)) {
    anotarFallo(clave);
    return res.status(401).json({ error: generico });
  }

  intentos.delete(clave);

  const token = auth.nuevoToken();
  db.abrirSesion(auth.hashToken(token), fila.usuario, vencimiento());
  ponerCookie(res, token, HORAS_SESION * 3600);

  res.json({ usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol });
});

app.post("/api/salir", function (req, res) {
  const token = leerCookies(req).sid;
  if (token) db.cerrarSesion(auth.hashToken(token));
  borrarCookie(res);
  res.json({ ok: true });
});

app.get("/api/sesion", function (req, res) {
  if (!req.sesion) return res.status(401).json({ error: "Sesión no iniciada" });
  res.json(req.sesion);
});

/* =========================================================
   API de datos

   Cada ruta corresponde a un canal ipcMain de la app de
   escritorio. La lógica es la misma llamada a db.js.
   ========================================================= */
app.get("/api/registros", exigirSesion, function (req, res) {
  res.json(db.listar());
});

app.post("/api/registros", exigirSesion, function (req, res) {
  const v = validarRegistro(req.body || {}, true);
  if (v.errores.length) return res.status(400).json({ error: v.errores.join(". ") });

  if (db.obtener(v.registro.id)) {
    return res.status(409).json({ error: "Ya existe una cotización con ese identificador." });
  }

  db.crear(v.registro, req.sesion.usuario);
  res.status(201).json(db.obtener(v.registro.id));
});

app.put("/api/registros/:id", exigirSesion, function (req, res) {
  const cuerpo = Object.assign({}, req.body || {}, { id: req.params.id });
  const v = validarRegistro(cuerpo, true);
  if (v.errores.length) return res.status(400).json({ error: v.errores.join(". ") });

  if (!db.actualizar(v.registro, req.sesion.usuario)) {
    return res.status(404).json({ error: "Esa cotización ya no existe." });
  }

  res.json(db.obtener(v.registro.id));
});

app.delete("/api/registros/:id", exigirSesion, function (req, res) {
  if (!db.eliminar(req.params.id, req.sesion.usuario)) {
    return res.status(404).json({ error: "Esa cotización ya no existe." });
  }
  res.json({ ok: true });
});

app.get("/api/metas", exigirSesion, function (req, res) {
  res.json(db.leerMetas());
});

app.put("/api/metas/:periodo", exigirSesion, function (req, res) {
  const periodo = req.params.periodo;
  if (!validarPeriodo(periodo)) {
    return res.status(400).json({ error: "El periodo debe tener el formato AAAA-MM." });
  }

  const monto = Number((req.body || {}).monto);
  if (!Number.isFinite(monto) || monto < 0 || monto > MAX_MONTO) {
    return res.status(400).json({ error: "La meta debe ser un número mayor o igual a cero." });
  }

  db.guardarMeta(periodo, monto, req.sesion.usuario);
  res.json({ ok: true });
});

app.get("/api/info", exigirSesion, function (req, res) {
  res.json({
    tipo: "servidor",
    descripcion: "Servidor de la empresa · sesión de " + req.sesion.nombre
  });
});

/* =========================================================
   Cuentas

   Hace lo mismo que usuarios.js desde la consola, y las dos
   vías comparten las reglas de auth.js: una cuenta creada
   aquí queda idéntica a una creada allá.

   Dos barreras sostienen esto. Ninguna es un capricho: sin
   ellas un clic puede dejar el sistema sin forma de volver a
   entrar salvo abriendo la consola del servidor.

     1. Nadie se modifica a sí mismo. Bajarse el rol o darse
        de baja es la forma más rápida de quedarse fuera, y
        además es lo que garantiza que siempre sobreviva al
        menos un administrador: quien ejecuta la operación es
        un admin activo y no puede ser su propio objetivo.

     2. Borrar solo funciona sobre cuentas sin actividad. El
        resto se da de baja, para no dejar cotizaciones
        firmadas por alguien que ya no existe.

   La comprobación del último admin que sigue más abajo es,
   hoy, inalcanzable: la barrera 1 ya la implica. Se deja
   escrita a propósito, porque el día que alguien permita que
   un admin se modifique a sí mismo, es lo único que evita
   quedarse con cero.
   ========================================================= */
const ERROR_ULTIMO_ADMIN =
  "Es la única cuenta de administración activa que queda. " +
  "Nombra antes a otro administrador.";

/* Cierto cuando tocar a esta persona dejaría el sistema sin
   nadie que pueda administrarlo. Las lecturas y escrituras de
   node:sqlite son síncronas, así que entre la consulta y el
   UPDATE no se cuela otra petición: no hace falta transacción. */
function esUltimoAdmin(fila) {
  return fila.rol === "admin" && fila.activo === 1 && db.contarAdmins() <= 1;
}

app.get("/api/usuarios", exigirAdmin, function (req, res) {
  res.json(db.listarUsuarios().map(function (u) {
    const actividad = db.contarActividadDe(u.usuario);

    return {
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol,
      activo: u.activo === 1,
      creadoEn: u.creado_en,
      /* La pantalla lo usa para saber si ofrecer "Borrar" o
         solamente "Dar de baja" */
      actividad: actividad.registros + actividad.movimientos,
      yo: u.usuario === req.sesion.usuario
    };
  }));
});

app.post("/api/usuarios", exigirAdmin, function (req, res) {
  const cuerpo = req.body || {};
  const usuario = String(cuerpo.usuario || "").trim().toLowerCase();
  const nombre = String(cuerpo.nombre || "").trim();
  const rol = String(cuerpo.rol || "usuario").trim().toLowerCase();
  const contrasena = String(cuerpo.contrasena || "");

  if (!auth.usuarioValido(usuario)) {
    return res.status(400).json({
      error: "El usuario debe tener entre 3 y 32 caracteres: letras minúsculas, " +
             "números, punto, guion o guion bajo."
    });
  }
  if (!nombre) {
    return res.status(400).json({ error: "Falta el nombre completo." });
  }
  if (nombre.length > MAX_TEXTO) {
    return res.status(400).json({ error: "El nombre no puede pasar de " + MAX_TEXTO + " caracteres." });
  }
  if (!auth.rolValido(rol)) {
    return res.status(400).json({ error: "El rol solo puede ser " + auth.ROLES.join(" o ") + "." });
  }
  if (contrasena.length < auth.MINIMO_CONTRASENA) {
    return res.status(400).json({
      error: "La contraseña debe tener al menos " + auth.MINIMO_CONTRASENA + " caracteres."
    });
  }
  if (db.buscarUsuario(usuario)) {
    return res.status(409).json({ error: "Ya existe el usuario " + usuario + "." });
  }

  db.crearUsuario(usuario, nombre, auth.hashContrasena(contrasena), rol);
  db.anotar(req.sesion.usuario, "alta de cuenta", usuario, nombre + " · " + rol);

  res.status(201).json({ usuario: usuario, nombre: nombre, rol: rol, activo: true });
});

app.put("/api/usuarios/:usuario/contrasena", exigirAdmin, function (req, res) {
  const usuario = String(req.params.usuario || "").trim().toLowerCase();
  const contrasena = String((req.body || {}).contrasena || "");

  if (!db.buscarUsuario(usuario)) {
    return res.status(404).json({ error: "No existe el usuario " + usuario + "." });
  }
  if (contrasena.length < auth.MINIMO_CONTRASENA) {
    return res.status(400).json({
      error: "La contraseña debe tener al menos " + auth.MINIMO_CONTRASENA + " caracteres."
    });
  }

  db.cambiarContrasena(usuario, auth.hashContrasena(contrasena));

  /* Cambiar la contraseña cierra lo que estuviera abierto: es
     justo lo que se espera si se cambió por sospecha */
  db.cerrarSesionesDe(usuario);
  db.anotar(req.sesion.usuario, "cambio de contraseña", usuario, "");

  /* Cambiarse la propia también cierra la sesión de quien la
     cambió, así que la pantalla tiene que saberlo para mandarlo
     al login en vez de quedarse pidiendo datos con 401 */
  res.json({ ok: true, cerroMiSesion: usuario === req.sesion.usuario });
});

app.put("/api/usuarios/:usuario/estado", exigirAdmin, function (req, res) {
  const usuario = String(req.params.usuario || "").trim().toLowerCase();
  const activo = !!(req.body || {}).activo;
  const fila = db.buscarUsuario(usuario);

  if (!fila) {
    return res.status(404).json({ error: "No existe el usuario " + usuario + "." });
  }
  if (usuario === req.sesion.usuario) {
    return res.status(409).json({ error: "No puedes darte de baja a ti mismo." });
  }
  if (!activo && esUltimoAdmin(fila)) {
    return res.status(409).json({ error: ERROR_ULTIMO_ADMIN });
  }

  db.activarUsuario(usuario, activo);
  db.anotar(req.sesion.usuario, activo ? "alta de acceso" : "baja de acceso", usuario, "");

  res.json({ ok: true });
});

app.put("/api/usuarios/:usuario/rol", exigirAdmin, function (req, res) {
  const usuario = String(req.params.usuario || "").trim().toLowerCase();
  const rol = String((req.body || {}).rol || "").trim().toLowerCase();
  const fila = db.buscarUsuario(usuario);

  if (!fila) {
    return res.status(404).json({ error: "No existe el usuario " + usuario + "." });
  }
  if (!auth.rolValido(rol)) {
    return res.status(400).json({ error: "El rol solo puede ser " + auth.ROLES.join(" o ") + "." });
  }
  if (usuario === req.sesion.usuario) {
    return res.status(409).json({ error: "No puedes cambiarte el rol a ti mismo." });
  }
  if (rol !== "admin" && esUltimoAdmin(fila)) {
    return res.status(409).json({ error: ERROR_ULTIMO_ADMIN });
  }

  db.cambiarRol(usuario, rol);
  db.anotar(req.sesion.usuario, "cambio de rol", usuario, fila.rol + " a " + rol);

  res.json({ ok: true });
});

app.delete("/api/usuarios/:usuario", exigirAdmin, function (req, res) {
  const usuario = String(req.params.usuario || "").trim().toLowerCase();
  const fila = db.buscarUsuario(usuario);

  if (!fila) {
    return res.status(404).json({ error: "No existe el usuario " + usuario + "." });
  }
  if (usuario === req.sesion.usuario) {
    return res.status(409).json({ error: "No puedes borrar tu propia cuenta." });
  }

  const actividad = db.contarActividadDe(usuario);

  if (actividad.registros > 0 || actividad.movimientos > 0) {
    return res.status(409).json({
      error: "No se puede borrar a " + usuario + ": ya tiene actividad registrada (" +
             actividad.registros + " cotizaciones y " + actividad.movimientos +
             " movimientos). Borrarla dejaría esos movimientos firmados por alguien " +
             "que ya no existe. Dale de baja en su lugar."
    });
  }

  if (esUltimoAdmin(fila)) {
    return res.status(409).json({ error: ERROR_ULTIMO_ADMIN });
  }

  db.eliminarUsuario(usuario);
  db.anotar(req.sesion.usuario, "borrado de cuenta", usuario, fila.nombre);

  res.json({ ok: true });
});

/* =========================================================
   Informe en PDF

   Los filtros llegan tal cual los tenía la pantalla, para que
   el papel muestre lo que la persona estaba mirando. El PDF
   se arma con calculos.js, el mismo módulo que usa app.js: si
   cada uno sumara por su lado, un día no coincidirían.

   Restringido a administración porque así se pidió. Conviene
   ser claro sobre lo que eso significa: no oculta datos, ya
   que quien captura ve las mismas cifras en pantalla. Lo que
   controla es quién emite el documento con formato.
   ========================================================= */
app.get("/api/exportar/pdf", exigirAdmin, function (req, res) {
  /* "todos" es el valor que usa la pantalla para "sin filtro".
     Cualquier otra cosa se valida como número; un mes de 99 o
     un año de texto se tratan como si no hubiera filtro. */
  function filtro(valor, minimo, maximo) {
    if (valor === undefined || valor === null || valor === "" || valor === "todos") {
      return "todos";
    }
    const n = Number(valor);
    if (!Number.isInteger(n) || n < minimo || n > maximo) return "todos";
    return n;
  }

  const filtros = {
    mes: filtro(req.query.mes, 0, 11),
    anio: filtro(req.query.anio, 1900, 3000),
    texto: String(req.query.buscar || "").slice(0, MAX_TEXTO)
  };

  const nombre = exportar.nombreArchivo(filtros);

  res.type("application/pdf");
  res.set("Content-Disposition", 'attachment; filename="' + nombre + '"');
  res.set("Cache-Control", "no-store");

  try {
    exportar.informe(res, {
      registros: db.listar(),
      metas: db.leerMetas(),
      filtros: filtros,
      quien: req.sesion.nombre
    });
  } catch (e) {
    /* Si falla antes de mandar nada todavía se puede responder
       un error; si ya empezó a escribir el PDF, lo único que
       queda es cortar, porque las cabeceras ya salieron */
    console.error("Error armando el PDF:", e.message);
    if (!res.headersSent) {
      return res.status(500).type("application/json")
        .send(JSON.stringify({ error: "No se pudo generar el informe." }));
    }
    res.end();
  }
});

/* =========================================================
   Respaldo de la base

   Hay dos caminos y los dos hacen exactamente lo mismo, porque
   comparten crearRespaldo():

   - Automático, una vez al día. Es el que de verdad protege:
     no depende de que nadie se acuerde.
   - Manual, con el botón de la pantalla de respaldos. Sirve
     para llevarse una copia justo antes de tocar algo delicado.

   La copia se queda además en el servidor. Eso cubre un caso
   distinto al de la descarga: deshacer un borrado del lunes
   sin depender de que alguien tuviera el archivo guardado.
   ========================================================= */
const CARPETA_RESPALDOS = path.join(CARPETA_DATOS, "respaldos");
const DIAS_RESPALDO = 30;

/* Hora a la que corre el respaldo diario. De madrugada porque
   VACUUM INTO lee la base entera y conviene que no coincida
   con nadie capturando. */
const HORA_RESPALDO = (function () {
  const h = Number(process.env.COTIZACIONES_RESPALDO_HORA);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 3;
})();

/* Escape para apagarlo sin tocar el código */
const RESPALDO_AUTOMATICO = process.env.COTIZACIONES_RESPALDO !== "0";

/* "2026-09-04T13-05-22" — sin dos puntos, que Windows no
   admite en nombres de archivo */
function marcaDeTiempo() {
  return new Date().toISOString().slice(0, 19).replace(/:/g, "-");
}

/* Los respaldos se nombran por fecha, así que el día que
   cubren se lee del propio nombre: "cotizaciones-2026-09-04..."
   Se usa el nombre y no la fecha del archivo porque copiar o
   restaurar una carpeta cambia las fechas del sistema. */
function diaDelRespaldo(nombre) {
  const m = /^cotizaciones-(\d{4}-\d{2}-\d{2})T/.exec(nombre);
  return m ? m[1] : null;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/* Entran en la lista los respaldos hechos aquí y los subidos
   desde la pantalla. Cualquier otro archivo de la carpeta se
   ignora, incluidos los -wal o -shm que alguien deje junto. */
function esRespaldo(nombre) {
  return /^(cotizaciones|subido)-.*\.db$/.test(nombre);
}

function listarRespaldos() {
  try {
    return fs.readdirSync(CARPETA_RESPALDOS).filter(esRespaldo);
  } catch (e) {
    /* Sin carpeta todavía no hay respaldos, que no es un error */
    return [];
  }
}

/* "cotizaciones-2026-10-01T20-14-55.db" → "2026-10-01T20:14:55.000Z".
   La marca del nombre está en UTC, igual que toISOString. */
function fechaDelNombre(nombre) {
  const m = /^(?:cotizaciones|subido)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(nombre);
  return m ? m[1] + "T" + m[2] + ":" + m[3] + ":" + m[4] + ".000Z" : null;
}

/* Crea la copia y limpia las viejas. Devuelve la ruta.
   Lanza si algo falla: quien llama decide qué hacer, porque
   no es lo mismo fallar en una descarga que en la tarea
   nocturna.

   opciones.motivo  queda escrito en la bitácora
   opciones.purgar  false para no borrar copias viejas */
/* Dos copias en el mismo segundo, como un respaldo pulsado
   justo antes de restaurar, chocarían de nombre, y VACUUM INTO
   se niega a pisar un archivo. La segunda lleva un -2. */
function nombreLibre(prefijo) {
  const marca = marcaDeTiempo();
  let nombre = prefijo + marca + ".db";
  for (let i = 2; fs.existsSync(path.join(CARPETA_RESPALDOS, nombre)); i++) {
    nombre = prefijo + marca + "-" + i + ".db";
  }
  return nombre;
}

function crearRespaldo(quien, opciones) {
  const op = opciones || {};

  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });

  const nombre = nombreLibre("cotizaciones-");
  const ruta = path.join(CARPETA_RESPALDOS, nombre);
  db.respaldar(ruta);

  const borrados = op.purgar === false ? 0 : purgarRespaldos();
  const notas = [];
  if (op.motivo) notas.push(op.motivo);
  if (borrados) notas.push("se borraron " + borrados + " respaldos de más de " + DIAS_RESPALDO + " días");
  db.anotar(quien, "respaldo", nombre, notas.join(" · "));

  return ruta;
}

function purgarRespaldos() {
  const limite = Date.now() - DIAS_RESPALDO * 24 * 3600 * 1000;
  let borrados = 0;

  let archivos;
  try {
    archivos = fs.readdirSync(CARPETA_RESPALDOS);
  } catch (e) {
    return 0;
  }

  archivos.forEach(function (nombre) {
    if (!esRespaldo(nombre)) return;

    const ruta = path.join(CARPETA_RESPALDOS, nombre);
    try {
      if (fs.statSync(ruta).mtimeMs < limite) {
        fs.unlinkSync(ruta);
        borrados++;
      }
    } catch (e) {
      /* Otro proceso pudo llevárselo entre el listado y el
         borrado; no es motivo para fallar el respaldo */
    }
  });

  return borrados;
}

/* Solo se aceptan nombres que estén en la carpeta tal cual.
   Comparar contra el listado, y no armar la ruta con lo que
   llega, es lo que impide pedir "../cotizaciones.db" o
   cualquier otro archivo del servidor. */
function rutaDeRespaldo(nombre) {
  const n = String(nombre || "");
  return listarRespaldos().indexOf(n) === -1 ? null : path.join(CARPETA_RESPALDOS, n);
}

function borrarSinQueja(ruta) {
  try {
    fs.unlinkSync(ruta);
  } catch (e) {
    /* Si no estaba, mejor */
  }
}

app.get("/api/backup", exigirAdmin, function (req, res) {
  let ruta;

  try {
    ruta = crearRespaldo(req.sesion.usuario);
  } catch (e) {
    console.error("Error respaldando:", e.message);
    return res.status(500).json({ error: "No se pudo crear el respaldo." });
  }

  res.download(ruta, path.basename(ruta), function (e) {
    /* La copia se queda en el servidor a propósito, se haya
       descargado bien o no: es la que permite volver atrás */
    if (e && !res.headersSent) {
      console.error("Error enviando el respaldo:", e.message);
    }
  });
});

/* Descargar una copia que ya está guardada, sin crear otra */
app.get("/api/backup/archivo/:nombre", exigirAdmin, function (req, res) {
  const ruta = rutaDeRespaldo(req.params.nombre);
  if (!ruta) {
    return res.status(404).json({ error: "Ese respaldo ya no está en el servidor." });
  }

  res.download(ruta, path.basename(ruta), function (e) {
    if (!e) return;
    console.error("Error enviando el respaldo:", e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "No se pudo enviar el respaldo." });
    }
  });
});

/* Qué respaldos hay guardados y qué tiene cada uno. Cada
   archivo se abre para resumirlo: con unas decenas de copias
   pequeñas es cuestión de milisegundos, y es lo que permite
   elegir la buena sin tener que restaurarla para mirar. */
app.get("/api/backup/lista", exigirAdmin, function (req, res) {
  const origenes = db.origenesDeRespaldos();

  const respaldos = listarRespaldos()
    .map(function (n) {
      const ruta = path.join(CARPETA_RESPALDOS, n);
      let s;
      try {
        s = fs.statSync(ruta);
      } catch (e) {
        return null;
      }

      const item = {
        nombre: n,
        bytes: s.size,
        /* Del nombre y no del disco: copiar la carpeta cambia
           las fechas del sistema */
        fecha: fechaDelNombre(n) || new Date(s.mtimeMs).toISOString(),
        subido: n.indexOf("subido-") === 0,
        origen: origenes[n] || null,
        resumen: null,
        error: ""
      };

      try {
        item.resumen = db.examinarArchivo(ruta, false);
      } catch (e) {
        item.error = e.paraMostrar ? e.message : "No se pudo leer el archivo.";
      }

      return item;
    })
    .filter(Boolean)
    .sort(function (a, b) { return b.fecha.localeCompare(a.fecha); });

  res.json({
    dias: DIAS_RESPALDO,
    automatico: RESPALDO_AUTOMATICO,
    hora: HORA_RESPALDO,
    actual: db.resumenActual(),
    respaldos: respaldos
  });
});

/* =========================================================
   Subir un respaldo

   Llega como el cuerpo crudo de la petición y no como
   formulario multipart: así no hace falta ninguna dependencia.
   El lector va dentro de la ruta, después de exigirAdmin, para
   que nadie sin permiso alcance a mandarle 50 MB al servidor.

   Lo subido solo se agrega a la lista. Reemplazar la base es
   otro paso, con su propia confirmación, después de ver el
   resumen y comprobar que es el archivo que se quería.
   ========================================================= */
const LIMITE_SUBIDA_MB = 50;

const leerArchivoSubido = express.raw({
  type: "application/octet-stream",
  limit: LIMITE_SUBIDA_MB + "mb"
});

/* Todo archivo SQLite empieza con estos 16 bytes. Mirarlos
   antes de escribir nada al disco descarta de inmediato un
   Excel o un PDF elegido por error. */
const CABECERA_SQLITE = Buffer.from("SQLite format 3\0", "latin1");

function nombreOriginal(req) {
  let n = req.get("X-Nombre-Archivo") || "";
  try {
    n = decodeURIComponent(n);
  } catch (e) {
    /* Se queda como vino */
  }
  return n.slice(0, MAX_TEXTO);
}

app.post("/api/backup/subir", exigirAdmin, function (req, res) {
  leerArchivoSubido(req, res, function (e) {
    if (e) {
      const grande = e.type === "entity.too.large";
      return res.status(grande ? 413 : 400).json({
        error: grande
          ? "El archivo pasa de " + LIMITE_SUBIDA_MB + " MB."
          : "No se pudo recibir el archivo."
      });
    }

    const datos = req.body;
    if (!Buffer.isBuffer(datos) || datos.length < CABECERA_SQLITE.length ||
        !datos.subarray(0, CABECERA_SQLITE.length).equals(CABECERA_SQLITE)) {
      return res.status(400).json({
        error: "Ese archivo no es una base de datos. Elige un respaldo con extensión .db."
      });
    }

    let nombre, destino, temporal, resumen;

    try {
      fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
      nombre = nombreLibre("subido-");
      destino = path.join(CARPETA_RESPALDOS, nombre);
      temporal = path.join(CARPETA_RESPALDOS, nombre.replace(/^subido-/, "subiendo-") + ".tmp");
      fs.writeFileSync(temporal, datos);
      resumen = db.importarArchivo(temporal, destino);
    } catch (err) {
      /* nombreLibre garantiza que destino no existía: si quedó
         algo, es una copia a medias de esta misma subida */
      if (destino) borrarSinQueja(destino);
      if (err.paraMostrar) return res.status(400).json({ error: err.message });
      console.error("Error subiendo un respaldo:", err.message);
      return res.status(500).json({ error: "No se pudo guardar el archivo en el servidor." });
    } finally {
      /* El temporal y lo que SQLite haya dejado al abrirlo */
      if (temporal) {
        ["", "-wal", "-shm", "-journal"].forEach(function (sufijo) {
          borrarSinQueja(temporal + sufijo);
        });
      }
    }

    const original = nombreOriginal(req);
    db.anotar(req.sesion.usuario, "subida", nombre,
      (original ? "archivo " + original + " · " : "") + resumen.cotizaciones + " cotizaciones");

    res.json({ nombre: nombre, resumen: resumen });
  });
});

/* =========================================================
   Restaurar un respaldo

   Reemplaza la base entera. Antes se guarda una copia de la
   base en uso, así que restaurar el respaldo equivocado
   también tiene vuelta atrás: basta con restaurar esa copia.

   Todas las sesiones se cierran, incluida la de quien
   restaura: las cuentas que valen ahora son las del respaldo.
   ========================================================= */
app.post("/api/backup/restaurar", exigirAdmin, function (req, res) {
  const nombre = String((req.body && req.body.nombre) || "");
  const ruta = rutaDeRespaldo(nombre);
  const quien = req.sesion.usuario;

  if (!ruta) {
    return res.status(404).json({ error: "Ese respaldo ya no está en el servidor." });
  }

  let resumen;
  try {
    resumen = db.examinarArchivo(ruta, true);
  } catch (e) {
    if (e.paraMostrar) return res.status(400).json({ error: e.message });
    console.error("Error revisando el respaldo:", e.message);
    return res.status(500).json({ error: "No se pudo revisar el respaldo." });
  }

  /* Sin purga: podría llevarse justo el respaldo que se va a
     restaurar, si acaba de cumplir los días */
  let copiaPrevia;
  try {
    copiaPrevia = path.basename(crearRespaldo(quien, {
      motivo: "antes de restaurar " + nombre,
      purgar: false
    }));
  } catch (e) {
    console.error("Error respaldando antes de restaurar:", e.message);
    return res.status(500).json({
      error: "No se pudo guardar una copia de la base en uso, así que no se restauró nada."
    });
  }

  try {
    db.restaurar(ruta);
  } catch (e) {
    console.error("Error restaurando", nombre + ":", e.message);
    return res.status(500).json({
      error: "No se pudo restaurar. La base en uso quedó como estaba."
    });
  }

  /* La bitácora que vale ahora es la del respaldo, que no sabe
     nada de esto. Sin estas dos líneas no quedaría rastro de
     quién restauró ni de dónde quedó la copia previa. */
  db.anotar(quien, "respaldo", copiaPrevia, "antes de restaurar " + nombre);
  db.anotar(quien, "restauración", nombre,
    resumen.cotizaciones + " cotizaciones · copia previa " + copiaPrevia);

  console.log("Base restaurada desde " + nombre + " por " + quien +
    " · copia previa: " + copiaPrevia);

  borrarCookie(res);
  res.json({ ok: true, copiaPrevia: copiaPrevia, resumen: resumen });
});

/* La bitácora solo la ve quien administra */
app.get("/api/bitacora", exigirAdmin, function (req, res) {
  res.json(db.leerBitacora(Number(req.query.limite) || 200));
});

/* =========================================================
   Errores
   ========================================================= */
app.use(function (req, res) {
  if (req.path.indexOf("/api/") === 0) {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }
  res.status(404).type("text/plain").send("No encontrado");
});

app.use(function (e, req, res, next) {
  console.error("Error en", req.method, req.path, "-", e.message);
  if (res.headersSent) return next(e);
  res.status(500).json({ error: "El servidor no pudo completar la operación." });
});

/* =========================================================
   Arranque
   ========================================================= */
fs.mkdirSync(CARPETA_DATOS, { recursive: true });
console.log("Base de datos en:", db.abrir(CARPETA_DATOS));

if (db.contarUsuarios() === 0) {
  console.log("");
  console.log("  No hay usuarios dados de alta todavía.");
  console.log("  Crea el primero antes de repartir la dirección:");
  console.log("");
  console.log("    node usuarios.js crear admin \"Nombre Apellido\" admin");
  console.log("");
  console.log("  La contraseña se pide aparte, no va en el comando.");
  console.log("");
}

/* Las sesiones vencidas se van acumulando; se limpian al
   arrancar y una vez por hora */
db.purgarSesiones();
const limpieza = setInterval(db.purgarSesiones, 3600 * 1000);
limpieza.unref();

/* =========================================================
   Respaldo diario

   Se programa dentro del propio proceso en vez de dejarlo al
   Programador de tareas de Windows. Así el respaldo viaja con
   la aplicación: quien la instale no tiene que acordarse de
   configurar nada aparte, que es justo lo que se olvida y
   deja a un servidor entero sin copias durante meses.

   Dos comportamientos que no son obvios pero importan:

   - Al arrancar se comprueba si hoy ya hay respaldo. Si la
     máquina estuvo apagada a las 3 de la madrugada, ese día
     se habría perdido; así se recupera en cuanto encienda.

   - El día se lee del nombre del archivo, no de su fecha en
     disco, porque copiar o restaurar la carpeta de respaldos
     cambia las fechas del sistema y haría creer que hay copia
     de hoy cuando no la hay.
   ========================================================= */
function respaldoDiario(motivo) {
  const yaHayDeHoy = listarRespaldos().some(function (n) {
    return diaDelRespaldo(n) === hoyISO();
  });

  if (yaHayDeHoy) return false;

  try {
    const ruta = crearRespaldo("automático");
    console.log("Respaldo " + motivo + ":", path.basename(ruta));
    return true;
  } catch (e) {
    /* Un respaldo fallido no debe tumbar el servidor: se avisa
       fuerte y se sigue atendiendo, que es el mal menor */
    console.error("FALLO EL RESPALDO AUTOMATICO:", e.message);
    return false;
  }
}

function programarRespaldo() {
  const ahora = new Date();
  const proximo = new Date(ahora);

  proximo.setHours(HORA_RESPALDO, 0, 0, 0);
  if (proximo <= ahora) proximo.setDate(proximo.getDate() + 1);

  const espera = proximo.getTime() - ahora.getTime();

  /* setTimeout no admite esperas de más de 24,8 días, y aquí
     nunca pasa de 24 horas, así que no hace falta trocearlo */
  const temporizador = setTimeout(function () {
    respaldoDiario("diario");
    programarRespaldo();
  }, espera);

  /* unref para que un respaldo pendiente no impida que el
     proceso termine cuando se le pide cerrar */
  temporizador.unref();

  return proximo;
}

if (RESPALDO_AUTOMATICO) {
  respaldoDiario("de arranque");
  const proximo = programarRespaldo();
  console.log("Respaldo automático diario a las " +
    String(HORA_RESPALDO).padStart(2, "0") + ":00 · el próximo, el " +
    proximo.toLocaleDateString("es-BO") + " · se conservan " +
    DIAS_RESPALDO + " días");
} else {
  console.log("Respaldo automático desactivado (COTIZACIONES_RESPALDO=0)");
}

const servidor = app.listen(PUERTO, HOST, function () {
  console.log("Dashboard de cotizaciones escuchando en " + HOST + ":" + PUERTO);
  if (HOST === "0.0.0.0") {
    console.log("Desde las demás computadoras: http://<ip-del-servidor>:" + PUERTO);
  }
});

function apagar() {
  console.log("Cerrando...");
  servidor.close(function () {
    db.cerrar();
    process.exit(0);
  });

  /* Si alguna conexión no cierra sola, no dejar el proceso colgado */
  setTimeout(function () { process.exit(0); }, 5000).unref();
}

process.on("SIGINT", apagar);
process.on("SIGTERM", apagar);
