@echo off
title Aurora Gemini Provider
cd /d "%~dp0"
echo Iniciando Aurora Gemini Provider en http://127.0.0.1:54800 ...
node scripts/provider.mjs 54800
pause
