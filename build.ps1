# Battly Installer - Build Script for PowerShell
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BATTLY INSTALLER - BUILD SCRIPT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Instalando dependencias..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudieron instalar las dependencias" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "[2/3] Compilando para x64..." -ForegroundColor Yellow
npm run make:x64
if ($LASTEXITCODE -ne 0) {
    Write-Host "ADVERTENCIA: La compilacion x64 fallo" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3/3] Compilando para ia32..." -ForegroundColor Yellow
npm run make:ia32
if ($LASTEXITCODE -ne 0) {
    Write-Host "ADVERTENCIA: La compilacion ia32 fallo" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  COMPILACION COMPLETADA" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Los instaladores estan en: out\make\" -ForegroundColor White
Write-Host ""
pause
