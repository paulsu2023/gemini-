param(
  [switch]$NoBrowser,
  [switch]$Quiet
)
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# 检查 3000 端口是否已有本项目的 node server.js 在运行
$existing = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'server\.js' }
if (-not $existing) {
  $nodeExe = (Get-Command node).Source
  if (-not $nodeExe -and (Test-Path 'C:\Program Files\nodejs\node.exe')) {
    $nodeExe = 'C:\Program Files\nodejs\node.exe'
  }
  if (-not $nodeExe) {
    Write-Host '未找到 Node.js，请先安装 Node.js >= 20' -ForegroundColor Red
    exit 1
  }
  Start-Process -FilePath $nodeExe -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $dataDir 'server.log') `
    -RedirectStandardError (Join-Path $dataDir 'server.err.log')
}

# 等待服务就绪（最多 10 秒）
$ready = $false
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Milliseconds 400
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/config' -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
}

if (-not $ready) {
  Write-Host '启动失败，请查看 data\server.err.log：' -ForegroundColor Red
  Get-Content (Join-Path $dataDir 'server.err.log') -Tail 20
  exit 1
}

if (-not $NoBrowser) {
  Start-Process 'http://localhost:3000'
}

if (-not $Quiet) {
  Write-Host ''
  Write-Host '✅ Gemini 体验已启动并后台常驻运行！' -ForegroundColor Green
  Write-Host '   体验地址：http://localhost:3000'
  Write-Host '   管理后台：http://localhost:3000/admin'
  Write-Host '   提示：关闭此窗口或关闭浏览器后，服务依然会在后台保持运行。'
}
