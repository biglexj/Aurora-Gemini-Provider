@echo off
title Aurora Gemini Provider
rem Lanzador de doble clic para Windows. Delega en Mise ("mise dev") y usa Node.js
rem como respaldo cuando Mise no esta disponible. Ver README.md, seccion Ejecucion en Windows.
cd /d "%~dp0"
where mise >nul 2>nul
if %errorlevel%==0 (
  mise dev
) else (
  echo Mise no esta disponible; se inicia el servidor con Node.js.
  node scripts/provider.mjs
)
pause
