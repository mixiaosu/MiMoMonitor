# Tauri 环境检查
$required = @("cargo", "node", "npm")
foreach ($tool in $required) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    if (-not $cmd) {
        Write-Host "请安装 ${tool} 后重试" -ForegroundColor Red
        exit 1
    }
}
Set-Location -Path $PSScriptRoot\..
npm install --silent
npx tauri info
