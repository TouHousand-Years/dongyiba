param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$siteCandidates = @(
  (Join-Path $projectRoot "site"),
  (Join-Path $projectRoot "dist\client")
)
$siteRoot = $siteCandidates |
  Where-Object { Test-Path -LiteralPath (Join-Path $_ "index.html") } |
  Select-Object -First 1
$listener = $null

function Test-DongyibaSite([string]$Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content.Contains("Gensokyo character puzzle")
  } catch {
    return $false
  }
}

function Open-LocalSite([string]$Url) {
  try {
    Start-Process $Url | Out-Null
  } catch {
    Write-Host "The browser could not be opened automatically. Open $Url manually." -ForegroundColor Yellow
  }
}

function Get-ContentType([string]$Path) {
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css"  { return "text/css; charset=utf-8" }
    ".js"   { return "text/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".rsc"  { return "text/x-component; charset=utf-8" }
    ".svg"  { return "image/svg+xml" }
    ".png"  { return "image/png" }
    ".jpg"  { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".gif"  { return "image/gif" }
    ".webp" { return "image/webp" }
    ".ico"  { return "image/x-icon" }
    ".woff" { return "font/woff" }
    ".woff2" { return "font/woff2" }
    default  { return "application/octet-stream" }
  }
}

function Send-Response([Net.Sockets.TcpClient]$Client, [string]$Root) {
  $stream = $Client.GetStream()
  $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
  $requestLine = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($requestLine)) { return }

  while ($true) {
    $line = $reader.ReadLine()
    if ([string]::IsNullOrEmpty($line)) { break }
  }

  $parts = $requestLine.Split(" ")
  $method = $parts[0]
  if ($parts.Length -lt 2 -or ($method -ne "GET" -and $method -ne "HEAD")) {
    $body = [Text.Encoding]::UTF8.GetBytes("Method Not Allowed")
    $header = "HTTP/1.1 405 Method Not Allowed`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($method -ne "HEAD") { $stream.Write($body, 0, $body.Length) }
    return
  }

  $urlPath = ($parts[1] -split "\?", 2)[0]
  $decodedPath = [Uri]::UnescapeDataString($urlPath).Replace("/", [IO.Path]::DirectorySeparatorChar)
  $relativePath = $decodedPath.TrimStart([IO.Path]::DirectorySeparatorChar)
  if ([string]::IsNullOrEmpty($relativePath)) { $relativePath = "index.html" }

  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $filePath = [IO.Path]::GetFullPath((Join-Path $Root $relativePath))
  if (-not $filePath.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    $filePath = ""
  } elseif (Test-Path -LiteralPath $filePath -PathType Container) {
    $filePath = Join-Path $filePath "index.html"
  } elseif (-not (Test-Path -LiteralPath $filePath -PathType Leaf) -and -not [IO.Path]::HasExtension($filePath)) {
    $filePath = Join-Path $filePath "index.html"
  }

  if ($filePath -and (Test-Path -LiteralPath $filePath -PathType Leaf)) {
    $status = "200 OK"
    $body = [IO.File]::ReadAllBytes($filePath)
    $contentType = Get-ContentType $filePath
  } else {
    $status = "404 Not Found"
    $body = [Text.Encoding]::UTF8.GetBytes("Not Found")
    $contentType = "text/plain; charset=utf-8"
  }

  $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($method -ne "HEAD") { $stream.Write($body, 0, $body.Length) }
}

try {
  if (-not $siteRoot) {
    throw "Built site files are missing. On the development computer, run npm run package:windows first."
  }

  $existingUrl = "http://127.0.0.1:3000/"
  if (Test-DongyibaSite $existingUrl) {
    Write-Host "Dongyiba is already running: $existingUrl"
    if (-not $NoBrowser) { Open-LocalSite $existingUrl }
    exit 0
  }

  $port = $null
  foreach ($candidatePort in 3000..3010) {
    $candidate = $null
    try {
      $candidate = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidatePort)
      $candidate.Start()
      $listener = $candidate
      $port = $candidatePort
      break
    } catch {
      if ($candidate) { $candidate.Stop() }
    }
  }
  if ($null -eq $port) { throw "No available local port was found (tried 3000-3010)." }

  $localUrl = "http://127.0.0.1:$port/"
  Write-Host "Dongyiba is ready: $localUrl" -ForegroundColor Green
  Write-Host "Keep this window open while using the site. Closing it stops the local server."
  if (-not $NoBrowser) { Open-LocalSite $localUrl }

  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      Send-Response $client $siteRoot
    } catch {
      Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Yellow
    } finally {
      $client.Close()
    }
  }
} catch {
  Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if ($listener) { $listener.Stop() }
}
