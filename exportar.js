/* =========================================================
   Informe en PDF

   Dibuja en papel lo mismo que se ve en pantalla, usando los
   cálculos de calculos.js. Ese es el punto de compartir el
   módulo: si el informe sumara por su cuenta, un día diría
   una cifra distinta a la del dashboard y no habría manera de
   saber cuál de las dos está mal.

   Se escribe directamente sobre la respuesta HTTP, sin pasar
   por un archivo temporal: para un informe de unos cientos de
   filas no hace falta, y así no queda basura en disco si algo
   falla a media escritura.

   pdfkit dibuja con coordenadas, no con HTML. Todo lo que se
   ve aquí es "pon este texto en este punto", así que el orden
   del código es el orden en que aparecen las cosas en la hoja.
   ========================================================= */

const PDFDocument = require("pdfkit");
const C = require("./calculos");

/* Los mismos colores del dashboard, para que el papel y la
   pantalla se reconozcan como la misma cosa */
const AZUL = "#2563eb";
const VERDE = "#15803d";
const NARANJA = "#b45309";
const ROJO = "#b91c1c";
const TEXTO = "#1f2937";
const SUAVE = "#6b7280";
const BORDE = "#e2e5ea";
const FONDO = "#fafbfc";

const MARGEN = 40;
const ANCHO = 595.28 - MARGEN * 2;

/* Formato boliviano: "Bs 1.234,56". Se arma una sola vez
   porque construir un Intl.NumberFormat por celda es caro
   cuando la tabla tiene cientos de filas. */
const formatoMoneda = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function moneda(valor) {
  return formatoMoneda.format(Number(valor) || 0);
}

function fechaCorta(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return String(d.getDate()).padStart(2, "0") + "/" +
         String(d.getMonth() + 1).padStart(2, "0") + "/" +
         d.getFullYear();
}

function fechaHora(d) {
  return fechaCorta(d) + " a las " +
         String(d.getHours()).padStart(2, "0") + ":" +
         String(d.getMinutes()).padStart(2, "0");
}

/* Recorta lo que no cabe en una celda. Sin esto, un nombre
   largo se monta encima de la columna siguiente. */
function recortar(doc, texto, ancho) {
  const t = String(texto === undefined || texto === null ? "" : texto);
  if (doc.widthOfString(t) <= ancho) return t;

  let corto = t;
  while (corto.length > 1 && doc.widthOfString(corto + "…") > ancho) {
    corto = corto.slice(0, -1);
  }
  return corto + "…";
}

/* =========================================================
   Piezas de dibujo
   ========================================================= */

/* Salta de página si lo que viene no cabe. Se llama antes de
   cada bloque para que ninguno quede partido por la mitad. */
function asegurarEspacio(doc, alto) {
  const limite = doc.page.height - MARGEN - 20;
  if (doc.y + alto > limite) {
    doc.addPage();
    return true;
  }
  return false;
}

function titulo(doc, texto) {
  asegurarEspacio(doc, 40);
  doc.moveDown(0.8);
  doc.fillColor(TEXTO).font("Helvetica-Bold").fontSize(13).text(texto, MARGEN, doc.y);
  doc.moveTo(MARGEN, doc.y + 3).lineTo(MARGEN + ANCHO, doc.y + 3)
     .lineWidth(1).strokeColor(BORDE).stroke();
  doc.moveDown(0.7);
}

/* Las tarjetas del resumen: rejilla de cajas con etiqueta
   arriba y cifra grande abajo */
function tarjetas(doc, items) {
  const porFila = 3;
  const hueco = 10;
  const ancho = (ANCHO - hueco * (porFila - 1)) / porFila;
  const alto = 46;
  const filas = Math.ceil(items.length / porFila);

  asegurarEspacio(doc, filas * (alto + hueco));
  const arriba = doc.y;

  items.forEach(function (item, i) {
    const x = MARGEN + (i % porFila) * (ancho + hueco);
    const y = arriba + Math.floor(i / porFila) * (alto + hueco);

    doc.roundedRect(x, y, ancho, alto, 4)
       .fillAndStroke(FONDO, BORDE);

    doc.fillColor(SUAVE).font("Helvetica").fontSize(7.5)
       .text(item.etiqueta.toUpperCase(), x + 9, y + 8, { width: ancho - 18 });

    doc.fillColor(item.color || TEXTO).font("Helvetica-Bold").fontSize(13)
       .text(recortar(doc, item.valor, ancho - 18), x + 9, y + 22, { width: ancho - 18 });

    if (item.nota) {
      doc.fillColor(SUAVE).font("Helvetica").fontSize(7)
         .text(recortar(doc, item.nota, ancho - 18), x + 9, y + 37, { width: ancho - 18 });
    }
  });

  doc.y = arriba + filas * (alto + hueco);
}

/* Tabla genérica. Las columnas se declaran con ancho y
   alineación; el ancho se reparte en proporción a lo pedido
   para que siempre ocupe el ancho útil de la hoja. */
function tabla(doc, columnas, filas, opciones) {
  const op = opciones || {};
  const altoFila = 16;
  const suma = columnas.reduce(function (a, c) { return a + c.peso; }, 0);

  const anchos = columnas.map(function (c) { return (c.peso / suma) * ANCHO; });

  function cabecera() {
    const y = doc.y;
    doc.rect(MARGEN, y, ANCHO, altoFila).fill(FONDO);

    let x = MARGEN;
    columnas.forEach(function (c, i) {
      doc.fillColor(SUAVE).font("Helvetica-Bold").fontSize(7.5)
         .text(recortar(doc, c.titulo.toUpperCase(), anchos[i] - 8), x + 4, y + 5, {
           width: anchos[i] - 8,
           align: c.derecha ? "right" : "left"
         });
      x += anchos[i];
    });

    doc.y = y + altoFila;
  }

  asegurarEspacio(doc, altoFila * 3);
  cabecera();

  filas.forEach(function (fila) {
    /* La cabecera se repite en cada página: una tabla larga
       sin encabezados en la hoja 3 es ilegible */
    if (asegurarEspacio(doc, altoFila)) cabecera();

    const y = doc.y;
    let x = MARGEN;

    columnas.forEach(function (c, i) {
      const celda = fila[i];
      const valor = celda && celda.texto !== undefined ? celda.texto : celda;
      const color = celda && celda.color ? celda.color : TEXTO;
      const negrita = celda && celda.negrita;

      doc.fillColor(color)
         .font(negrita ? "Helvetica-Bold" : "Helvetica")
         .fontSize(8)
         .text(recortar(doc, valor, anchos[i] - 8), x + 4, y + 4, {
           width: anchos[i] - 8,
           align: c.derecha ? "right" : "left"
         });

      x += anchos[i];
    });

    doc.moveTo(MARGEN, y + altoFila).lineTo(MARGEN + ANCHO, y + altoFila)
       .lineWidth(0.5).strokeColor(BORDE).stroke();

    doc.y = y + altoFila;
  });

  if (op.total) {
    if (asegurarEspacio(doc, altoFila)) cabecera();

    const y = doc.y;
    doc.rect(MARGEN, y, ANCHO, altoFila).fill(FONDO);

    let x = MARGEN;
    columnas.forEach(function (c, i) {
      const celda = op.total[i];
      const valor = celda && celda.texto !== undefined ? celda.texto : celda;

      doc.fillColor(celda && celda.color ? celda.color : TEXTO)
         .font("Helvetica-Bold").fontSize(8)
         .text(recortar(doc, valor, anchos[i] - 8), x + 4, y + 4, {
           width: anchos[i] - 8,
           align: c.derecha ? "right" : "left"
         });
      x += anchos[i];
    });

    doc.y = y + altoFila;
  }
}

/* La gráfica de barras. Se dibuja con rectángulos porque
   pdfkit no sabe de HTML: es la misma información que la
   pantalla, no la misma imagen. */
function grafica(doc, meses) {
  const alto = 130;
  asegurarEspacio(doc, alto + 40);

  const arriba = doc.y;
  const base = arriba + alto;
  const anchoMes = ANCHO / 12;

  const maximo = meses.reduce(function (m, x) {
    return Math.max(m, x.cotizado, x.vendido);
  }, 0);

  /* Sin datos no se dibuja una rejilla vacía que confunde */
  if (maximo <= 0) {
    doc.fillColor(SUAVE).font("Helvetica-Oblique").fontSize(9)
       .text("Sin movimientos en el periodo.", MARGEN, arriba + 20, {
         width: ANCHO, align: "center"
       });
    doc.y = arriba + 50;
    return;
  }

  /* Tres líneas de referencia: sin ellas las barras se
     comparan entre sí pero no se sabe cuánto valen */
  [0, 0.5, 1].forEach(function (fraccion) {
    const y = base - alto * fraccion;
    doc.moveTo(MARGEN, y).lineTo(MARGEN + ANCHO, y)
       .lineWidth(0.5).strokeColor(BORDE).stroke();
    doc.fillColor(SUAVE).font("Helvetica").fontSize(6)
       .text(moneda(maximo * fraccion), MARGEN, y - 8, { width: ANCHO, align: "right" });
  });

  meses.forEach(function (m, i) {
    const centro = MARGEN + i * anchoMes + anchoMes / 2;
    const anchoBarra = Math.min(9, anchoMes / 3);

    const altoCot = (m.cotizado / maximo) * alto;
    const altoVen = (m.vendido / maximo) * alto;

    if (altoCot > 0) {
      doc.rect(centro - anchoBarra - 1, base - altoCot, anchoBarra, altoCot).fill(AZUL);
    }
    if (altoVen > 0) {
      doc.rect(centro + 1, base - altoVen, anchoBarra, altoVen).fill(VERDE);
    }

    doc.fillColor(SUAVE).font("Helvetica").fontSize(7)
       .text(C.MESES[i], MARGEN + i * anchoMes, base + 4, {
         width: anchoMes, align: "center"
       });
  });

  /* Leyenda */
  const yLeyenda = base + 18;
  doc.rect(MARGEN, yLeyenda, 8, 8).fill(AZUL);
  doc.fillColor(SUAVE).font("Helvetica").fontSize(8)
     .text("Cotizado", MARGEN + 12, yLeyenda + 1);
  doc.rect(MARGEN + 70, yLeyenda, 8, 8).fill(VERDE);
  doc.fillColor(SUAVE).font("Helvetica").fontSize(8)
     .text("Vendido", MARGEN + 82, yLeyenda + 1);

  doc.y = yLeyenda + 20;
}

/* =========================================================
   El informe

   registros y metas vienen de la base; filtros es lo que
   tenía puesto la pantalla al pulsar el botón, para que el
   papel muestre exactamente lo que se estaba mirando.
   ========================================================= */
function informe(salida, datos) {
  const registros = datos.registros || [];
  const metas = datos.metas || {};
  const filtros = datos.filtros || {};
  const quien = datos.quien || "";

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGEN,
    /* Hace falta para poder numerar "página X de Y": el total
       no se sabe hasta haber dibujado todo */
    bufferPages: true,
    info: {
      Title: "Cotizaciones y Proyectos — " + C.tituloPeriodo(filtros),
      Author: quien,
      Creator: "Dashboard de Cotizaciones"
    }
  });

  doc.pipe(salida);

  const lista = C.filtrar(registros, filtros);
  const t = C.totales(lista);
  const m = C.metricas(t);
  const meta = C.metaDelFiltro(metas, filtros);
  const empresas = C.porEmpresa(lista);
  const top = C.ranking(lista, 5);
  const meses = C.porMes(registros, filtros);

  /* ---------- Cabecera ---------- */
  doc.fillColor(TEXTO).font("Helvetica-Bold").fontSize(19)
     .text("Cotizaciones y Proyectos", MARGEN, MARGEN);

  doc.fillColor(SUAVE).font("Helvetica").fontSize(10)
     .text(C.tituloPeriodo(filtros), MARGEN, doc.y + 2);

  if (filtros.texto) {
    doc.fillColor(SUAVE).font("Helvetica-Oblique").fontSize(8.5)
       .text('Filtrado por: "' + filtros.texto + '"', MARGEN, doc.y + 2);
  }

  doc.fillColor(SUAVE).font("Helvetica").fontSize(8)
     .text("Generado por " + quien + " el " + fechaHora(new Date()),
           MARGEN, doc.y + 4);

  doc.moveTo(MARGEN, doc.y + 8).lineTo(MARGEN + ANCHO, doc.y + 8)
     .lineWidth(1).strokeColor(BORDE).stroke();
  doc.y += 16;

  /* ---------- Resumen ---------- */
  titulo(doc, "Resumen");

  tarjetas(doc, [
    { etiqueta: "Total de proyectos", valor: String(t.num) },
    { etiqueta: "Total cotizado", valor: moneda(t.cotizado) },
    { etiqueta: "Ventas realizadas", valor: moneda(t.vendido),
      nota: t.numVentas + (t.numVentas === 1 ? " venta" : " ventas") },
    { etiqueta: "Total cobrado", valor: moneda(t.cobrado), color: VERDE },
    { etiqueta: "Pendiente de cobro", valor: moneda(t.pendiente), color: NARANJA },
    { etiqueta: "Meta del periodo", valor: meta > 0 ? moneda(meta) : "Sin meta",
      nota: meta > 0 ? Math.round((t.vendido / meta) * 100) + "% alcanzado" : "" }
  ]);

  /* La meta merece una frase, no solo un número: es la única
     cifra del informe que se compara con un objetivo */
  if (meta > 0) {
    const avance = (t.vendido / meta) * 100;
    const nivel = C.nivelSemaforo(avance);
    const color = nivel === "verde" ? VERDE : (nivel === "ambar" ? NARANJA : ROJO);

    doc.moveDown(0.3);
    doc.fillColor(color).font("Helvetica-Bold").fontSize(9)
       .text(t.vendido >= meta
         ? "Meta alcanzada. Superada por " + moneda(t.vendido - meta) + "."
         : "Faltan " + moneda(meta - t.vendido) + " para la meta.",
         MARGEN, doc.y, { width: ANCHO });
  }

  /* ---------- Métricas ---------- */
  titulo(doc, "Métricas");

  tarjetas(doc, [
    { etiqueta: "Tasa de conversión", valor: m.conversion + "%",
      nota: t.numVentas + " de " + t.num },
    { etiqueta: "Ticket promedio cotizado", valor: moneda(m.ticket) },
    { etiqueta: "Ticket promedio vendido", valor: moneda(m.ticketVenta) },
    { etiqueta: "Avance de cobro", valor: m.avanceCobro + "%",
      nota: moneda(t.cobrado) + " de " + moneda(t.vendido) }
  ]);

  /* ---------- Gráfica ---------- */
  titulo(doc, "Cotizado vs. vendido por mes");
  grafica(doc, meses);

  /* ---------- Top empresas ---------- */
  titulo(doc, "Top empresas");

  if (!top.length) {
    doc.fillColor(SUAVE).font("Helvetica-Oblique").fontSize(9)
       .text("Sin datos para mostrar.", MARGEN, doc.y);
  } else {
    tabla(doc,
      [
        { titulo: "#", peso: 0.5 },
        { titulo: "Empresa", peso: 5 },
        { titulo: "Cotizado", peso: 2.2, derecha: true },
        { titulo: "Vendido", peso: 2.2, derecha: true }
      ],
      top.map(function (e, i) {
        return [String(i + 1), e.nombre, moneda(e.cotizado), moneda(e.vendido)];
      })
    );
  }

  /* ---------- Comparativa por empresa ---------- */
  titulo(doc, "Métricas por empresa");

  if (!empresas.length) {
    doc.fillColor(SUAVE).font("Helvetica-Oblique").fontSize(9)
       .text("Sin datos para mostrar.", MARGEN, doc.y);
  } else {
    const totalEmp = empresas.reduce(function (a, e) {
      return {
        num: a.num + e.num, numVentas: a.numVentas + e.numVentas,
        cotizado: a.cotizado + e.cotizado, vendido: a.vendido + e.vendido,
        cobrado: a.cobrado + e.cobrado, pendiente: a.pendiente + e.pendiente
      };
    }, { num: 0, numVentas: 0, cotizado: 0, vendido: 0, cobrado: 0, pendiente: 0 });

    tabla(doc,
      [
        { titulo: "Empresa", peso: 3.4 },
        { titulo: "Cotiz.", peso: 1, derecha: true },
        { titulo: "Cotizado", peso: 2, derecha: true },
        { titulo: "Vendido", peso: 2, derecha: true },
        { titulo: "Cobrado", peso: 2, derecha: true },
        { titulo: "Pendiente", peso: 2, derecha: true },
        { titulo: "Conv.", peso: 1.1, derecha: true },
        { titulo: "Aporte", peso: 1.1, derecha: true }
      ],
      empresas.map(function (e) {
        return [
          e.nombre,
          String(e.num),
          moneda(e.cotizado),
          moneda(e.vendido),
          moneda(e.cobrado),
          moneda(e.pendiente),
          C.porcentaje(e.numVentas, e.num) + "%",
          meta > 0 ? Math.round((e.vendido / meta) * 100) + "%" : "—"
        ];
      }),
      {
        total: [
          "TOTAL (" + empresas.length + (empresas.length === 1 ? " empresa)" : " empresas)"),
          String(totalEmp.num),
          moneda(totalEmp.cotizado),
          moneda(totalEmp.vendido),
          moneda(totalEmp.cobrado),
          moneda(totalEmp.pendiente),
          C.porcentaje(totalEmp.numVentas, totalEmp.num) + "%",
          meta > 0 ? Math.round((totalEmp.vendido / meta) * 100) + "%" : "—"
        ]
      }
    );
  }

  /* ---------- Detalle ---------- */
  titulo(doc, "Detalle de cotizaciones (" + lista.length + ")");

  if (!lista.length) {
    doc.fillColor(SUAVE).font("Helvetica-Oblique").fontSize(9)
       .text("No hay registros para mostrar.", MARGEN, doc.y);
  } else {
    tabla(doc,
      [
        { titulo: "Fecha", peso: 1.5 },
        { titulo: "Cotización / Proyecto", peso: 4 },
        { titulo: "Empresa", peso: 3 },
        { titulo: "Se cotizó", peso: 2, derecha: true },
        { titulo: "Venta", peso: 1.1, derecha: true },
        { titulo: "Cobro", peso: 1.1, derecha: true }
      ],
      lista.map(function (r) {
        return [
          fechaCorta(r.fecha),
          r.nombre,
          r.empresa,
          moneda(r.monto),
          { texto: r.venta ? "Sí" : "No", color: r.venta ? VERDE : SUAVE },
          { texto: r.cobro ? "Sí" : "No", color: r.cobro ? VERDE : SUAVE }
        ];
      })
    );
  }

  /* ---------- Pie con numeración ----------
     Se hace al final, cuando ya se sabe cuántas páginas hay */
  const paginas = doc.bufferedPageRange();

  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);

    const y = doc.page.height - MARGEN + 6;
    doc.fillColor(SUAVE).font("Helvetica").fontSize(7.5)
       .text("Cotizaciones y Proyectos · " + C.tituloPeriodo(filtros),
             MARGEN, y, { width: ANCHO / 2, align: "left" });
    doc.fillColor(SUAVE).font("Helvetica").fontSize(7.5)
       .text("Página " + (i + 1) + " de " + paginas.count,
             MARGEN + ANCHO / 2, y, { width: ANCHO / 2, align: "right" });
  }

  doc.end();
  return doc;
}

/* Nombre del archivo que verá quien lo descargue. Sin espacios
   ni acentos: hay clientes de correo y sistemas de archivos
   que los maltratan. */
function nombreArchivo(filtros) {
  const periodo = C.tituloPeriodo(filtros)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return "cotizaciones-" + periodo + ".pdf";
}

module.exports = {
  informe: informe,
  nombreArchivo: nombreArchivo
};
