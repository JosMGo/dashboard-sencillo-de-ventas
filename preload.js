/* =========================================================
   Puente entre la página y la base de datos

   Expone window.api con los métodos justos y nada más.
   almacen.js detecta window.api para saber que está corriendo
   dentro de la app de escritorio.
   ========================================================= */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  listar: function () {
    return ipcRenderer.invoke("listar");
  },
  crear: function (registro) {
    return ipcRenderer.invoke("crear", registro);
  },
  actualizar: function (registro) {
    return ipcRenderer.invoke("actualizar", registro);
  },
  eliminar: function (id) {
    return ipcRenderer.invoke("eliminar", id);
  },
  leerMetas: function () {
    return ipcRenderer.invoke("leerMetas");
  },
  guardarMeta: function (periodo, monto) {
    return ipcRenderer.invoke("guardarMeta", periodo, monto);
  },
  info: function () {
    return ipcRenderer.invoke("info");
  }
});
