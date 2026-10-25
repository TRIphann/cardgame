# start-dev.ps1
#
# Khởi động backend (.NET API :5000) và frontend (Vite :5173) đồng thời để bắt đầu
# test local. Dùng chung cho backend integration tests (PowerShell) và frontend
# E2E tests (Playwright).
#
# Usage:
#   pwsh -NoProfile -File start-dev.ps1              # chạy cả 2 server
#   pwsh -NoProfile -File start-dev.ps1 -Backend     # chỉ backend
#   pwsh -NoProfile -File start-dev.ps1 -Frontend    # chỉ frontend
#   pwsh -NoProfile -File start-dev.ps1 -KillExisting # giết process cũ trước

param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$KillExisting
)

$ErrorActionPreference = "Continue"

# <repo>/backend/tests/integration/_tools/start-dev.ps1
#   up 1 = _tools, up 2 = integration, up 3 = tests, up 4 = backend, up 5 = repo
$toolsDir = $PSScriptRoot
$integrationRoot = Split-Path -Parent $toolsDir
$backendRoot = Split-Path -Parent (Split-Path -Parent $integrationRoot)
$root = Split-Path -Parent $backendRoot

$apiPort = 5000
$fePort = 5173

if ($KillExisting) {
    Write-Host "==> Kill processes on port $apiPort va $fePort" -ForegroundColor Cyan
    Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Get-NetTCPConnection -LocalPort $fePort -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
}

$onlyBackend = $Backend -and -not $Frontend
$onlyFrontend = $Frontend -and -not $Backend

# ── Backend ──
if (-not $Frontend -or $onlyBackend) {
    Write-Host "==> Khoi dong backend tai http://localhost:$apiPort" -ForegroundColor Cyan
    $apiDir = $backendRoot
    Start-Job -Name "arcana-api" -ScriptBlock {
        Set-Location $using:apiDir
        dotnet run --project src/Arcana.Api --no-build --urls "http://localhost:$using:apiPort"
    } | Out-Null
}

# ── Frontend ──
if (-not $Backend -or $onlyFrontend) {
    Write-Host "==> Khoi dong frontend tai http://localhost:$fePort" -ForegroundColor Cyan
    $feDir = Join-Path $root "frontend"
    Start-Job -Name "arcana-fe" -ScriptBlock {
        Set-Location $using:feDir
        npx vite --host --port $using:fePort
    } | Out-Null
}

# ── Wait until both ready ──
Write-Host "==> Doi server san sang..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(45)
$apiReady = $false
$feReady = $false

while ((Get-Date) -lt $deadline) {
    if (-not $apiReady) {
        try {
            $h = Invoke-WebRequest -Uri "http://localhost:$apiPort/health" -UseBasicParsing -TimeoutSec 2
            if ($h.StatusCode -eq 200) { $apiReady = $true }
        } catch {}
    }
    if (-not $feReady) {
        try {
            $f = Invoke-WebRequest -Uri "http://localhost:$fePort" -UseBasicParsing -TimeoutSec 2
            if ($f.StatusCode -eq 200) { $feReady = $true }
        } catch {}
    }
    if ((-not $Backend -and -not $Frontend) -or $onlyBackend -or $onlyFrontend) {
        if (($Backend -and $apiReady) -or ($Frontend -and $feReady) `
            -or (-not $Backend -and -not $Frontend -and $apiReady -and $feReady)) {
            break
        }
    }
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
if (-not $Frontend -or $onlyBackend -or (-not $Backend -and -not $Frontend)) {
    Write-Host "Backend  -> http://localhost:$apiPort" -ForegroundColor Green
    Write-Host "          Health: http://localhost:$apiPort/health" -ForegroundColor Green
}
if (-not $Backend -or $onlyFrontend -or (-not $Backend -and -not $Frontend)) {
    Write-Host "Frontend -> http://localhost:$fePort" -ForegroundColor Green
}
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "De chay test (terminal khac):" -ForegroundColor Cyan
Write-Host "  pwsh backend/tests/integration/run-all.ps1" -ForegroundColor White
Write-Host "  cd frontend; npm run e2e" -ForegroundColor White
Write-Host ""
Write-Host "De stop: Get-Job | Stop-Job; Get-Job | Remove-Job" -ForegroundColor Yellow
