@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 Gemini 体验 (http://localhost:3000) ...
start "" http://localhost:3000
node server.js
pause
