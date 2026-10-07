/* =========================================================
   Pantalla de cuentas

   Todo lo que hace aquí la administración lo revisa otra vez
   el servidor: esconder un botón no impide nada, solo evita
   ofrecer algo que va a fallar.

   La tabla se arma con nodos y no con innerHTML: el nombre es
   texto libre y así no hay forma de que se interprete como
   marcado.
   ========================================================= */

(function () {

  const aviso = document.getElementById("aviso");
  const avisoOk = document.getElementById("avisoOk");
  const cuerpo = document.getElementById("tbodyUsuarios");
  const conteo = document.getElementById("conteo");
  const cargando = document.getElementById("cargando");
  const formAlta = document.getElementById("formAlta");
  const btnCrear = document.getElementById("btnCrear");

  const modal = document.getElementById("modalClave");
  const modalTitulo = document.getElementById("modalClaveTitulo");
  const formClave = document.getElementById("formClave");
  const claveNueva = document.getElementById("claveNueva");
  const claveRepetida = document.getElementById("claveRepetida");
  const claveError = document.getElementById("claveError");
  const btnClaveGuardar = document.getElementById("btnClaveGuardar");

  const MINIMO = 8;

  /* A quién se le está cambiando la contraseña ahora mismo */
  let objetivo = null;

  /* ---------------------------------------------------------
     Peticiones
     --------------------------------------------------------- */
  function pedir(ruta, opciones) {
    const config = Object.assign({
      method: "GET",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    }, opciones || {});

    return fetch(ruta, config).then(function (respuesta) {
      /* Sin sesión no hay nada que mostrar, y sin rol tampoco:
         en los dos casos se sale de esta pantalla en vez de
         dejarla a medias */
      if (respuesta.status === 401) {
        window.location.replace("/login.html");
        throw new Error("La sesión terminó.");
      }
      if (respuesta.status === 403) {
        window.location.replace("/index.html");
        throw new Error("Sin permiso.");
      }

      return respuesta.json().catch(function () {
        throw new Error("El servidor respondió algo inesperado.");
      }).then(function (datos) {
        if (!respuesta.ok) {
          throw new Error(datos.error || "El servidor rechazó la operación.");
        }
        return datos;
      });
    });
  }

  /* ---------------------------------------------------------
     Avisos
     --------------------------------------------------------- */
  function limpiarAvisos() {
    aviso.hidden = true;
    avisoOk.hidden = true;
  }

  function mostrarError(mensaje) {
    avisoOk.hidden = true;
    aviso.textContent = mensaje;
    aviso.hidden = false;
    window.scrollTo(0, 0);
  }

  function mostrarOk(mensaje) {
    aviso.hidden = true;
    avisoOk.textContent = mensaje;
    avisoOk.hidden = false;
  }

  /* "Failed to fetch" no le dice nada a quien administra; lo
     útil es saber que el servidor no está respondiendo */
  function texto(e) {
    return e.message === "Failed to fetch"
      ? "No hay conexión con el servidor."
      : e.message;
  }

  /* ---------------------------------------------------------
     Tabla
     --------------------------------------------------------- */
  function celda(contenido, clase) {
    const td = document.createElement("td");
    td.textContent = contenido;
    if (clase) td.className = clase;
    return td;
  }

  function boton(etiqueta, clase, alPulsar) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn-mini" + (clase ? " " + clase : "");
    b.textContent = etiqueta;
    b.addEventListener("click", alPulsar);
    return b;
  }

  function fila(u) {
    const tr = document.createElement("tr");
    if (!u.activo) tr.className = "usuario-baja";

    const tdUsuario = document.createElement("td");
    tdUsuario.className = "usuario-id";
    tdUsuario.textContent = u.usuario;

    /* Marcar la propia cuenta explica por qué le faltan
       botones; sin la marca parece que la tabla se rompió */
    if (u.yo) {
      const marca = document.createElement("span");
      marca.className = "etiqueta-yo";
      marca.textContent = "tú";
      tdUsuario.appendChild(document.createTextNode(" "));
      tdUsuario.appendChild(marca);
    }

    tr.appendChild(tdUsuario);
    tr.appendChild(celda(u.nombre));
    tr.appendChild(celda(u.rol === "admin" ? "Administración" : "Usuario"));

    const tdEstado = celda(u.activo ? "Activo" : "Dado de baja");
    tdEstado.className = u.activo ? "estado-activo" : "estado-baja";
    tr.appendChild(tdEstado);

    tr.appendChild(celda(String(u.actividad), "num"));

    const tdAcciones = document.createElement("td");
    tdAcciones.className = "acciones";

    tdAcciones.appendChild(boton("Contraseña", "", function () {
      abrirModal(u);
    }));

    /* Sobre la propia cuenta solo queda la contraseña: el
       servidor rechaza el resto y no tiene caso ofrecerlo */
    if (!u.yo) {
      tdAcciones.appendChild(boton(
        u.rol === "admin" ? "Hacer usuario" : "Hacer admin",
        "",
        function () { cambiarRol(u); }
      ));

      tdAcciones.appendChild(boton(
        u.activo ? "Dar de baja" : "Reactivar",
        "",
        function () { cambiarEstado(u); }
      ));

      /* Borrar solo aparece cuando de verdad se puede: con
         actividad registrada el servidor lo niega, y entonces
         lo correcto es dar de baja */
      if (u.actividad === 0) {
        tdAcciones.appendChild(boton("Borrar", "borrar", function () {
          borrar(u);
        }));
      }
    }

    tr.appendChild(tdAcciones);
    return tr;
  }

  function pintar(usuarios) {
    cuerpo.textContent = "";
    usuarios.forEach(function (u) { cuerpo.appendChild(fila(u)); });

    const activos = usuarios.filter(function (u) { return u.activo; }).length;
    conteo.textContent = usuarios.length + " en total · " + activos + " con acceso";

    cargando.hidden = usuarios.length > 0;
    if (!usuarios.length) cargando.textContent = "No hay cuentas dadas de alta.";
  }

  function cargar() {
    return pedir("/api/usuarios")
      .then(pintar)
      .catch(function (e) { mostrarError(texto(e)); });
  }

  /* ---------------------------------------------------------
     Alta
     --------------------------------------------------------- */
  formAlta.addEventListener("submit", function (e) {
    e.preventDefault();
    limpiarAvisos();

    const usuario = document.getElementById("usuario").value.trim().toLowerCase();
    const nombre = document.getElementById("nombre").value.trim();
    const rol = document.getElementById("rol").value;
    const contrasena = document.getElementById("contrasena").value;
    const repetida = document.getElementById("contrasena2").value;

    if (contrasena !== repetida) {
      return mostrarError("Las contraseñas no coinciden.");
    }
    if (contrasena.length < MINIMO) {
      return mostrarError("La contraseña debe tener al menos " + MINIMO + " caracteres.");
    }

    btnCrear.disabled = true;
    btnCrear.textContent = "Dando de alta...";

    pedir("/api/usuarios", {
      method: "POST",
      body: JSON.stringify({
        usuario: usuario,
        nombre: nombre,
        rol: rol,
        contrasena: contrasena
      })
    }).then(function (creado) {
      formAlta.reset();
      mostrarOk("Listo. " + creado.nombre + " ya puede entrar con el usuario \"" +
                creado.usuario + "\".");
      return cargar();
    }).catch(function (e) {
      mostrarError(texto(e));
    }).then(function () {
      btnCrear.disabled = false;
      btnCrear.textContent = "Dar de alta";
    });
  });

  /* ---------------------------------------------------------
     Acciones sobre una cuenta
     --------------------------------------------------------- */
  function cambiarEstado(u) {
    limpiarAvisos();

    if (u.activo && !window.confirm(
      "¿Quitarle el acceso a " + u.nombre + "?\n\n" +
      "Sus sesiones abiertas se cierran de inmediato. Lo que ya capturó se conserva."
    )) return;

    pedir("/api/usuarios/" + encodeURIComponent(u.usuario) + "/estado", {
      method: "PUT",
      body: JSON.stringify({ activo: !u.activo })
    }).then(function () {
      mostrarOk(u.activo
        ? u.nombre + " quedó sin acceso."
        : u.nombre + " puede entrar de nuevo.");
      return cargar();
    }).catch(function (e) { mostrarError(texto(e)); });
  }

  function cambiarRol(u) {
    limpiarAvisos();
    const nuevo = u.rol === "admin" ? "usuario" : "admin";

    if (nuevo === "admin" && !window.confirm(
      "¿Dar administración a " + u.nombre + "?\n\n" +
      "Podrá dar de alta y de baja a cualquiera, y ver la bitácora."
    )) return;

    pedir("/api/usuarios/" + encodeURIComponent(u.usuario) + "/rol", {
      method: "PUT",
      body: JSON.stringify({ rol: nuevo })
    }).then(function () {
      mostrarOk(u.nombre + " ahora es " +
                (nuevo === "admin" ? "administración" : "usuario") + ".");
      return cargar();
    }).catch(function (e) { mostrarError(texto(e)); });
  }

  function borrar(u) {
    limpiarAvisos();

    if (!window.confirm(
      "¿Borrar por completo la cuenta de " + u.nombre + "?\n\n" +
      "No tiene actividad registrada, así que no queda rastro que romper. " +
      "Esto no se puede deshacer."
    )) return;

    pedir("/api/usuarios/" + encodeURIComponent(u.usuario), { method: "DELETE" })
      .then(function () {
        mostrarOk("Cuenta \"" + u.usuario + "\" borrada.");
        return cargar();
      })
      .catch(function (e) { mostrarError(texto(e)); });
  }

  /* ---------------------------------------------------------
     Contraseña
     --------------------------------------------------------- */
  function abrirModal(u) {
    objetivo = u;
    modalTitulo.textContent = "Contraseña de " + u.nombre;
    formClave.reset();
    claveError.hidden = true;
    modal.hidden = false;
    claveNueva.focus();
  }

  function cerrarModal() {
    modal.hidden = true;
    objetivo = null;
  }

  document.getElementById("btnClaveCancelar").addEventListener("click", cerrarModal);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) cerrarModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) cerrarModal();
  });

  formClave.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!objetivo) return;

    claveError.hidden = true;

    if (claveNueva.value !== claveRepetida.value) {
      claveError.textContent = "Las contraseñas no coinciden.";
      claveError.hidden = false;
      return;
    }
    if (claveNueva.value.length < MINIMO) {
      claveError.textContent = "Debe tener al menos " + MINIMO + " caracteres.";
      claveError.hidden = false;
      return;
    }

    const persona = objetivo;
    btnClaveGuardar.disabled = true;
    btnClaveGuardar.textContent = "Guardando...";

    pedir("/api/usuarios/" + encodeURIComponent(persona.usuario) + "/contrasena", {
      method: "PUT",
      body: JSON.stringify({ contrasena: claveNueva.value })
    }).then(function (r) {
      cerrarModal();

      /* Cambiarse la propia contraseña cierra la sesión en
         curso: no hay forma de seguir aquí */
      if (r.cerroMiSesion) {
        window.location.replace("/login.html");
        return;
      }

      mostrarOk("Contraseña de " + persona.nombre + " cambiada. Sus sesiones se cerraron.");
      return cargar();
    }).catch(function (e) {
      claveError.textContent = texto(e);
      claveError.hidden = false;
    }).then(function () {
      btnClaveGuardar.disabled = false;
      btnClaveGuardar.textContent = "Guardar";
    });
  });

  /* ---------------------------------------------------------
     Sesión y arranque
     --------------------------------------------------------- */
  document.getElementById("btnSalir").addEventListener("click", function () {
    this.disabled = true;
    fetch("/api/salir", { method: "POST", credentials: "same-origin" })
      .catch(function () { /* salir siempre debe llevar al login */ })
      .then(function () { window.location.replace("/login.html"); });
  });

  pedir("/api/sesion").then(function (sesion) {
    document.getElementById("sesionNombre").textContent = sesion.nombre;
    return cargar();
  }).catch(function (e) {
    mostrarError(texto(e));
  });

})();
