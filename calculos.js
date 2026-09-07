/* =========================================================
   Cálculos del dashboard

   Lo usan dos programas distintos:

   - app.js, en el navegador, para pintar la pantalla
   - exportar.js, en el servidor, para armar el PDF

   Por eso aquí no hay DOM ni SQL: solo funciones que reciben
   registros y devuelven números. Si el PDF calculara por su
   cuenta, tarde o temprano diría algo distinto de lo que se
   ve en pantalla, y no habría forma de saber cuál miente.

   Todas las funciones son puras: no modifican lo que reciben.
   ========================================================= */

(function (raiz) {

  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                 "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const NOMBRES_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                       "Julio", "Agosto", "Septiembre", "Octubre",
                       "Noviembre", "Diciembre"];

  /* Umbrales del semáforo de la meta, en porcentaje */
  const META_VERDE = 100;
  const META_AMBAR = 70;

  /* ---------------------------------------------------------
     Filtros

     Los tres criterios de la pantalla: texto libre, mes y año.
     "todos" significa que ese criterio no filtra nada.
     --------------------------------------------------------- */
  function coincideTexto(registro, texto) {
    if (!texto) return true;
    const t = texto.toLowerCase();
    return String(registro.nombre || "").toLowerCase().indexOf(t) !== -1 ||
           String(registro.empresa || "").toLowerCase().indexOf(t) !== -1;
  }

  function filtrar(registros, filtros) {
    const f = filtros || {};
    const texto = String(f.texto || "").trim().toLowerCase();
    const mes = f.mes === undefined || f.mes === null ? "todos" : String(f.mes);
    const anio = f.anio === undefined || f.anio === null ? "todos" : String(f.anio);

    return registros
      .filter(function (r) {
        const fecha = new Date(r.fecha);
        if (isNaN(fecha.getTime())) return false;

        if (mes !== "todos" && fecha.getMonth() !== Number(mes)) return false;
        if (anio !== "todos" && fecha.getFullYear() !== Number(anio)) return false;

        return coincideTexto(r, texto);
      })
      /* Del más reciente al más antiguo */
      .sort(function (a, b) {
        return new Date(b.fecha) - new Date(a.fecha);
      });
  }

  /* ---------------------------------------------------------
     Totales

     Un registro cuenta como cotizado siempre. Solo cuenta como
     vendido si tiene la marca de venta, y entonces su monto va
     a cobrado o a pendiente según la marca de cobro. Nunca a
     los dos: por eso cobrado + pendiente = vendido.
     --------------------------------------------------------- */
  function totales(lista) {
    const t = {
      num: lista.length,
      numVentas: 0,
      cotizado: 0,
      vendido: 0,
      cobrado: 0,
      pendiente: 0
    };

    lista.forEach(function (r) {
      const monto = Number(r.monto) || 0;
      t.cotizado += monto;

      if (r.venta) {
        t.numVentas++;
        t.vendido += monto;
        if (r.cobro) t.cobrado += monto;
        else t.pendiente += monto;
      }
    });

    return t;
  }

  function porcentaje(parte, total) {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
  }

  function metricas(t) {
    return {
      conversion: porcentaje(t.numVentas, t.num),
      ticket: t.num ? t.cotizado / t.num : 0,
      ticketVenta: t.numVentas ? t.vendido / t.numVentas : 0,
      avanceCobro: porcentaje(t.cobrado, t.vendido)
    };
  }

  /* ---------------------------------------------------------
     Agregado por empresa

     Ordenado de mayor a menor vendido: quien más factura va
     primero, que es lo que se quiere ver al abrir la tabla.
     --------------------------------------------------------- */
  function porEmpresa(lista) {
    const mapa = {};

    lista.forEach(function (r) {
      const nombre = String(r.empresa || "(Sin empresa)").trim() || "(Sin empresa)";

      if (!mapa[nombre]) {
        mapa[nombre] = {
          nombre: nombre, num: 0, numVentas: 0,
          cotizado: 0, vendido: 0, cobrado: 0, pendiente: 0
        };
      }

      const e = mapa[nombre];
      const monto = Number(r.monto) || 0;

      e.num++;
      e.cotizado += monto;

      if (r.venta) {
        e.numVentas++;
        e.vendido += monto;
        if (r.cobro) e.cobrado += monto;
        else e.pendiente += monto;
      }
    });

    return Object.keys(mapa)
      .map(function (n) { return mapa[n]; })
      .sort(function (a, b) { return b.vendido - a.vendido; });
  }

  /* Top por monto cotizado. Es un orden distinto al de la tabla
     de empresas a propósito: ahí interesa lo vendido, aquí lo
     que se movió aunque no haya cerrado. */
  function ranking(lista, cuantas) {
    return porEmpresa(lista)
      .slice()
      .sort(function (a, b) { return b.cotizado - a.cotizado; })
      .slice(0, cuantas || 5);
  }

  /* ---------------------------------------------------------
     Barras por mes

     Ignora el filtro de mes a propósito: la gráfica sirve para
     comparar los doce meses entre sí, y filtrada por uno solo
     mostraría una sola barra.
     --------------------------------------------------------- */
  function porMes(registros, filtros) {
    const f = filtros || {};
    const texto = String(f.texto || "").trim().toLowerCase();
    const anio = f.anio === undefined || f.anio === null ? "todos" : String(f.anio);

    const meses = MESES.map(function () {
      return { cotizado: 0, vendido: 0 };
    });

    registros.forEach(function (r) {
      const fecha = new Date(r.fecha);
      if (isNaN(fecha.getTime())) return;
      if (anio !== "todos" && fecha.getFullYear() !== Number(anio)) return;
      if (!coincideTexto(r, texto)) return;

      const monto = Number(r.monto) || 0;
      meses[fecha.getMonth()].cotizado += monto;
      if (r.venta) meses[fecha.getMonth()].vendido += monto;
    });

    return meses;
  }

  /* ---------------------------------------------------------
     Meta del periodo

     La meta se captura por mes ("2026-09"). Con un mes y un año
     concretos hay una sola; con el filtro en "todos" se suman
     las que caen dentro, que sirve para mirar pero no para
     editar (no tendría sentido escribir una suma).
     --------------------------------------------------------- */
  function periodoDe(filtros) {
    const f = filtros || {};
    const mes = f.mes === undefined || f.mes === null ? "todos" : String(f.mes);
    const anio = f.anio === undefined || f.anio === null ? "todos" : String(f.anio);

    if (mes === "todos" || anio === "todos") return null;
    return anio + "-" + String(Number(mes) + 1).padStart(2, "0");
  }

  function metaDelFiltro(metas, filtros) {
    const tabla = metas || {};
    const periodo = periodoDe(filtros);
    if (periodo) return Number(tabla[periodo]) || 0;

    const f = filtros || {};
    const mes = f.mes === undefined || f.mes === null ? "todos" : String(f.mes);
    const anio = f.anio === undefined || f.anio === null ? "todos" : String(f.anio);
    let total = 0;

    Object.keys(tabla).forEach(function (clave) {
      const partes = clave.split("-");
      if (anio !== "todos" && partes[0] !== anio) return;
      if (mes !== "todos" && Number(partes[1]) !== Number(mes) + 1) return;
      total += Number(tabla[clave]) || 0;
    });

    return total;
  }

  function nivelSemaforo(avance) {
    if (avance >= META_VERDE) return "verde";
    if (avance >= META_AMBAR) return "ambar";
    return "rojo";
  }

  /* Cómo se llama el periodo que se está mirando. Lo usan el
     panel de meta y la portada del PDF, para que digan igual. */
  function tituloPeriodo(filtros) {
    const f = filtros || {};
    const mes = f.mes === undefined || f.mes === null ? "todos" : String(f.mes);
    const anio = f.anio === undefined || f.anio === null ? "todos" : String(f.anio);

    if (mes !== "todos" && anio !== "todos") {
      return NOMBRES_MES[Number(mes)] + " " + anio;
    }
    if (anio !== "todos") return "Año " + anio;
    return "Todos los periodos";
  }

  const Calculos = {
    MESES: MESES,
    NOMBRES_MES: NOMBRES_MES,
    filtrar: filtrar,
    totales: totales,
    porcentaje: porcentaje,
    metricas: metricas,
    porEmpresa: porEmpresa,
    ranking: ranking,
    porMes: porMes,
    periodoDe: periodoDe,
    metaDelFiltro: metaDelFiltro,
    nivelSemaforo: nivelSemaforo,
    tituloPeriodo: tituloPeriodo
  };

  /* En Node se exporta como módulo; en el navegador queda como
     variable global, igual que Almacen */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Calculos;
  } else {
    raiz.Calculos = Calculos;
  }

})(typeof globalThis !== "undefined" ? globalThis : this);
