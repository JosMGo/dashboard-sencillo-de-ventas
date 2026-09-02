/* =========================================================
   Dashboard de Cotizaciones y Proyectos
   JavaScript vanilla + localStorage
   ========================================================= */

/* Cambia estos dos valores si usas otra moneda (ej. "es-CO" / "COP") */
const LOCALE = "es-MX";
const MONEDA = "MXN";

const CLAVE_STORAGE = "cotizaciones";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
               "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* Lista de registros en memoria */
let registros = cargar();

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
   localStorage
   ========================================================= */
function cargar() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_STORAGE));
    return Array.isArray(datos) ? datos : [];
  } catch (e) {
    return [];
  }
}

function guardar() {
  localStorage.setItem(CLAVE_STORAGE, JSON.stringify(registros));
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
  const texto = buscador.value.trim().toLowerCase();
  const mes = filtroMes.value;
  const anio = filtroAnio.value;

  return registros
    .filter(function (r) {
      const fecha = new Date(r.fecha);

      if (mes !== "todos" && fecha.getMonth() !== Number(mes)) return false;
      if (anio !== "todos" && fecha.getFullYear() !== Number(anio)) return false;

      if (texto) {
        const enNombre = r.nombre.toLowerCase().includes(texto);
        const enEmpresa = r.empresa.toLowerCase().includes(texto);
        if (!enNombre && !enEmpresa) return false;
      }
      return true;
    })
    /* Del mas reciente al mas antiguo */
    .sort(function (a, b) {
      return new Date(b.fecha) - new Date(a.fecha);
    });
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
  let cotizado = 0;
  let ventas = 0;
  let cobrado = 0;
  let pendiente = 0;
  let numVentas = 0;

  lista.forEach(function (r) {
    const monto = Number(r.monto) || 0;
    cotizado += monto;
    if (r.venta) {
      ventas += monto;
      numVentas++;
      if (r.cobro) cobrado += monto;
      else pendiente += monto;
    }
  });

  document.getElementById("statTotal").textContent = lista.length;
  document.getElementById("statCotizado").textContent = moneda(cotizado);
  document.getElementById("statVentas").textContent = moneda(ventas);
  document.getElementById("statVentasNota").textContent =
    numVentas + (numVentas === 1 ? " venta" : " ventas");
  document.getElementById("statCobrado").textContent = moneda(cobrado);
  document.getElementById("statPendiente").textContent = moneda(pendiente);

  /* --- Métricas y paneles --- */
  renderMetricas(lista.length, numVentas, cotizado, ventas, cobrado);
  renderGrafica();
  renderRanking(lista);
}

/* =========================================================
   Métricas
   ========================================================= */
function porcentaje(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}

function renderMetricas(numRegistros, numVentas, cotizado, ventas, cobrado) {
  const conversion = porcentaje(numVentas, numRegistros);
  const ticket = numRegistros ? cotizado / numRegistros : 0;
  const ticketVenta = numVentas ? ventas / numVentas : 0;
  const avanceCobro = porcentaje(cobrado, ventas);

  document.getElementById("mConversion").textContent = conversion + "%";
  document.getElementById("mConversionNota").textContent =
    numVentas + " de " + numRegistros + (numRegistros === 1 ? " cotización" : " cotizaciones");
  document.getElementById("mTicket").textContent = moneda(ticket);
  document.getElementById("mTicketVenta").textContent = moneda(ticketVenta);
  document.getElementById("mCobro").textContent = avanceCobro + "%";
  document.getElementById("mCobroNota").textContent =
    moneda(cobrado) + " de " + moneda(ventas);
}

/* =========================================================
   Gráfica: cotizado vs. vendido por mes
   (respeta el año y el buscador; ignora el filtro de mes
   para poder comparar los 12 meses entre sí)
   ========================================================= */
function renderGrafica() {
  const texto = buscador.value.trim().toLowerCase();
  const anio = filtroAnio.value;

  document.getElementById("panelAnio").textContent =
    anio === "todos" ? "Todos los años" : "Año " + anio;

  /* Un acumulador por mes */
  const meses = MESES.map(function () {
    return { cotizado: 0, vendido: 0 };
  });

  registros.forEach(function (r) {
    const fecha = new Date(r.fecha);
    if (isNaN(fecha)) return;
    if (anio !== "todos" && fecha.getFullYear() !== Number(anio)) return;

    if (texto) {
      const enNombre = r.nombre.toLowerCase().includes(texto);
      const enEmpresa = r.empresa.toLowerCase().includes(texto);
      if (!enNombre && !enEmpresa) return;
    }

    const monto = Number(r.monto) || 0;
    meses[fecha.getMonth()].cotizado += monto;
    if (r.venta) meses[fecha.getMonth()].vendido += monto;
  });

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
  const porEmpresa = {};

  lista.forEach(function (r) {
    const nombre = r.empresa || "(Sin empresa)";
    if (!porEmpresa[nombre]) porEmpresa[nombre] = { cotizado: 0, vendido: 0 };
    porEmpresa[nombre].cotizado += Number(r.monto) || 0;
    if (r.venta) porEmpresa[nombre].vendido += Number(r.monto) || 0;
  });

  const top = Object.keys(porEmpresa)
    .map(function (nombre) {
      return {
        nombre: nombre,
        cotizado: porEmpresa[nombre].cotizado,
        vendido: porEmpresa[nombre].vendido
      };
    })
    .sort(function (a, b) { return b.cotizado - a.cotizado; })
    .slice(0, 5);

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

  if (id) {
    /* Editar: se conserva la fecha original */
    const registro = registros.find(function (r) { return r.id === id; });
    if (registro) Object.assign(registro, datos);
  } else {
    /* Nuevo: la fecha y hora se generan automaticamente */
    datos.id = String(Date.now());
    datos.fecha = new Date().toISOString();
    registros.push(datos);
  }

  guardar();
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
      guardar();
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
  guardar();
  render();
});

/* Filtros */
buscador.addEventListener("input", render);
filtroMes.addEventListener("change", render);
filtroAnio.addEventListener("change", render);

/* =========================================================
   Inicio
   ========================================================= */
llenarAnios();
render();
