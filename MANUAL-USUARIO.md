# Manual de usuario

Dashboard de Cotizaciones y Proyectos.

Este manual explica cómo usar el sistema en el día a día. Para instalarlo, ver
[INSTALACION.md](INSTALACION.md).

---

## 1. Abrir el sistema

Doble clic en el ícono **Cotizaciones** del escritorio o del menú de inicio.

Se abre una ventana con todo el dashboard. No hay que iniciar sesión ni escribir
contraseña: quien tiene acceso a la máquina tiene acceso al sistema.

---

## 2. Registrar una cotización nueva

1. Pulsa el botón azul **+ Nueva cotización**, arriba a la derecha.
2. Llena los cuatro datos:

| Campo | Qué se escribe |
|---|---|
| **Cotización / Proyecto** | El nombre del trabajo. Ej: `Proyecto página web`, `Cotización #001` |
| **Empresa** | El cliente. Ej: `SIRT`, `ANARTEC`, `LUCMAR` |
| **Precio cotizado** | El monto en bolivianos, solo números. Ej: `15000.50` |
| **Venta realizada** | Marca la casilla solo si ya se cerró la venta |
| **Cobrado** | Marca la casilla solo si ya entró el dinero |

3. Pulsa **Guardar**.

La cotización aparece de inmediato en la tabla y queda guardada.

> **La fecha y la hora se ponen solas.** No hay campo de fecha porque el sistema toma la
> del momento en que guardas. Si registras una cotización el 3 de septiembre a las 10:15,
> esa queda como su fecha.

### Cuidado con el nombre de la empresa

Al escribir en el campo Empresa, el sistema **sugiere las empresas que ya existen**.
Elige siempre la sugerencia en lugar de volver a escribirla.

Si un día escribes `SIRT` y otro día `Sirt`, el sistema las trata como **dos empresas
distintas** y las métricas quedan partidas a la mitad.

---

## 3. Marcar una venta o un cobro

No hace falta abrir nada. En la tabla de abajo, cada fila tiene dos casillas:

- **Venta** → márcala cuando el cliente acepta la cotización.
- **Se cobró** → márcala cuando el dinero ya entró.

Se guardan solas al hacer clic. No hay botón de guardar.

El flujo normal de una cotización es:

```
Se registra  →  se marca Venta  →  se marca Se cobró
(sin marcar)    (venta cerrada)    (dinero recibido)
```

---

## 4. Editar y eliminar

En la última columna de cada fila:

- **Editar** — abre el formulario con los datos cargados. Puedes cambiar el nombre, la
  empresa, el monto y las casillas. **La fecha original no cambia.**
- **Eliminar** — pide confirmación antes de borrar. Una vez confirmado, **no se puede
  deshacer**.

---

## 5. Buscar y filtrar

Arriba de la meta hay tres controles:

- **Buscar** — escribe parte del nombre de una empresa o de un proyecto. Filtra mientras
  escribes.
- **Mes** — muestra solo las cotizaciones de ese mes.
- **Año** — muestra solo las de ese año.

**Al abrir, el sistema muestra el mes en curso.** Si quieres ver todo el histórico, pon
Mes y Año en "Todos".

**Todo el dashboard reacciona al filtro**: las tarjetas de arriba, las métricas, la tabla
por empresa y la tabla principal se recalculan solas.

Por ejemplo: si eliges *Septiembre* + *2026*, todos los números que ves son únicamente de
septiembre de 2026.

---

## 6. La meta del mes

La meta es **una sola para toda la empresa**: el monto que se busca vender entre todos.

### Cómo capturarla

Al abrir, el sistema ya se sitúa en el mes en curso, así que el campo está listo para
escribir:

1. Escribe el monto en **Monto de la meta**.
2. Pulsa **Guardar**.

Para capturar la meta de otro mes, primero elige ese mes y año en los filtros de arriba,
y luego escribe el monto.

Cada mes tiene su propia meta. La de septiembre no afecta a la de octubre.

Para quitar una meta, borra el contenido del campo y pulsa Guardar.

> Con el mes en "Todos" el campo se bloquea y solo muestra la suma de las metas del
> periodo. Es a propósito: escribir una suma no tendría sentido.

### Cómo leer el semáforo

La meta se compara contra el **monto vendido** (lo marcado como Venta), no contra lo
cotizado ni lo cobrado.

| Avance | Color | Qué significa |
|---|---|---|
| 100% o más | 🟢 Verde | Meta alcanzada |
| 70% a 99% | 🟡 Ámbar | Cerca, pero falta |
| Menos de 70% | 🔴 Rojo | Atrasado |

Debajo de la barra aparece el mensaje concreto: *"Faltan Bs 85.000,00 para la meta"* o
*"Meta alcanzada. Superada por Bs 65.000,00"*.

---

## 7. Qué significa cada número

### Las cinco tarjetas de arriba

| Tarjeta | Qué suma |
|---|---|
| **Total de proyectos** | Cuántas cotizaciones hay en el periodo |
| **Total cotizado** | Todo lo cotizado, se haya vendido o no |
| **Ventas realizadas** | Solo lo marcado como Venta |
| **Total cobrado** | Ventas que además están marcadas como cobradas |
| **Pendiente de cobro** | Ventas cerradas cuyo dinero **todavía no entra** |

> **Total cobrado + Pendiente de cobro = Ventas realizadas.**
> El "Pendiente de cobro" es la plata que ya te ganaste pero aún no tienes.

### Las cuatro métricas

| Métrica | Qué mide |
|---|---|
| **Tasa de conversión** | De cada 100 cotizaciones, cuántas se convirtieron en venta |
| **Ticket promedio cotizado** | Cuánto vale una cotización en promedio |
| **Ticket promedio vendido** | Cuánto vale una venta cerrada en promedio |
| **Avance de cobro** | Qué porcentaje de lo vendido ya se cobró |

### Cotizado vs. vendido por mes

Gráfica de barras con los 12 meses del año. La barra clara es lo cotizado y la azul lo
vendido. Pasa el mouse sobre un mes para ver los montos exactos.

Esta gráfica **ignora el filtro de mes** a propósito, para que siempre puedas comparar
los 12 meses entre sí. Sí respeta el filtro de año.

### Métricas por empresa

Una fila por empresa, ordenadas de mayor a menor venta:

| Columna | Qué muestra |
|---|---|
| **Cotizaciones** | Cuántas se registraron |
| **Cotizado / Vendido / Cobrado** | Los montos de esa empresa |
| **Pendiente** | Lo vendido que aún no se cobra |
| **Conversión** | Qué porcentaje de sus cotizaciones se cerró |
| **Aporte a la meta** | Cuánto de la meta del mes puso esa empresa |

La última fila es el **TOTAL**, y es la única con semáforo, porque la meta es una sola
para todas juntas.

---

## 8. Cómo se guardan los datos

**Los datos se guardan al instante, en el momento exacto de cada acción.** No hay botón
de guardar general y no hace falta.

Se graba en disco cuando:

- Pulsas Guardar en el formulario de una cotización
- Marcas o desmarcas una casilla de Venta o Se cobró
- Eliminas un registro
- Guardas una meta

Esto quiere decir tres cosas:

1. **Cerrar la aplicación no guarda nada**, porque ya estaba todo guardado.
2. **Si se corta la luz o se apaga la máquina**, no pierdes nada de lo que ya habías
   capturado. Solo se perdería lo que estuvieras escribiendo en el formulario sin haber
   pulsado Guardar.
3. **Al abrir de nuevo**, la información aparece tal como la dejaste.

La información vive en un archivo llamado `cotizaciones.db`. Al pie de la ventana se ve
siempre la ruta exacta. Los detalles técnicos y cómo respaldarlo están en
[INSTALACION.md](INSTALACION.md).

---

## 9. Preguntas frecuentes

**¿Necesito internet?**
No. Todo funciona sin conexión.

**¿Puedo verlo desde mi celular o desde mi computadora?**
No. La información vive en la máquina donde está instalada la aplicación.

**Registré una cotización con la fecha equivocada. ¿Puedo cambiarla?**
No desde la aplicación: la fecha se asigna sola y no se edita. Habría que eliminar el
registro y volver a crearlo.

**¿Qué pasa si me equivoco al escribir el nombre de una empresa?**
Usa Editar en cada fila afectada y corrige el nombre. En cuanto todas las filas digan lo
mismo, las métricas se juntan solas.

**¿Cuento una cotización rechazada?**
Sí, déjala registrada sin marcar Venta. Así la tasa de conversión refleja la realidad.

**Marqué Cobrado pero no Venta. ¿Está bien?**
No. Para el sistema, algo cobrado siempre tuvo que venderse antes. Si solo marcas
Cobrado, ese monto **no se cuenta** en ninguna métrica de cobro. Marca siempre las dos.

**Cambié el mes en el filtro y todos los números cambiaron. ¿Se borró algo?**
No. Solo estás viendo un periodo distinto. Pon Mes y Año en "Todos" para ver todo otra vez.
