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

  reemplazar: function (lista) {
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
    const self = this;
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

  reemplazar: function (lista) {
    return window.api.reemplazar(lista);
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
   Se elige la versión según dónde se esté ejecutando
   --------------------------------------------------------- */
const Almacen = (typeof window !== "undefined" && window.api)
  ? AlmacenSQLite
  : AlmacenLocal;
