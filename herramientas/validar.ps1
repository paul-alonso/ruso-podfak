# Valida data/index.json y todas las clases con el mismo validador que usa la
# app (js/data.js): abre validar.html en Edge o Chrome sin ventana e imprime
# el informe. Devuelve código de salida 1 si hay errores.
#
# Uso:  powershell -ExecutionPolicy Bypass -File herramientas\validar.ps1
#       powershell -ExecutionPolicy Bypass -File herramientas\validar.ps1 -Tests   (pruebas automáticas)

param([switch]$Tests, [int]$Puerto = 8765)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$navegador = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $navegador) { throw 'No se encontró Edge ni Chrome.' }

if ($Tests) {
  $python = Get-Command python, py -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($python) {
    & $python.Source -m unittest discover -s (Join-Path (Split-Path $PSScriptRoot) 'tests') -p 'test_*.py'
    if ($LASTEXITCODE -ne 0) { Write-Output 'Fallan las pruebas de Python.'; exit 1 }
  } else {
    Write-Output 'Python no está instalado: se omiten las pruebas de indice.py.'
  }
}

$pagina = if ($Tests) { 'tests/tests.html' } else { 'validar.html?cli' }
$servidor = Start-Process powershell -WindowStyle Hidden -PassThru -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSScriptRoot\servir.ps1`"", '-Puerto', $Puerto)

try {
  $listo = $false
  for ($i = 0; $i -lt 50 -and -not $listo; $i++) {
    try { Invoke-WebRequest "http://localhost:$Puerto/validar.html" -UseBasicParsing -TimeoutSec 2 | Out-Null; $listo = $true }
    catch { Start-Sleep -Milliseconds 200 }
  }
  if (-not $listo) { throw "El servidor no arrancó en el puerto $Puerto." }

  $perfil = Join-Path $env:TEMP 'ruso-podfak-headless'
  $html = & $navegador --headless=new --disable-gpu --no-first-run --user-data-dir="$perfil" `
    --virtual-time-budget=10000 --dump-dom "http://localhost:$Puerto/$pagina" | Out-String

  $plano = [regex]::Match($html, '<pre id="texto-plano"[^>]*>([\s\S]*?)</pre>')
  $errores = [regex]::Match($html, 'data-errores="(\d+)"')
  if (-not $plano.Success -or -not $errores.Success) {
    throw 'La página no terminó de ejecutarse (¿error de JavaScript?). Ábrela en el navegador para ver la consola.'
  }
  [Net.WebUtility]::HtmlDecode($plano.Groups[1].Value)
  if ([int]$errores.Groups[1].Value -gt 0) { exit 1 }
} finally {
  Stop-Process -Id $servidor.Id -ErrorAction SilentlyContinue
}
