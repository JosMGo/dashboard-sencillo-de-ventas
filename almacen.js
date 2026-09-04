/* =========================================================
   Capa de guardado

   El dashboard funciona en dos entornos y este archivo decide
   dónde se guardan los datos:

   - Navegador (GitHub Pages o index.html suelto) -> localStorage
   - App de escritorio (Electron)                 -> SQLite en disco

   Las dos versiones exponen exactamente los mismos métodos,
   así que app.js no necesita saber cuál está usando.
   Todos los métodos devuelven una promesa.
   ========================================================= */

const CLAVE_STORAGE = "cotizaciones";
const CLAVE_METAS = "metas";

/* ---------------------------------------------------------
   Versión navegador: localStorage
   --------------------------------------------------------- */
const AlmacenLocal = {

  leerTodo: function () {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE_STORAGE));
      return Array.isArray(datos) ? datos : [];
    } catch (e) {
      return [];
    }
  },

  escribirTodo: function (lista) {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(lista));
  },

  listar: function () {
    return Promise.resolve(this.leerTodo());
  },

  crear: function (registro) {
    const lista = this.leerTodo();
    lista.push(registro);
    this.escribirTodo(lista);
    return Promise.resolve();
  },

  actualizar: function (registro) {
    const lista = this.leerTodo().map(function (r) {
      return r.id === registro.id ? registro : r;
    });
    this.escribirTodo(lista);
    return Promise.resolve();
  },

  eliminar: function (id) {
    const lista = this.leerTodo().filter(function (r) {
      return r.id !== id;
    });
    this.escribirTodo(lista);
    return Promise.resolve();
  },

  /* Metas: un objeto { "2026-09": 150000, "2026-10": 180000 } */
  leerMetas: function () {
    return Promise.resolve((function () {
      try {
        const datos = JSON.parse(localStorage.getItem(CLAVE_METAS));
        return (datos && typeof datos === "object") ? datos : {};
      } catch (e) {
        return {};
      }
    })());
  },

  guardarMeta: function (periodo, monto) {
    return this.leerMetas().then(function (metas) {
      if (monto > 0) metas[periodo] = monto;
      else delete metas[periodo];
      localStorage.setItem(CLAVE_METAS, JSON.stringify(metas));
    });
  },

  /* ¿El navegador permite guardar? */
  disponible: function () {
    try {
      localStorage.setItem("__prueba__", "1");
      localStorage.removeItem("__prueba__");
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  },

  info: function () {
    return Promise.resolve({
      tipo: "navegador",
      descripcion: "Guardado en este navegador (localStorage)"
    });
  }
};

/* ---------------------------------------------------------
   Versión escritorio: SQLite

   window.api lo expone preload.js y solo existe cuando el
   dashboard corre dentro de Electron.
   --------------------------------------------------------- */
const AlmacenSQLite = {

  listar: function () {
    return window.api.listar();
  },

  crear: function (registro) {
    return window.api.crear(registro);
  },

  actualizar: function (registro) {
    return window.api.actualizar(registro);
  },

  eliminar: function (id) {
    return window.api.eliminar(id);
  },

  leerMetas: function () {
    return window.api.leerMetas();
  },

  guardarMeta: function (periodo, monto) {
    return window.api.guardarMeta(periodo, monto);
  },

  disponible: function () {
    return Promise.resolve(true);
  },

  info: function () {
    return window.api.info();
  }
};

/* ---------------------------------------------------------
   Versión servidor: API HTTP

   Se usa cuando la página llega desde el servidor de la
   empresa. Los datos quedan en la base compartida, así que
   lo que captura una persona lo ven todas.

   La sesión viaja en una cookie httpOnly que pone el
   servidor: aquí no se maneja ningún token.
   --------------------------------------------------------- */
const AlmacenHTTP = {

  /* Si la sesión venció, el servidor responde 401 y no tiene
     caso seguir: se manda a la pantalla de acceso */
  pedir: function (ruta, opciones) {
    const config = Object.assign({
      method: "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    }, opciones || {});

    return fetch(ruta, config).then(function (respuesta) {
      if (respuesta.status === 401) {
        window.location.replace("/login.html");
        throw new Error("La sesión terminó.");
      }

      if (respuesta.status === 204) return null;

      return respuesta.json().catch(function () {
        throw new Error("El servidor respondió algo inesperado.");
      }).then(function (cuerpo) {
        if (!respuesta.ok) {
          throw new Error(cuerpo.error || "El servidor rechazó la operación.");
        }
        return cuerpo;
      });
    });
  },

  listar: function () {
    return this.pedir("/api/registros");
  },

  crear: function (registro) {
    return this.pedir("/api/registros", {
      method: "POST",
      body: JSON.stringify(registro)
    });
  },

  actualizar: function (registro) {
    return this.pedir("/api/registros/" + encodeURIComponent(registro.id), {
      method: "PUT",
      body: JSON.stringify(registro)
    });
  },

  eliminar: function (id) {
    return this.pedir("/api/registros/" + encodeURIComponent(id), {
      method: "DELETE"
    });
  },

  leerMetas: function () {
    return this.pedir("/api/metas");
  },

  guardarMeta: function (periodo, monto) {
    return this.pedir("/api/metas/" + encodeURIComponent(periodo), {
      method: "PUT",
      body: JSON.stringify({ monto: monto })
    });
  },

  /* Aquí "disponible" significa que hay sesión abierta y el
     servidor responde */
  disponible: function () {
    return this.pedir("/api/sesion").then(function () {
      return true;
    }).catch(function () {
      return false;
    });
  },

  info: function () {
    return this.pedir("/api/info").catch(function () {
      return { tipo: "servidor", descripcion: "Servidor de la empresa" };
    });
  }
};

/* ---------------------------------------------------------
   Se elige la versión según dónde se esté ejecutando

   - Dentro de Electron      -> SQLite local (window.api)
   - Servido por http(s)     -> API del servidor
   - index.html suelto       -> localStorage de este navegador
   --------------------------------------------------------- */
const desdeServidor = typeof window !== "undefined" &&
  window.location &&
  (window.location.protocol === "http:" || window.location.protocol === "https:");

const Almacen = (typeof window !== "undefined" && window.api)
  ? AlmacenSQLite
  : (desdeServidor ? AlmacenHTTP : AlmacenLocal);
