@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-bg.ps1"
timeout /t 2 /nobreak >nul
