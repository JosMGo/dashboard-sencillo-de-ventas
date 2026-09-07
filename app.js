/* =========================================================
   Dashboard de Cotizaciones y Proyectos
   JavaScript vanilla + localStorage
   ========================================================= */

/* Moneda. Para Venezuela: "es-VE" / "VES". Para México: "es-MX" / "MXN" */
const LOCALE = "es-BO";
const MONEDA = "BOB";

/* La clave de localStorage y la capa de guardado viven en almacen.js.

   Las sumas, promedios y agregados viven en calculos.js, que
   también usa el servidor para armar el PDF. Aquí solo se
   pintan: si esta pantalla calculara por su cuenta, el informe
   y el dashboard acabarían diciendo cifras distintas. */
const MESES = Calculos.MESES;
const NOMBRES_MES = Calculos.NOMBRES_MES;

/* Lista de registros en memoria (se llena al iniciar) */
let registros = [];

/* Metas por periodo: { "2026-09": 150000 } */
let metas = {};

/* Lo que la pantalla tiene filtrado ahora mismo. Es lo que
   entiende calculos.js, y lo mismo que se le manda al servidor
   al exportar. */
function filtrosActuales() {
  return {
    texto: buscador.value.trim(),
    mes: filtroMes.value,
    anio: filtroAnio.value
  };
}

/* ---------- Elementos del DOM ---------- */
const tbody = document.getElementById("tbody");
const vacio = document.getElementById("vacio");
const buscador = document.getElementById("buscador");
const filtroMes = document.getElementById("filtroMes");
const filtroAnio = document.getElementById("filtroAnio");

const modal = document.getElementById("modal");
const modalTitulo = document.getElementById("modalTitulo");
const formulario = document.getElementById("formulario");
const campoId = document.getElementById("registroId");
const campoNombre = document.getElementById("nombre");
const campoEmpresa = document.getElementById("empresa");
const campoMonto = document.getElementById("monto");
const campoVenta = document.getElementById("venta");
const campoCobro = document.getElementById("cobro");

/* =========================================================
   Guardado

   Las operaciones se delegan a Almacen (ver almacen.js), que
   usa SQLite en la app de escritorio y localStorage en el
   navegador. Si algo falla, se muestra el aviso amarillo.
   ========================================================= */
function alFallar(e) {
  console.error("No se pudo guardar:", e);
  mostrarAviso();
}

function mostrarAviso() {
  const aviso = document.getElementById("avisoStorage");
  if (aviso) aviso.hidden = false;
}

/* Muestra en el pie de página dónde se están guardando los datos */
function mostrarInfoAlmacen() {
  Almacen.info().then(function (info) {
    const pie = document.getElementById("infoAlmacen");
    if (pie) pie.textContent = info.descripcion;
  });
}


/* =========================================================
   Utilidades
   ========================================================= */
function moneda(valor) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: MONEDA
  }).format(Number(valor) || 0);
}

function fechaLegible(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return dia + "/" + mes + "/" + anio + " " + hora + ":" + min;
}

/* Evita que un texto del usuario rompa el HTML */
function escapar(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =========================================================
   Filtros
   ========================================================= */
function obtenerFiltrados() {
  return Calculos.filtrar(registros, filtrosActuales());
}

/* Llena el selector de anio con los anios que existen en los datos */
function llenarAnios() {
  const seleccionado = filtroAnio.value || "todos";

  const anios = registros
    .map(function (r) { return new Date(r.fecha).getFullYear(); })
    .filter(function (a) { return !isNaN(a); });

  anios.push(new Date().getFullYear());

  const unicos = Array.from(new Set(anios)).sort(function (a, b) { return b - a; });

  filtroAnio.innerHTML = '<option value="todos">Todos</option>';
  unicos.forEach(function (a) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    filtroAnio.appendChild(opt);
  });

  /* Conserva la seleccion si el anio sigue existiendo */
  filtroAnio.value = unicos.indexOf(Number(seleccionado)) !== -1 ? seleccionado : "todos";
}

/* =========================================================
   Render
   ========================================================= */
function render() {
  const lista = obtenerFiltrados();

  /* --- Tabla --- */
  tbody.innerHTML = lista.map(function (r) {
    return '' +
      '<tr>' +
        '<td>' + fechaLegible(r.fecha) + '</td>' +
        '<td>' + escapar(r.nombre) + '</td>' +
        '<td>' + escapar(r.empresa) + '</td>' +
        '<td class="num">' + moneda(r.monto) + '</td>' +
        '<td class="center">' +
          '<input type="checkbox" data-campo="venta" data-id="' + r.id + '"' + (r.venta ? " checked" : "") + '>' +
        '</td>' +
        '<td class="center">' +
          '<input type="checkbox" data-campo="cobro" data-id="' + r.id + '"' + (r.cobro ? " checked" : "") + '>' +
        '</td>' +
        '<td class="center">' +
          '<div class="acciones">' +
            '<button class="btn-mini" data-accion="editar" data-id="' + r.id + '">Editar</button>' +
            '<button class="btn-mini borrar" data-accion="eliminar" data-id="' + r.id + '">Eliminar</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
  }).join("");

  vacio.hidden = lista.length > 0;

  /* --- Totales del dashboard (sobre los registros filtrados) --- */
  const t = Calculos.totales(lista);

  document.getElementById("statTotal").textContent = t.num;
  document.getElementById("statCotizado").textContent = moneda(t.cotizado);
  document.getElementById("statVentas").textContent = moneda(t.vendido);
  document.getElementById("statVentasNota").textContent =
    t.numVentas + (t.numVentas === 1 ? " venta" : " ventas");
  document.getElementById("statCobrado").textContent = moneda(t.cobrado);
  document.getElementById("statPendiente").textContent = moneda(t.pendiente);

  /* --- Métricas y paneles --- */
  renderMetricas(t);
  renderMeta(t.vendido);
  renderEmpresas(lista);
  renderGrafica();
  renderRanking(lista);
  renderListaEmpresas();
}

/* =========================================================
   Meta de venta

   La meta es global y mensual. El periodo se toma de los
   filtros de arriba: si hay un mes concreto seleccionado se
   captura la meta de ese mes; si está en "Todos" se muestra
   la suma de las metas del rango, pero no se puede editar
   (no tendría sentido escribir una suma).
   ========================================================= */
function periodoSeleccionado() {
  return Calculos.periodoDe(filtrosActuales());
}

/* Suma las metas que caen dentro del filtro actual */
function metaDelFiltro() {
  return Calculos.metaDelFiltro(metas, filtrosActuales());
}

/* Devuelve "verde", "ambar" o "rojo" según el avance */
function nivelSemaforo(avance) {
  return Calculos.nivelSemaforo(avance);
}

function renderMeta(vendido) {
  const periodo = periodoSeleccionado();
  const meta = metaDelFiltro();
  const campo = document.getElementById("metaMonto");
  const boton = document.getElementById("btnGuardarMeta");
  const ayuda = document.getElementById("metaAyuda");

  /* Título del periodo */
  const mes = filtroMes.value;
  const anio = filtroAnio.value;
  let titulo;
  if (periodo) titulo = NOMBRES_MES[Number(mes)] + " " + anio;
  else if (anio !== "todos") titulo = "Año " + anio;
  else titulo = "Todos los periodos";
  document.getElementById("metaPeriodo").textContent = titulo;

  /* Solo se puede capturar con un mes y un año concretos */
  if (periodo) {
    campo.disabled = false;
    boton.disabled = false;
    if (document.activeElement !== campo) {
      campo.value = meta > 0 ? meta : "";
    }
    ayuda.textContent = "Meta de " + titulo + ". Deja el campo vacío para quitarla.";
  } else {
    campo.disabled = true;
    boton.disabled = true;
    campo.value = "";
    ayuda.textContent = "Elige un mes y un año concretos arriba para capturar la meta.";
  }

  const avance = meta > 0 ? (vendido / meta) * 100 : 0;
  const nivel = nivelSemaforo(avance);

  document.getElementById("metaVendido").textContent = moneda(vendido);
  document.getElementById("metaObjetivo").textContent = moneda(meta);

  const porcentaje = document.getElementById("metaPorcentaje");
  porcentaje.textContent = meta > 0 ? Math.round(avance) + "%" : "—";
  porcentaje.className = "metrica-value" + (meta > 0 ? " " + nivel : "");

  const barra = document.getElementById("metaBarra");
  barra.style.width = Math.min(avance, 100).toFixed(1) + "%";
  barra.className = "meta-relleno" + (meta > 0 ? " " + nivel : "");

  const estado = document.getElementById("metaEstado");
  if (meta <= 0) {
    estado.textContent = "Sin meta capturada para este periodo.";
    estado.className = "meta-estado";
  } else if (vendido >= meta) {
    estado.textContent = "Meta alcanzada. Superada por " + moneda(vendido - meta) + ".";
    estado.className = "meta-estado verde";
  } else {
    estado.textContent = "Faltan " + moneda(meta - vendido) + " para la meta.";
    estado.className = "meta-estado " + nivel;
  }
}

document.getElementById("btnGuardarMeta").addEventListener("click", function () {
  const periodo = periodoSeleccionado();
  if (!periodo) return;

  const monto = Number(document.getElementById("metaMonto").value) || 0;

  Almacen.guardarMeta(periodo, monto).then(function () {
    if (monto > 0) metas[periodo] = monto;
    else delete metas[periodo];
    render();
  }).catch(alFallar);
});

/* =========================================================
   Métricas por empresa

   Una fila por empresa, para poder compararlas. Respeta el
   buscador y los filtros de mes y año igual que todo lo demás.
   ========================================================= */
function renderEmpresas(lista) {
  document.getElementById("empresasPeriodo").textContent =
    document.getElementById("metaPeriodo").textContent;

  const meta = metaDelFiltro();

  /* Ya viene de mayor a menor monto vendido */
  const empresas = Calculos.porEmpresa(lista);

  const cuerpo = document.getElementById("tbodyEmpresas");
  const pie = document.getElementById("tfootEmpresas");

  document.getElementById("empresasVacio").hidden = empresas.length > 0;

  cuerpo.innerHTML = empresas.map(function (e) {
    const conversion = porcentaje(e.numVentas, e.num);
    const aporte = meta > 0 ? (e.vendido / meta) * 100 : 0;

    return '' +
      '<tr>' +
        '<td class="empresa-nombre">' + escapar(e.nombre) + '</td>' +
        '<td class="num">' + e.num + '</td>' +
        '<td class="num">' + moneda(e.cotizado) + '</td>' +
        '<td class="num">' + moneda(e.vendido) + '</td>' +
        '<td class="num">' + moneda(e.cobrado) + '</td>' +
        '<td class="num">' + moneda(e.pendiente) + '</td>' +
        '<td class="num">' + conversion + '%</td>' +
        '<td class="num">' + (meta > 0 ? Math.round(aporte) + "%" : "—") + '</td>' +
      '</tr>';
  }).join("");

  /* Fila de totales: aquí sí aplica el semáforo, porque la
     meta es global y la persiguen todas las empresas juntas */
  const tot = empresas.reduce(function (a, e) {
    return {
      num: a.num + e.num,
      numVentas: a.numVentas + e.numVentas,
      cotizado: a.cotizado + e.cotizado,
      vendido: a.vendido + e.vendido,
      cobrado: a.cobrado + e.cobrado,
      pendiente: a.pendiente + e.pendiente
    };
  }, { num: 0, numVentas: 0, cotizado: 0, vendido: 0, cobrado: 0, pendiente: 0 });

  const avanceTotal = meta > 0 ? (tot.vendido / meta) * 100 : 0;
  const claseTotal = meta > 0 ? " celda-semaforo " + nivelSemaforo(avanceTotal) : "";

  pie.innerHTML = empresas.length === 0 ? "" : '' +
    '<tr>' +
      '<td>TOTAL (' + empresas.length + (empresas.length === 1 ? " empresa)" : " empresas)") + '</td>' +
      '<td class="num">' + tot.num + '</td>' +
      '<td class="num">' + moneda(tot.cotizado) + '</td>' +
      '<td class="num">' + moneda(tot.vendido) + '</td>' +
      '<td class="num">' + moneda(tot.cobrado) + '</td>' +
      '<td class="num">' + moneda(tot.pendiente) + '</td>' +
      '<td class="num">' + porcentaje(tot.numVentas, tot.num) + '%</td>' +
      '<td class="num' + claseTotal + '">' +
        (meta > 0 ? Math.round(avanceTotal) + "%" : "—") +
      '</td>' +
    '</tr>';
}

/* Sugerencias de empresa en el formulario, para no crear
   duplicados por escribir el nombre distinto cada vez */
function renderListaEmpresas() {
  const nombres = Array.from(new Set(registros.map(function (r) {
    return (r.empresa || "").trim();
  }).filter(Boolean))).sort();

  document.getElementById("listaEmpresas").innerHTML = nombres.map(function (n) {
    return '<option value="' + escapar(n) + '"></option>';
  }).join("");
}

/* =========================================================
   Métricas
   ========================================================= */
function porcentaje(parte, total) {
  return Calculos.porcentaje(parte, total);
}

function renderMetricas(t) {
  const m = Calculos.metricas(t);

  document.getElementById("mConversion").textContent = m.conversion + "%";
  document.getElementById("mConversionNota").textContent =
    t.numVentas + " de " + t.num + (t.num === 1 ? " cotización" : " cotizaciones");
  document.getElementById("mTicket").textContent = moneda(m.ticket);
  document.getElementById("mTicketVenta").textContent = moneda(m.ticketVenta);
  document.getElementById("mCobro").textContent = m.avanceCobro + "%";
  document.getElementById("mCobroNota").textContent =
    moneda(t.cobrado) + " de " + moneda(t.vendido);
}

/* =========================================================
   Gráfica: cotizado vs. vendido por mes
   (respeta el año y el buscador; ignora el filtro de mes
   para poder comparar los 12 meses entre sí)
   ========================================================= */
function renderGrafica() {
  const anio = filtroAnio.value;

  document.getElementById("panelAnio").textContent =
    anio === "todos" ? "Todos los años" : "Año " + anio;

  /* Un acumulador por mes. porMes ignora el filtro de mes a
     propósito, para poder comparar los doce entre sí. */
  const meses = Calculos.porMes(registros, filtrosActuales());

  /* El mes más alto define el 100% de la altura */
  const maximo = Math.max.apply(null, meses.map(function (m) {
    return Math.max(m.cotizado, m.vendido);
  }).concat([0]));

  document.getElementById("grafica").innerHTML = meses.map(function (m, i) {
    const altoCot = maximo ? (m.cotizado / maximo) * 100 : 0;
    const altoVen = maximo ? (m.vendido / maximo) * 100 : 0;
    const titulo = MESES[i] + " — Cotizado: " + moneda(m.cotizado) +
                   " | Vendido: " + moneda(m.vendido);

    return '' +
      '<div class="g-mes" title="' + escapar(titulo) + '">' +
        '<div class="g-barras">' +
          '<div class="g-barra cotizado" style="height:' + altoCot.toFixed(1) + '%"></div>' +
          '<div class="g-barra vendido" style="height:' + altoVen.toFixed(1) + '%"></div>' +
        '</div>' +
        '<span class="g-etiqueta">' + MESES[i] + '</span>' +
      '</div>';
  }).join("");
}

/* =========================================================
   Ranking: top 5 empresas por monto cotizado
   ========================================================= */
function renderRanking(lista) {
  const top = Calculos.ranking(lista, 5);
  const ranking = document.getElementById("ranking");

  if (top.length === 0) {
    ranking.innerHTML = '<li><p class="panel-vacio">Sin datos para mostrar.</p></li>';
    return;
  }

  const maximo = top[0].cotizado || 1;

  ranking.innerHTML = top.map(function (e) {
    const ancho = (e.cotizado / maximo) * 100;
    return '' +
      '<li>' +
        '<div class="r-fila">' +
          '<span class="r-empresa">' + escapar(e.nombre) + '</span>' +
          '<span class="r-monto">' + moneda(e.cotizado) + '</span>' +
        '</div>' +
        '<div class="r-pista">' +
          '<div class="r-relleno" style="width:' + ancho.toFixed(1) + '%"></div>' +
        '</div>' +
        '<span class="metrica-note">Vendido: ' + moneda(e.vendido) + '</span>' +
      '</li>';
  }).join("");
}

/* =========================================================
   Modal / formulario
   ========================================================= */
function abrirModal(registro) {
  if (registro) {
    modalTitulo.textContent = "Editar cotización";
    campoId.value = registro.id;
    campoNombre.value = registro.nombre;
    campoEmpresa.value = registro.empresa;
    campoMonto.value = registro.monto;
    campoVenta.checked = !!registro.venta;
    campoCobro.checked = !!registro.cobro;
  } else {
    modalTitulo.textContent = "Nueva cotización";
    formulario.reset();
    campoId.value = "";
  }
  modal.hidden = false;
  campoNombre.focus();
}

function cerrarModal() {
  modal.hidden = true;
  formulario.reset();
  campoId.value = "";
}

formulario.addEventListener("submit", function (e) {
  e.preventDefault();

  const id = campoId.value;
  const datos = {
    nombre: campoNombre.value.trim(),
    empresa: campoEmpresa.value.trim(),
    monto: Number(campoMonto.value) || 0,
    venta: campoVenta.checked,
    cobro: campoCobro.checked
  };

  let operacion;

  if (id) {
    /* Editar: se conserva la fecha original */
    const registro = registros.find(function (r) { return r.id === id; });
    if (!registro) return;
    Object.assign(registro, datos);
    operacion = Almacen.actualizar(registro);
  } else {
    /* Nuevo: la fecha y hora se generan automaticamente */
    datos.id = String(Date.now());
    datos.fecha = new Date().toISOString();
    registros.push(datos);
    operacion = Almacen.crear(datos);
  }

  operacion.catch(alFallar);

  llenarAnios();
  render();
  cerrarModal();
});

/* =========================================================
   Eventos
   ========================================================= */
document.getElementById("btnNueva").addEventListener("click", function () {
  abrirModal(null);
});

document.getElementById("btnCancelar").addEventListener("click", cerrarModal);

/* Cerrar el modal al hacer clic en el fondo o con la tecla Escape */
modal.addEventListener("click", function (e) {
  if (e.target === modal) cerrarModal();
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !modal.hidden) cerrarModal();
});

/* Clics en la tabla: editar y eliminar */
tbody.addEventListener("click", function (e) {
  const boton = e.target.closest("button");
  if (!boton) return;

  const id = boton.dataset.id;

  if (boton.dataset.accion === "editar") {
    const registro = registros.find(function (r) { return r.id === id; });
    if (registro) abrirModal(registro);
  }

  if (boton.dataset.accion === "eliminar") {
    const registro = registros.find(function (r) { return r.id === id; });
    if (!registro) return;
    if (confirm('¿Eliminar "' + registro.nombre + '"? Esta acción no se puede deshacer.')) {
      registros = registros.filter(function (r) { return r.id !== id; });
      Almacen.eliminar(id).catch(alFallar);
      llenarAnios();
      render();
    }
  }
});

/* Checkboxes de venta y cobro directamente en la tabla */
tbody.addEventListener("change", function (e) {
  const check = e.target;
  if (check.type !== "checkbox") return;

  const registro = registros.find(function (r) { return r.id === check.dataset.id; });
  if (!registro) return;

  registro[check.dataset.campo] = check.checked;
  Almacen.actualizar(registro).catch(alFallar);
  render();
});

/* Filtros */
buscador.addEventListener("input", render);
filtroMes.addEventListener("change", render);
filtroAnio.addEventListener("change", render);

/* =========================================================
   Inicio
   ========================================================= */
/* Al abrir, el dashboard se sitúa en el mes en curso.

   Además de ser lo más útil, hace que el campo de la meta esté
   listo para escribir desde el primer momento: la meta solo se
   puede capturar con un mes y un año concretos. */
function situarseEnMesActual() {
  const hoy = new Date();
  const anio = String(hoy.getFullYear());

  filtroMes.value = String(hoy.getMonth());

  const existe = Array.prototype.some.call(filtroAnio.options, function (o) {
    return o.value === anio;
  });
  if (existe) filtroAnio.value = anio;
}

/* =========================================================
   Informe en PDF

   El botón solo existe cuando la página viene del servidor y
   la sesión es de administración; sesion.js se encarga de
   mostrarlo. Aquí solo se le pasan los filtros que están
   puestos, para que el papel muestre lo mismo que la pantalla.

   Se navega a la dirección en vez de usar fetch: el servidor
   responde con Content-Disposition, así que el navegador
   descarga el archivo y la página no se mueve.
   ========================================================= */
const btnExportarPDF = document.getElementById("btnExportar");

if (btnExportarPDF) {
  btnExportarPDF.addEventListener("click", function () {
    const parametros = new URLSearchParams({
      mes: filtroMes.value,
      anio: filtroAnio.value,
      buscar: buscador.value.trim()
    });

    /* Se deshabilita un momento para que un doble clic no
       dispare dos veces la generación */
    btnExportarPDF.disabled = true;
    btnExportarPDF.textContent = "Generando...";

    window.location.href = "/api/exportar/pdf?" + parametros.toString();

    setTimeout(function () {
      btnExportarPDF.disabled = false;
      btnExportarPDF.textContent = "Exportar PDF";
    }, 2500);
  });
}

function iniciar() {
  Almacen.disponible().then(function (ok) {
    if (!ok) mostrarAviso();
    return Promise.all([Almacen.listar(), Almacen.leerMetas()]);
  }).then(function (r) {
    registros = r[0];
    metas = r[1] || {};
    llenarAnios();
    situarseEnMesActual();
    render();
    mostrarInfoAlmacen();
  }).catch(function (e) {
    console.error("No se pudieron cargar los datos:", e);
    mostrarAviso();
    llenarAnios();
    render();
  });
}

iniciar();
