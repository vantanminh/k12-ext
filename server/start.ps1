$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $sourcePackage = Test-Path -LiteralPath (Join-Path $PSScriptRoot 'Cargo.toml')
    $exeRelativePath = if ($sourcePackage) { 'target\release\k12-ai-server.exe' } else { 'k12-ai-server.exe' }
    $k12ServerExe = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $exeRelativePath))
    # Cargo checks timestamps and only recompiles changed sources. A previously
    # built executable must not silently win over newer Rust code.
    $running = Get-CimInstance Win32_Process -Filter "Name='k12-ai-server.exe'" |
        Where-Object { $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $k12ServerExe }
    foreach ($process in $running) {
        Stop-Process -Id $process.ProcessId -ErrorAction Stop
    }
    if ($sourcePackage) {
        cargo build --release
        if ($LASTEXITCODE -ne 0) { throw 'Failed to build the Rust server.' }
    }
    if (-not (Test-Path -LiteralPath $k12ServerExe)) { throw 'Rust server executable was not found.' }
    & $k12ServerExe
} finally { Pop-Location }
