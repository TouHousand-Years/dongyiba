param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 3000
$localUrl = "http://localhost:$port/"
$vinextCli = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
$server = $null

function Test-LocalSite {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Open-LocalSite {
  try {
    Start-Process $localUrl | Out-Null
  } catch {
    Write-Host "The browser could not be opened automatically. Open $localUrl manually." -ForegroundColor Yellow
  }
}

try {
  if (-not (Test-Path -LiteralPath $vinextCli)) {
    throw "Local dependencies are missing. Run npm install in the project folder first."
  }

  if (Test-LocalSite) {
    Write-Host "The local site is already running. Opening $localUrl"
    if (-not $NoBrowser) { Open-LocalSite }
    Read-Host "Press Enter to close this window"
    exit 0
  }

  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $node
  $startInfo.Arguments = "`"$vinextCli`" dev --host 127.0.0.1 --port $port"
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $false
  $server = [System.Diagnostics.Process]::Start($startInfo)

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-LocalSite) {
      $ready = $true
      break
    }
    if ($server.HasExited) {
      throw "The local development server failed to start."
    }
  }

  if (-not $ready) {
    throw "Timed out while waiting for the local site."
  }

  Write-Host "Dongyiba is ready: $localUrl"
  Write-Host "Keep this window open while using the site. Closing it stops the local server."
  if (-not $NoBrowser) { Open-LocalSite }
  $server.WaitForExit()
} catch {
  Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host "Press Enter to close this window"
  exit 1
} finally {
  if ($server -and -not $server.HasExited) {
    $server.Kill()
    $server.WaitForExit()
  }
}
