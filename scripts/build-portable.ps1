$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "release"
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
$version = $packageJson.version
if (-not $version -or $version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
  throw "package.json contains an invalid version: $version"
}
$packageName = "dongyiba-windows-v$version"
$packageRoot = Join-Path $releaseRoot $packageName
$zipPath = Join-Path $releaseRoot "$packageName.zip"
$siteSource = Join-Path $projectRoot "dist\client"
$launcherSource = Get-ChildItem -LiteralPath $projectRoot -Filter "*.cmd" -File | Select-Object -First 1

try {
  Push-Location $projectRoot
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "The static site build failed." }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath (Join-Path $siteSource "index.html"))) {
    throw "The build did not create dist\client\index.html."
  }
  if (-not $launcherSource) { throw "The Windows launcher was not found." }

  $resolvedProject = [IO.Path]::GetFullPath($projectRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $resolvedPackage = [IO.Path]::GetFullPath($packageRoot)
  if (-not $resolvedPackage.StartsWith($resolvedProject + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace a package directory outside the project."
  }

  New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
  if (Test-Path -LiteralPath $packageRoot) { Remove-Item -LiteralPath $packageRoot -Recurse -Force }
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

  New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "scripts") | Out-Null
  Copy-Item -LiteralPath $siteSource -Destination (Join-Path $packageRoot "site") -Recurse
  Copy-Item -LiteralPath $launcherSource.FullName -Destination (Join-Path $packageRoot "start-dongyiba.cmd")
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "start-local.ps1") -Destination (Join-Path $packageRoot "scripts")
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "portable-README.txt") -Destination (Join-Path $packageRoot "README.txt")
  [IO.File]::WriteAllText(
    (Join-Path $packageRoot "VERSION.txt"),
    "v$version`r`n",
    [Text.UTF8Encoding]::new($false)
  )

  Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
  Write-Host "Portable package created:" -ForegroundColor Green
  Write-Host $zipPath
} catch {
  Write-Host "Packaging failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
