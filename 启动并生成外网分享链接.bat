@echo off
chcp 65001 >nul
title Gemini 体验工作台 - 外网分享模式 (国内朋友免翻墙直连)
cd /d "%~dp0"

echo ========================================================
echo   ✦ Gemini 体验工作台 · 一键启动并生成国内直连分享网址
echo ========================================================
echo.

REM 1. 检查 Node 服务是否已在 3000 端口运行，未运行则后台启动
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [1/2] 正在后台启动本地 Vertex AI 服务 ^(http://localhost:3000^)...
    start "Gemini-Server" /min cmd /c "node server.js"
    timeout /t 3 /nobreak >nul
) else (
    echo [1/2] 检测到本地服务已在 http://localhost:3000 运行中。
)

echo [2/2] 正在建立 Cloudflare 全球边缘加密隧道 ^(国内免代理直连^)...
echo       请在下方日志中复制形如 https://xxxx-xxxx.trycloudflare.com 的网址发给朋友！
echo       ^(按 Ctrl+C 或关闭此窗口即可随时停止外网分享^)
echo ========================================================
echo.

if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000 --no-autoupdate
) else (
    cloudflared tunnel --url http://localhost:3000 --no-autoupdate
)
pause
