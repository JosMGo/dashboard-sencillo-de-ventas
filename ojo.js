/* =========================================================
   Ojo para ver la contraseña

   Lo usan la pantalla de acceso y la de cuentas, así que vive
   en su propio archivo en vez de estar copiado en los dos.

   Se aplica solo a los campos marcados con data-ojo. El
   envoltorio y el botón los crea este script: así el HTML se
   queda limpio y, si el archivo no carga, lo que queda es un
   campo de contraseña normal y corriente.

   Por qué hace falta: la contraseña se escribe a ciegas, y
   equivocarse al teclearla es la causa más común de no poder
   entrar. Verla un momento sale más barato que bloquear la
   cuenta a los cinco intentos.
   ========================================================= */

(function () {

  /* Iconos de trazo, sin relleno: heredan el color del botón y
     se ven igual a cualquier tamaño */
  const OJO =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
    '<circle cx="12" cy="12" r="3"/></svg>';

  const OJO_TACHADO =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 ' +
    '18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 ' +
    '18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>' +
    '<line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function preparar(campo) {
    /* El envoltorio da el punto de referencia para colocar el
       botón encima del campo. Mover el input aquí dentro no
       cambia su identidad: quien ya lo tenga guardado con
       getElementById sigue apuntando al mismo nodo. */
    const envoltura = document.createElement("span");
    envoltura.className = "clave-campo";
    campo.parentNode.insertBefore(envoltura, campo);
    envoltura.appendChild(campo);

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "clave-ojo";
    boton.innerHTML = OJO;
    boton.setAttribute("aria-label", "Mostrar la contraseña");
    boton.setAttribute("aria-pressed", "false");
    envoltura.appendChild(boton);

    boton.addEventListener("click", function () {
      const seVeia = campo.type === "text";

      campo.type = seVeia ? "password" : "text";
      boton.innerHTML = seVeia ? OJO : OJO_TACHADO;
      boton.setAttribute("aria-label",
        seVeia ? "Mostrar la contraseña" : "Ocultar la contraseña");
      boton.setAttribute("aria-pressed", seVeia ? "false" : "true");

      /* Devolver el foco al campo con el cursor al final: sin
         esto se sigue escribiendo desde donde estuviera, o
         peor, sobre el texto seleccionado */
      campo.focus();
      try {
        campo.setSelectionRange(campo.value.length, campo.value.length);
      } catch (e) {
        /* Algún navegador no lo permite según el tipo; el foco
           ya está puesto, que es lo que importa */
      }
    });
  }

  const campos = document.querySelectorAll("input[data-ojo]");
  Array.prototype.forEach.call(campos, preparar);

})();
