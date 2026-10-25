# Rebuild the backend and restart the local API on http://localhost:5000.
#
# Usage: pwsh -NoProfile -File rebuild-backend.ps1
#
# The API holds locks on the output DLLs, so we MUST stop it before the
# build and start it again afterwards.

$ErrorActionPreference = "Stop"
# <repo>/backend/tests/integration/_tools/rebuild-backend.ps1
#   -> up 3 = <repo>/backend/tests/integration, up 4 = <repo>/backend
$integrationRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$root = Join-Path (Split-Path -Parent (Split-Path -Parent $integrationRoot)) "backend"
$logDir = Join-Path $integrationRoot "_logs"

Write-Output "Stopping running Arcana.Api processes..."
Get-Process -Name "Arcana.Api" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name like '%dotnet%'" |
  Where-Object { $_.CommandLine -like "*Arcana.Api*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Output "Building..."
Push-Location $root
try {
  $out = dotnet build Arcana.sln -c Debug 2>&1 | Out-String
} finally {
  Pop-Location
}
if ($out -notmatch "Build succeeded") {
  Write-Output $out
  throw "Build failed"
}
Write-Output "Build OK"

Write-Output "Starting API..."
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Process -FilePath "dotnet" `
  -ArgumentList @("run","--project","src/Arcana.Api/Arcana.Api.csproj","--no-build","--urls","http://localhost:5000") `
  -WorkingDirectory $root `
  -RedirectStandardOutput "$logDir\api.log" `
  -RedirectStandardError "$logDir\api.err" `
  -NoNewWindow

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest http://localhost:5000/health -TimeoutSec 3 -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
      Write-Output "API ready after $($i+1)s"
      exit 0
    }
  } catch { }
}
Write-Output "API failed to start. Tail of api.err:"
if (Test-Path "$logDir\api.err") { Get-Content "$logDir\api.err" -Tail 30 }
exit 1
