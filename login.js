/* =========================================================
   Pantalla de acceso

   Manda usuario y contraseña al servidor. Si el servidor los
   acepta, devuelve la cookie de sesión y aquí solo queda
   entrar al dashboard.
   ========================================================= */

const formulario = document.getElementById("formLogin");
const campoUsuario = document.getElementById("usuario");
const campoContrasena = document.getElementById("contrasena");
const aviso = document.getElementById("errorLogin");
const boton = document.getElementById("btnEntrar");

function mostrarError(mensaje) {
  aviso.textContent = mensaje;
  aviso.hidden = false;
  campoContrasena.value = "";
  campoContrasena.focus();
}

function ocultarError() {
  aviso.hidden = true;
}

formulario.addEventListener("submit", function (e) {
  e.preventDefault();
  ocultarError();

  const datos = {
    usuario: campoUsuario.value.trim(),
    contrasena: campoContrasena.value
  };

  if (!datos.usuario || !datos.contrasena) {
    mostrarError("Escribe tu usuario y tu contraseña.");
    return;
  }

  boton.disabled = true;
  boton.textContent = "Entrando...";

  fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos)
  }).then(function (r) {
    return r.json().then(function (cuerpo) {
      return { ok: r.ok, cuerpo: cuerpo };
    });
  }).then(function (r) {
    if (!r.ok) throw new Error(r.cuerpo.error || "No se pudo entrar.");
    window.location.replace("/index.html");
  }).catch(function (e) {
    mostrarError(e.message === "Failed to fetch"
      ? "No hay conexión con el servidor. Avisa a soporte."
      : e.message);
    boton.disabled = false;
    boton.textContent = "Entrar";
  });
});
