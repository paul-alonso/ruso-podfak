# Servidor estático mínimo para desarrollo (alternativa a `python -m http.server`).
# Uso:  powershell -ExecutionPolicy Bypass -File herramientas\servir.ps1 [-Puerto 8000]
# Luego abre http://localhost:8000/

param([int]$Puerto = 8000)

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'
  '.md' = 'text/plain; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.ico' = 'image/x-icon'
  '.woff2' = 'font/woff2'
}

$escucha = New-Object System.Net.HttpListener
$escucha.Prefixes.Add("http://localhost:$Puerto/")
$escucha.Start()
Write-Host "Sirviendo $raiz en http://localhost:$Puerto/  (Ctrl+C para parar)"

try {
  while ($escucha.IsListening) {
    $tarea = $escucha.GetContextAsync()
    # Espera en intervalos cortos para que Ctrl+C funcione.
    while (-not $tarea.AsyncWaitHandle.WaitOne(200)) { }
    $ctx = $tarea.Result
    $res = $ctx.Response
    try {
      $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($ruta -eq '' -or $ruta.EndsWith('/')) { $ruta += 'index.html' }
      $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
      $res.Headers.Add('Cache-Control', 'no-cache')
      if ($archivo.StartsWith($raiz + [IO.Path]::DirectorySeparatorChar) -and (Test-Path -LiteralPath $archivo -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($archivo)
        $ext = [IO.Path]::GetExtension($archivo).ToLower()
        $res.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $estado = 200
      } else {
        $res.StatusCode = 404
        $estado = 404
      }
      Write-Host "$estado /$ruta"
    } catch {
      Write-Host "Error: $_"
    } finally {
      $res.Close()
    }
  }
} finally {
  $escucha.Stop()
}
