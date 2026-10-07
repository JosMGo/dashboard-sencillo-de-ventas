/* =========================================================
   Pantalla de respaldos

   Enseña qué hay en cada copia antes de restaurarla. Ese
   resumen es el que permite distinguir la base real de una de
   prueba sin tener que restaurar para ver qué traía.

   Como en la pantalla de cuentas, todo lo vuelve a revisar el
   servidor y la tabla se arma con nodos, no con innerHTML:
   el nombre del archivo subido es texto libre.
   ========================================================= */

(function () {

  const LOCALE = "es-BO";
  const MONEDA = "BOB";
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                 "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  /* El servidor rechaza más que esto; avisar antes evita
     esperar a que suba un archivo que no va a entrar */
  const LIMITE_SUBIDA_MB = 50;

  /* En la tabla caben pocos meses; el resto va en el tooltip */
  const MESES_VISIBLES = 3;

  const aviso = document.getElementById("aviso");
  const avisoOk = document.getElementById("avisoOk");
  const cuerpo = document.getElementById("tbodyRespaldos");
  const conteo = document.getElementById("conteo");
  const cargando = document.getElementById("cargando");
  const resumenActual = document.getElementById("resumenActual");
  const respaldoAuto = document.getElementById("respaldoAuto");
  const respaldoDias = document.getElementById("respaldoDias");

  const btnRespaldo = document.getElementById("btnRespaldo");
  const formSubir = document.getElementById("formSubir");
  const inputArchivo = document.getElementById("archivo");
  const btnSubir = document.getElementById("btnSubir");

  const modal = document.getElementById("modalRestaurar");
  const compTitulo = document.getElementById("compTitulo");
  const compActual = document.getElementById("compActual");
  const compRespaldo = document.getElementById("compRespaldo");
  const compAdmins = document.getElementById("compAdmins");
  const restaurarAlerta = document.getElementById("restaurarAlerta");
  const restaurarError = document.getElementById("restaurarError");
  const btnConfirmar = document.getElementById("btnRestaurarConfirmar");

  let sesion = null;
  let actual = null;

  /* El respaldo que está en el modal */
  let elegido = null;

  /* El recién subido, para marcar su fila */
  let recienSubido = "";

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
    window.scrollTo(0, 0);
  }

  function texto(e) {
    return e.message === "Failed to fetch"
      ? "No hay conexión con el servidor."
      : e.message;
  }

  /* ---------------------------------------------------------
     Formatos
     --------------------------------------------------------- */
  function moneda(valor) {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: MONEDA
    }).format(Number(valor) || 0);
  }

  function pesoLegible(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function cuandoLegible(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return String(d.getDate()).padStart(2, "0") + "/" +
           String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() +
           " a las " + String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0");
  }

  /* "2026-09" → "Sep 2026" */
  function mesLegible(periodo) {
    const m = /^(\d{4})-(\d{2})$/.exec(periodo);
    return m ? MESES[Number(m[2]) - 1] + " " + m[1] : periodo;
  }

  function cotizaciones(n) {
    return n + (n === 1 ? " cotización" : " cotizaciones");
  }

  /* De dónde salió la copia, en palabras. Lo que no aparece en
     la bitácora se hizo con otra base o llegó copiado a mano a
     la carpeta, y conviene decirlo en vez de dejarlo en blanco. */
  function origenLegible(r) {
    const o = r.origen;

    if (!o) {
      return {
        texto: r.subido ? "Subido" : "Sin registro",
        detalle: "",
        ayuda: "No figura en la bitácora de la base en uso: se hizo con otra " +
               "base o llegó copiado a la carpeta."
      };
    }

    if (o.accion === "subida") {
      const m = /^archivo (.*?)(?: · |$)/.exec(o.detalle || "");
      return { texto: "Subido por " + o.usuario, detalle: m ? m[1] : "", ayuda: o.detalle };
    }

    if (o.usuario === "automático") {
      return { texto: "Automático", detalle: "", ayuda: o.detalle };
    }

    if ((o.detalle || "").indexOf("antes de restaurar") === 0) {
      return { texto: "Antes de restaurar", detalle: o.usuario, ayuda: o.detalle };
    }

    return { texto: "Manual", detalle: o.usuario, ayuda: o.detalle };
  }

  /* ---------------------------------------------------------
     Base en uso
     --------------------------------------------------------- */
  function bloqueResumen(resumen) {
    const caja = document.createElement("div");

    const cifra = document.createElement("p");
    cifra.className = "resumen-cifra";
    cifra.textContent = cotizaciones(resumen.cotizaciones) + " · " + moneda(resumen.total);
    caja.appendChild(cifra);

    if (!resumen.meses.length) {
      const vacio = document.createElement("p");
      vacio.className = "resumen-vacio";
      vacio.textContent = "Sin cotizaciones.";
      caja.appendChild(vacio);
      return caja;
    }

    const lista = document.createElement("ul");
    lista.className = "resumen-meses";
    resumen.meses.forEach(function (m) {
      const li = document.createElement("li");
      li.textContent = mesLegible(m.periodo) + ": " + m.cantidad + " · " + moneda(m.total);
      lista.appendChild(li);
    });
    caja.appendChild(lista);

    return caja;
  }

  function pintarActual(resumen) {
    resumenActual.textContent = "";
    resumenActual.appendChild(bloqueResumen(resumen));
  }

  /* Que se vea si el automático está andando. Un panel que solo
     enseña botones deja creer que sin pulsarlos no hay copias. */
  function pintarAutomatico(r) {
    if (r.automatico) {
      respaldoAuto.textContent = "Respaldo automático activo, todos los días a las " +
        String(r.hora).padStart(2, "0") + ":00.";
      respaldoAuto.className = "respaldo-estado activo";
    } else {
      respaldoAuto.textContent = "El respaldo automático está desactivado. " +
        "Las copias solo se crean con el botón.";
      respaldoAuto.className = "respaldo-estado apagado";
    }
    respaldoDias.textContent = String(r.dias);
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

  function celdaMeses(resumen) {
    const td = document.createElement("td");
    td.className = "respaldo-meses";

    if (!resumen.meses.length) {
      td.textContent = "—";
      return td;
    }

    /* Los más recientes primero: suelen ser los que se buscan */
    const todos = resumen.meses.slice().reverse().map(function (m) {
      return mesLegible(m.periodo) + " (" + m.cantidad + ")";
    });

    td.textContent = todos.slice(0, MESES_VISIBLES).join(" · ") +
      (todos.length > MESES_VISIBLES ? " · y " + (todos.length - MESES_VISIBLES) + " más" : "");
    td.title = todos.join("\n");
    return td;
  }

  function fila(r) {
    const tr = document.createElement("tr");
    if (r.nombre === recienSubido) tr.className = "fila-nueva";

    const tdFecha = celda(cuandoLegible(r.fecha));
    tdFecha.title = r.nombre;
    tr.appendChild(tdFecha);

    const origen = origenLegible(r);
    const tdOrigen = celda(origen.texto, "respaldo-origen");
    if (origen.detalle) {
      const sub = document.createElement("span");
      sub.className = "respaldo-sub";
      sub.textContent = origen.detalle;
      tdOrigen.appendChild(sub);
    }
    if (origen.ayuda) tdOrigen.title = origen.ayuda;
    tr.appendChild(tdOrigen);

    if (r.resumen) {
      tr.appendChild(celda(String(r.resumen.cotizaciones), "num"));
      tr.appendChild(celdaMeses(r.resumen));
      tr.appendChild(celda(moneda(r.resumen.total), "num"));
    } else {
      /* Uno que no se puede leer se enseña igual: esconderlo
         haría creer que no existe */
      const tdError = celda(r.error, "respaldo-error");
      tdError.colSpan = 3;
      tr.appendChild(tdError);
    }

    tr.appendChild(celda(pesoLegible(r.bytes), "num"));

    /* Los botones van en un div: con display:flex en la propia
       celda, deja de ser celda y se descuadran bordes y fondo */
    const tdAcciones = document.createElement("td");
    const acciones = document.createElement("div");
    acciones.className = "acciones";

    acciones.appendChild(boton("Descargar", "", function () {
      window.location.href = "/api/backup/archivo/" + encodeURIComponent(r.nombre);
    }));

    if (r.resumen) {
      acciones.appendChild(boton("Restaurar", "restaurar", function () {
        abrirModal(r);
      }));
    }

    tdAcciones.appendChild(acciones);
    tr.appendChild(tdAcciones);
    return tr;
  }

  function pintar(respaldos) {
    cuerpo.textContent = "";
    respaldos.forEach(function (r) { cuerpo.appendChild(fila(r)); });

    conteo.textContent = respaldos.length === 1 ? "1 copia" : respaldos.length + " copias";
    cargando.hidden = respaldos.length > 0;
    if (!respaldos.length) cargando.textContent = "Todavía no hay ningún respaldo.";
  }

  function cargar() {
    return pedir("/api/backup/lista").then(function (r) {
      actual = r.actual;
      pintarActual(r.actual);
      pintarAutomatico(r);
      pintar(r.respaldos);
    }).catch(function (e) {
      cargando.textContent = "";
      mostrarError(texto(e));
    });
  }

  /* ---------------------------------------------------------
     Copia de ahora

     La descarga se hace navegando a la dirección, no con fetch:
     el servidor responde con Content-Disposition y el navegador
     guarda el archivo sin que la página se mueva. El listado
     se recarga después, con margen, porque la copia se crea
     durante esa misma petición.
     --------------------------------------------------------- */
  btnRespaldo.addEventListener("click", function () {
    limpiarAvisos();

    btnRespaldo.disabled = true;
    btnRespaldo.textContent = "Preparando...";

    window.location.href = "/api/backup";

    setTimeout(function () {
      btnRespaldo.disabled = false;
      btnRespaldo.textContent = "Crear y descargar respaldo";
      mostrarOk("Respaldo creado. Revisa tus descargas.");
      cargar();
    }, 2500);
  });

  /* ---------------------------------------------------------
     Subida

     El archivo va como cuerpo crudo de la petición. El nombre
     original viaja aparte para que la bitácora diga qué se
     subió; el servidor le pone el suyo al guardarlo.
     --------------------------------------------------------- */
  formSubir.addEventListener("submit", function (e) {
    e.preventDefault();
    limpiarAvisos();

    const archivo = inputArchivo.files[0];
    if (!archivo) return mostrarError("Elige primero el archivo .db.");

    if (archivo.size > LIMITE_SUBIDA_MB * 1024 * 1024) {
      return mostrarError("El archivo pasa de " + LIMITE_SUBIDA_MB + " MB.");
    }

    btnSubir.disabled = true;
    btnSubir.textContent = "Subiendo...";

    pedir("/api/backup/subir", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Nombre-Archivo": encodeURIComponent(archivo.name)
      },
      body: archivo
    }).then(function (r) {
      formSubir.reset();
      recienSubido = r.nombre;
      mostrarOk("Subido: " + cotizaciones(r.resumen.cotizaciones) + ". Está marcado en " +
                "la lista; revisa sus meses y, si es el correcto, pulsa Restaurar.");
      return cargar();
    }).catch(function (err) {
      mostrarError(texto(err));
    }).then(function () {
      btnSubir.disabled = false;
      btnSubir.textContent = "Subir";
    });
  });

  /* ---------------------------------------------------------
     Restauración
     --------------------------------------------------------- */
  function abrirModal(r) {
    limpiarAvisos();
    elegido = r;

    compTitulo.textContent = "Respaldo del " + cuandoLegible(r.fecha);
    compActual.textContent = "";
    compRespaldo.textContent = "";
    if (actual) compActual.appendChild(bloqueResumen(actual));
    compRespaldo.appendChild(bloqueResumen(r.resumen));

    compAdmins.textContent = r.resumen.admins.length ? r.resumen.admins.join(", ") : "nadie";

    /* Lo que conviene leer dos veces antes de confirmar */
    const alertas = [];
    if (actual && r.resumen.cotizaciones < actual.cotizaciones) {
      const menos = actual.cotizaciones - r.resumen.cotizaciones;
      alertas.push("El respaldo tiene " + cotizaciones(menos) + " menos que la base en uso.");
    }
    if (sesion && r.resumen.admins.indexOf(sesion.usuario) === -1) {
      alertas.push("Tu cuenta «" + sesion.usuario + "» no es administración en ese " +
                   "respaldo: después tendrás que entrar con otra.");
    }
    restaurarAlerta.textContent = alertas.join(" ");
    restaurarAlerta.hidden = !alertas.length;

    restaurarError.hidden = true;
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = "Restaurar";
    modal.hidden = false;
    btnConfirmar.focus();
  }

  function cerrarModal() {
    /* Con la restauración en marcha no se cierra: el resultado
       llegaría a una pantalla que ya no lo espera */
    if (btnConfirmar.disabled) return;
    modal.hidden = true;
    elegido = null;
  }

  document.getElementById("btnRestaurarCancelar").addEventListener("click", cerrarModal);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) cerrarModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) cerrarModal();
  });

  btnConfirmar.addEventListener("click", function () {
    if (!elegido) return;

    restaurarError.hidden = true;
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Restaurando...";

    pedir("/api/backup/restaurar", {
      method: "POST",
      body: JSON.stringify({ nombre: elegido.nombre })
    }).then(function (r) {
      /* La sesión ya no existe: las cuentas que valen ahora son
         las del respaldo */
      window.alert("Base restaurada: " + cotizaciones(r.resumen.cotizaciones) + ".\n\n" +
                   "La base anterior quedó guardada como " + r.copiaPrevia + ".\n\n" +
                   "Ahora vuelve a iniciar sesión.");
      window.location.replace("/login.html");
    }).catch(function (e) {
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Restaurar";
      restaurarError.textContent = texto(e);
      restaurarError.hidden = false;
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

  pedir("/api/sesion").then(function (s) {
    sesion = s;
    document.getElementById("sesionNombre").textContent = s.nombre;
    return cargar();
  }).catch(function (e) {
    mostrarError(texto(e));
  });

})();
