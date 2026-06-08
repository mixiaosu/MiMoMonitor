# setup-rust-d: 安装 Rust 并确保在后续命令中可用
$host_dir = $env:TEMP + "\tauri-env"
$env_bat = $host_dir + "\env.bat"
if (-not (Test-Path $host_dir)) { New-Item -ItemType Directory -Path $host_dir -Force | Out-Null }

$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargo) {
    Write-Host "Installing Rust..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$host_dir\rustup-init.exe"
    & "$host_dir\rustup-init.exe" -y --default-toolchain stable --profile minimal
    $env_path = "$env:USERPROFILE\.cargo\bin"
    $env:PATH = "$env_path;$env:PATH"
}

$env_vars = @(
    "set RUSTUP_HOME=$env:RUSTUP_HOME",
    "set CARGO_HOME=$env:CARGO_HOME",
    "set PATH=$env:CARGO_HOME\bin;$env:PATH"
)
$env_vars -join "`r`n" | Out-File -FilePath $env_bat -Encoding utf8 -Force

Write-Host "$env_bat" -NoNewline
