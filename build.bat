@echo off
echo ========================================
echo   BATTLY INSTALLER - BUILD SCRIPT
echo ========================================
echo.

echo [1/3] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo ERROR: No se pudieron instalar las dependencias
    pause
    exit /b 1
)

echo.
echo [2/3] Compilando para x64...
call npm run make:x64
if errorlevel 1 (
    echo ADVERTENCIA: La compilacion x64 fallo
)

echo.
echo [3/3] Compilando para ia32...
call npm run make:ia32
if errorlevel 1 (
    echo ADVERTENCIA: La compilacion ia32 fallo
)

echo.
echo ========================================
echo   COMPILACION COMPLETADA
echo ========================================
echo.
echo Los instaladores estan en: out\make\
echo.
pause
