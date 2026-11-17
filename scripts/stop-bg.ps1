$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'server\.js') -or ($_.Name -eq 'cloudflared.exe')
}
foreach ($p in $procs) {
  Stop-Process -Id $p.ProcessId -Force
}
Write-Host '✅ 已停止 Gemini 体验后台服务与外网隧道。' -ForegroundColor Yellow
