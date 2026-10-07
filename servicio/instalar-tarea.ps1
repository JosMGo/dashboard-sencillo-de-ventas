# =========================================================
#  Deja el servidor arrancando solo con la maquina virtual
#
#  Crea una tarea programada que:
#
#  - se dispara al encender el equipo, sin que nadie tenga
#    que iniciar sesion
#  - corre como SYSTEM, asi no depende de una cuenta de usuario
#  - vuelve a levantar el servidor si el proceso se cae
#
#  Tambien abre el puerto en el firewall.
#
#  Se ejecuta UNA vez, como administrador:
#
#      powershell -ExecutionPolicy Bypass -File .\servicio\instalar-tarea.ps1
#
#  Para deshacerlo:  .\servicio\quitar-tarea.ps1
# =========================================================

$ErrorActionPreference = "Stop"

$NOMBRE_TAREA    = "Cotizaciones - servidor"
$REGLA_FIREWALL  = "Cotizaciones - servidor"

# --- Comprobaciones -------------------------------------------------

$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Esto hay que correrlo como administrador." -ForegroundColor Red
    Write-Host "Cierra esta ventana y abre PowerShell con boton derecho -> Ejecutar como administrador."
    exit 1
}

$raiz     = Split-Path -Parent $PSScriptRoot
$lanzador = Join-Path $PSScriptRoot "iniciar-servidor.ps1"

if (-not (Test-Path $lanzador)) {
    Write-Host "Falta $lanzador" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "No se encontro Node.js. Instalalo (version 22 o superior) y vuelve a correr esto." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $raiz "node_modules"))) {
    Write-Host "Faltan las dependencias. Corre primero:  npm install --omit=dev" -ForegroundColor Red
    exit 1
}

# El puerto se lee del mismo config.json que usa el lanzador,
# para que el firewall y el servidor nunca queden en desacuerdo
$puerto = 3000
$config = Join-Path $raiz "config.json"
if (Test-Path $config) {
    try {
        $json = Get-Content $config -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($json.puerto) { $puerto = [int]$json.puerto }
    } catch {
        Write-Warning "config.json no se pudo leer; se usa el puerto $puerto."
    }
}

# --- Tarea programada -----------------------------------------------

$accion = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$lanzador`"" `
    -WorkingDirectory $raiz

$disparador = New-ScheduledTaskTrigger -AtStartup

$cuenta = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# ExecutionTimeLimit en cero es "sin limite": sin eso Windows
# mata el servidor a los tres dias de estar corriendo.
$ajustes = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

if (Get-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue) {
    Write-Host "La tarea ya existia; se vuelve a crear con la configuracion de ahora."
    Stop-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $NOMBRE_TAREA -Confirm:$false
}

Register-ScheduledTask -TaskName $NOMBRE_TAREA `
    -Description "Servidor web del dashboard de cotizaciones" `
    -Action $accion -Trigger $disparador -Principal $cuenta -Settings $ajustes | Out-Null

Write-Host "Tarea creada: $NOMBRE_TAREA"

# --- Firewall --------------------------------------------------------

$regla = Get-NetFirewallRule -DisplayName $REGLA_FIREWALL -ErrorAction SilentlyContinue
if ($regla) {
    Set-NetFirewallRule -DisplayName $REGLA_FIREWALL -LocalPort $puerto -Protocol TCP
    Write-Host "Regla de firewall actualizada al puerto $puerto."
} else {
    New-NetFirewallRule -DisplayName $REGLA_FIREWALL `
        -Direction Inbound -Protocol TCP -LocalPort $puerto `
        -Action Allow -Profile Any | Out-Null
    Write-Host "Regla de firewall creada para el puerto $puerto."
}

# --- Arrancar ya ------------------------------------------------------

Start-ScheduledTask -TaskName $NOMBRE_TAREA
Start-Sleep -Seconds 4

if (Test-NetConnection -ComputerName "localhost" -Port $puerto -InformationLevel Quiet) {
    Write-Host ""
    Write-Host "El servidor esta respondiendo." -ForegroundColor Green
    Write-Host "Se entra desde esta VM en:   http://localhost:$puerto"

    $ips = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -ne "127.0.0.1" } |
        Select-Object -ExpandProperty IPAddress
    foreach ($ip in $ips) {
        Write-Host "Desde los demas equipos en: http://${ip}:$puerto"
    }

    Write-Host ""
    Write-Host "Si todavia no hay usuarios, crea el administrador con:  npm run usuarios"
} else {
    Write-Host ""
    Write-Host "La tarea quedo creada, pero el puerto $puerto no responde." -ForegroundColor Yellow
    Write-Host "Revisa el ultimo archivo de la carpeta logs\ dentro de la carpeta de datos."
}
