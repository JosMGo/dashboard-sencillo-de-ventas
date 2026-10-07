# =========================================================
#  Quita el arranque automatico
#
#  Detiene el servidor, borra la tarea programada y cierra el
#  puerto en el firewall. No toca la base de datos ni nada de
#  la carpeta de datos.
#
#  Como administrador:
#
#      powershell -ExecutionPolicy Bypass -File .\servicio\quitar-tarea.ps1
# =========================================================

$ErrorActionPreference = "Stop"

$NOMBRE_TAREA   = "Cotizaciones - servidor"
$REGLA_FIREWALL = "Cotizaciones - servidor"

$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Esto hay que correrlo como administrador." -ForegroundColor Red
    exit 1
}

if (Get-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $NOMBRE_TAREA -Confirm:$false
    Write-Host "Tarea borrada: $NOMBRE_TAREA"
} else {
    Write-Host "No habia ninguna tarea $NOMBRE_TAREA."
}

if (Get-NetFirewallRule -DisplayName $REGLA_FIREWALL -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $REGLA_FIREWALL
    Write-Host "Regla de firewall borrada."
} else {
    Write-Host "No habia regla de firewall que borrar."
}

Write-Host ""
Write-Host "La base de datos sigue donde estaba; esto solo quita el arranque automatico."
