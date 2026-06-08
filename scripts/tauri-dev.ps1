# Tauri 环境初始化 & 开发启动
$host_dir = $env:TEMP + "\tauri-env"
$env_bat = $host_dir + "\env.bat"
if (-not (Test-Path $host_dir)) { New-Item -ItemType Directory -Path $host_dir -Force | Out-Null }

$required_tools = @("cargo", "node", "npm")
$install_instructions = @()

foreach ($tool in $required_tools) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    if (-not $cmd) {
        $install_instructions += "请安装 ${tool}"
    }
}

if ($install_instructions.Count -gt 0) {
    Write-Host "缺少依赖：" -ForegroundColor Red
    $install_instructions | ForEach-Object { Write-Host $_ }
    exit 1
}

# Rust 版本检查
$rust_version = (cargo --version) -match '(\d+\.\d+\.\d+)'
if ($Matches[1] -lt "1.77.2") {
    Write-Host "需要安装 Rust 1.77.2+，当前版本 $($Matches[1])" -ForegroundColor Red
    exit 1
}

# env.bat: 写入当前环境变量
$env_vars = @(
    "set RUSTUP_HOME=$env:RUSTUP_HOME",
    "set CARGO_HOME=$env:CARGO_HOME",
    "set PATH=$env:CARGO_HOME\bin;$env:PATH"
)
$env_vars -join "`r`n" | Out-File -FilePath $env_bat -Encoding utf8 -Force

# 安装前端依赖
Set-Location -Path $PSScriptRoot\..
npm install
npm run tauri dev
