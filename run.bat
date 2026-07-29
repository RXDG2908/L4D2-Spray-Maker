@echo off
rem Lanzador para desarrollo. Los usuarios finales usan el instalador .exe
rem publicado en https://github.com/RXDG2908/L4D2-Spray-Maker/releases
cd /d "%~dp0"

if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo.
        echo La instalacion fallo. Revisa el error de arriba.
        pause
        exit /b 1
    )
)

call npm run electron
pause
