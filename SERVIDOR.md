# Servidor web en la máquina virtual

Esta guía es para dejar el dashboard funcionando como **servidor de red local**: un solo
proceso en la máquina virtual, con la base SQLite en su disco, y todos los demás equipos
entrando por el navegador.

Es un camino distinto al de [INSTALACION.md](INSTALACION.md), que instala la aplicación de
escritorio con un `.exe`. **No se usan los dos a la vez sobre la misma carpeta de datos**:
SQLite no lo admite desde procesos de máquinas distintas.

---

## Requisitos

- Windows en la máquina virtual.
- [Node.js](https://nodejs.org) 22 o superior (probado con la 24).

No hay nada que compilar: SQLite viene dentro de Node (`node:sqlite`), y las dos únicas
dependencias, `express` y `pdfkit`, son JavaScript puro.

---

## Instalación

### 1. Copiar el código

Déjalo en una ruta local y corta, por ejemplo `C:\cotizaciones`.

Evita ponerlo dentro de OneDrive o de una carpeta de red: el servidor va a correr como
cuenta del sistema, que no ve las carpetas sincronizadas de un usuario.

### 2. Instalar dependencias

```powershell
cd C:\cotizaciones
npm install --omit=dev
```

`--omit=dev` deja fuera Electron y electron-builder, que en el servidor no hacen falta.

### 3. Elegir carpeta de datos y puerto (opcional)

Copia `config.ejemplo.json` como `config.json` y edítalo:

```json
{
  "carpetaDatos": "C:/DatosCotizaciones",
  "puerto": 3000
}
```

Sin `config.json`, la base queda en la subcarpeta `datos\` del propio proyecto y el puerto
es el 3000. Las dos claves son opcionales por separado.

La carpeta de datos **tiene que estar en un disco local de la VM**. Sobre una unidad de red
SQLite corrompe el archivo tarde o temprano.

### 4. Crear el primer usuario

```powershell
powershell
```

Sin usuarios, nadie puede entrar. La contraseña se pide aparte, no viaja en el comando.

### 5. Dejarlo arrancando solo

Con PowerShell **como administrador**, desde la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\servicio\instalar-tarea.ps1
```

Eso hace tres cosas:

- crea la tarea programada `Cotizaciones - servidor`, que arranca al encender la VM, sin
  que nadie tenga que iniciar sesión, y reintenta hasta 3 veces si el proceso se cae
- abre el puerto en el firewall de Windows
- arranca el servidor en ese momento y te dice en qué direcciones responde

---

## Arrancar y parar a mano

| Qué | Comando |
|---|---|
| Arrancar en primer plano (se ve todo en pantalla) | `npm run servidor` |
| Arrancar la tarea | `Start-ScheduledTask -TaskName "Cotizaciones - servidor"` |
| Pararla | `Stop-ScheduledTask -TaskName "Cotizaciones - servidor"` |
| Ver si está corriendo | `Get-ScheduledTask -TaskName "Cotizaciones - servidor"` |
| Ver si el puerto responde | `Test-NetConnection localhost -Port 3000` |

`npm run servidor` es útil para diagnosticar, porque los mensajes salen en la ventana. Para
el uso normal, la tarea programada es lo que corresponde: sobrevive a los reinicios y no
depende de que haya una sesión abierta.

---

## Dónde entran los usuarios

Desde cualquier equipo de la red:

```
http://IP-DE-LA-VM:3000
```

La IP la imprime `instalar-tarea.ps1` al terminar. Conviene que la VM tenga IP fija, o una
reserva en el DHCP, para que la dirección no cambie sola.

---

## Respaldos

Quien tiene rol de administración ve el botón **Respaldos** en la barra del dashboard. Esa
pantalla no la puede abrir nadie más: el servidor la niega aunque se escriba la dirección
a mano.

El servidor hace una copia sola cada día a las 03:00, y otra al arrancar si ese día todavía
no había ninguna. Las copias quedan en la subcarpeta `respaldos\` de la carpeta de datos y
se borran solas a los 30 días.

En la pantalla se puede:

| Qué | Cómo |
|---|---|
| Ver qué tiene cada copia | La tabla muestra cuántas cotizaciones trae, de qué meses y el monto total, sin restaurarla |
| Llevarse una copia | **Crear y descargar respaldo** hace una nueva; **Descargar** en una fila baja esa |
| Traer una copia de otro equipo | **Subir un respaldo**. Se revisa que sea una base de este sistema y queda en la lista; no reemplaza nada todavía |
| Volver a una copia | **Restaurar** en su fila |

Lo que hay que saber antes de restaurar:

- **Se reemplaza la base entera**: cotizaciones, metas, cuentas, contraseñas y bitácora
  quedan como estaban en la copia.
- Antes se guarda sola una copia de la base en uso, con el origen **Antes de restaurar**.
  Si te equivocaste de respaldo, restaura esa y todo vuelve a como estaba.
- Todos, incluido quien restaura, tienen que volver a iniciar sesión, con las cuentas de
  la copia.
- No se acepta una copia sin ninguna cuenta de administración activa, porque después
  nadie podría entrar.

Para copiar respaldos entre servidores, descárgalos en uno y súbelos en el otro desde esta
pantalla. Copiar el `cotizaciones.db` a mano con el servidor encendido puede dejar fuera
los últimos cambios.

---

## Logs

Cada arranque escribe dos archivos en `logs\`, dentro de la carpeta de datos:

| Archivo | Qué trae |
|---|---|
| `servidor-FECHA-HORA.log` | lo normal: en qué puerto quedó, respaldos, avisos |
| `servidor-FECHA-HORA-errores.log` | los errores |

Se borran solos al mes. El último archivo es el del arranque más reciente:

```powershell
Get-ChildItem C:\DatosCotizaciones\logs | Sort-Object LastWriteTime | Select-Object -Last 2
```

El aviso `ExperimentalWarning: SQLite is an experimental feature` aparece siempre en el
archivo de errores y es normal, no es una falla.

---

## Actualizar el código

```powershell
Stop-ScheduledTask -TaskName "Cotizaciones - servidor"
# copiar los archivos nuevos encima
npm install --omit=dev
Start-ScheduledTask -TaskName "Cotizaciones - servidor"
```

La carpeta de datos no se toca en ningún momento. Si cambiaste el puerto en `config.json`,
vuelve a correr `instalar-tarea.ps1` para que el firewall quede igual.

---

## Quitar el arranque automático

```powershell
powershell -ExecutionPolicy Bypass -File .\servicio\quitar-tarea.ps1
```

Borra la tarea y la regla de firewall. La base de datos queda intacta.

---

## Si algo falla

**La tarea aparece como ejecutada pero el puerto no responde.**
Mira el último `-errores.log`. Lo más común es que falte `npm install --omit=dev`, o que la
carpeta de `carpetaDatos` esté en una ruta que la cuenta del sistema no alcanza (OneDrive,
unidad de red, perfil de otro usuario).

**Desde la VM entra, desde los demás equipos no.**
Es el firewall. Comprueba la regla:

```powershell
Get-NetFirewallRule -DisplayName "Cotizaciones - servidor"
```

Si la VM está en Proxmox, revisa también que la red sea puente (bridge) y no NAT.

**Nadie puede iniciar sesión, aunque la contraseña sea la correcta.**
Si delante hay HTTPS (un proxy inverso), arranca con `COTIZACIONES_HTTPS=1`; si no lo hay,
esa variable tiene que estar apagada. La cookie de sesión depende de eso.

**Dice que el puerto está ocupado.**
Algo más lo está usando, o quedó un servidor anterior vivo:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

---

## Variables de entorno

`config.json` cubre lo habitual, pero el servidor también acepta variables, y estas mandan
sobre el archivo:

| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | puerto TCP | 3000 |
| `HOST` | interfaz de escucha | 0.0.0.0 |
| `COTIZACIONES_DATOS` | carpeta del `.db` | `datos\` del proyecto |
| `COTIZACIONES_HTTPS` | `1` si hay HTTPS delante | apagado |
