@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-bg.ps1" -NoBrowser
if errorlevel 1 ( pause & exit /b 1 )
echo Starting Cloudflare HTTP2 Tunnel...
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
  "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --protocol http2 --url http://localhost:3000 --no-autoupdate
) else (
  cloudflared tunnel --protocol http2 --url http://localhost:3000 --no-autoupdate
)
pause
