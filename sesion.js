/* =========================================================
   Barra de sesión

   Solo aparece cuando el dashboard llega desde el servidor de
   la empresa. En la app de escritorio y en el index.html
   suelto no hay sesión que mostrar, así que se queda oculta.
   ========================================================= */

(function () {

  const barra = document.getElementById("sesion");
  const etiqueta = document.getElementById("sesionNombre");
  const boton = document.getElementById("btnSalir");

  if (!barra || !etiqueta || !boton) return;

  /* Dentro de Electron no hay usuarios: los datos son locales */
  if (window.api) return;

  const enServidor = window.location.protocol === "http:" ||
    window.location.protocol === "https:";
  if (!enServidor) return;

  fetch("/api/sesion", { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) throw new Error("sin sesión");
      return r.json();
    })
    .then(function (sesion) {
      etiqueta.textContent = sesion.nombre;
      barra.hidden = false;
    })
    .catch(function () {
      /* Sin sesión no debería verse el dashboard; el servidor
         ya redirige, esto solo cubre la cookie vencida a
         media mañana con la página abierta */
      window.location.replace("/login.html");
    });

  boton.addEventListener("click", function () {
    boton.disabled = true;

    fetch("/api/salir", { method: "POST", credentials: "same-origin" })
      .catch(function () { /* salir siempre debe llevar a la pantalla de acceso */ })
      .then(function () {
        window.location.replace("/login.html");
      });
  });

})();
