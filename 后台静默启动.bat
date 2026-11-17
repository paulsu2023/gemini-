@echo off
chcp 65001 >nul
title Gemini 体验 - 永久后台常驻启动器
cd /d "%~dp0"
if not exist "data" mkdir "data"

echo 正在清理旧进程并启动独立后台服务（关闭浏览器或重启 Antigravity 都不会中断）...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dir = (Get-Location).Path; " ^
  "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'server\.js') -or ($_.Name -eq 'cloudflared.exe') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; " ^
  "Start-Sleep -Milliseconds 400; " ^
  "$nodePath = (Get-Command node).Source; " ^
  "Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $dir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dir 'data\server.log') -RedirectStandardError (Join-Path $dir 'data\server.err.log'); " ^
  "Start-Sleep -Seconds 2; " ^
  "$cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'; " ^
  "if (-not (Test-Path $cf)) { $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }; " ^
  "if ($cf) { Start-Process -FilePath $cf -ArgumentList 'tunnel','--protocol','http2','--url','http://localhost:3000','--no-autoupdate' -WorkingDirectory $dir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dir 'data\tunnel.log') -RedirectStandardError (Join-Path $dir 'data\tunnel.err.log') }; " ^
  "for ($i=0; $i -lt 20; $i++) { " ^
  "  Start-Sleep -Milliseconds 600; " ^
  "  $txt = (Get-Content (Join-Path $dir 'data\tunnel.err.log'),(Join-Path $dir 'data\tunnel.log') -Raw -ErrorAction SilentlyContinue); " ^
  "  if ($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') { Write-Host ('TUNNEL_URL=' + $Matches[0]); break } " ^
  "}"

echo.
echo ✅ 本地服务已后台常驻运行：http://localhost:3000
echo    管理后台（本地免密）：http://localhost:3000/admin
echo    现在可以放心关闭本窗口、关闭浏览器，都不会再断线！
pause
