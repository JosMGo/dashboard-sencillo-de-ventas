# =========================================================
#  Arranque del servidor web
#
#  Esto es lo que ejecuta la tarea programada cada vez que
#  enciende la maquina virtual. Tambien sirve a mano, cuando
#  se quiere ver el arranque en vivo:
#
#      powershell -ExecutionPolicy Bypass -File .\servicio\iniciar-servidor.ps1
#
#  Lee config.json, el mismo archivo que usa la aplicacion de
#  escritorio. Las claves que le importan:
#
#      carpetaDatos   carpeta del .db   (por defecto: datos\)
#      puerto         puerto TCP        (por defecto: 3000)
#
#  Todo lo que el servidor imprime queda en logs\, dentro de
#  la carpeta de datos.
# =========================================================

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot

# --- Configuracion -------------------------------------------------

$puerto = 3000
$carpetaDatos = Join-Path $raiz "datos"

$config = Join-Path $raiz "config.json"
if (Test-Path $config) {
    try {
        $json = Get-Content $config -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($json.carpetaDatos) { $carpetaDatos = $json.carpetaDatos }
        if ($json.puerto) { $puerto = [int]$json.puerto }
    } catch {
        # Un config.json roto no debe dejar la VM sin servidor: se
        # sigue con los valores por defecto y queda la constancia.
        Write-Warning "config.json no se pudo leer: $($_.Exception.Message)"
    }
}

$env:COTIZACIONES_DATOS = $carpetaDatos
$env:PORT = "$puerto"

# --- Logs ----------------------------------------------------------

$carpetaLogs = Join-Path $carpetaDatos "logs"
New-Item -ItemType Directory -Force -Path $carpetaLogs | Out-Null

# Se borran solos al mes para que no crezcan sin fin
Get-ChildItem $carpetaLogs -Filter "servidor-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

# Cada arranque estrena archivo, asi un reinicio no pisa el
# registro del arranque anterior, que suele ser el que explica
# por que se cayo.
$marca = Get-Date -Format "yyyyMMdd-HHmmss"
$logSalida  = Join-Path $carpetaLogs "servidor-$marca.log"
$logErrores = Join-Path $carpetaLogs "servidor-$marca-errores.log"

# --- Arranque ------------------------------------------------------

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    "No se encontro node.exe en el PATH. Instala Node.js 22 o superior." |
        Out-File -FilePath $logErrores -Encoding utf8
    exit 1
}

$proceso = Start-Process -FilePath $node `
    -ArgumentList "server.js" `
    -WorkingDirectory $raiz `
    -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $logSalida `
    -RedirectStandardError $logErrores

# El codigo de salida es lo que mira el Programador de tareas
# para decidir si toca reintentar
exit $proceso.ExitCode
