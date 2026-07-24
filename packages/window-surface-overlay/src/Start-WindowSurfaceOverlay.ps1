param(
    [string]$ConfigPath = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) 'operator-surfaces\window-labels.json'),
    [string]$LogDir = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\logs\window-surface-overlay",
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\window-surface-overlay.pid"
)

$ErrorActionPreference = "Stop"

$localExe = Join-Path $PSScriptRoot "narada-window-surface-overlay.exe"
$sourceExe = Join-Path $PSScriptRoot "target\release\narada-window-surface-overlay.exe"
$exe = if (Test-Path $localExe) { $localExe } elseif (Test-Path $sourceExe) { $sourceExe } else { throw "Overlay executable not found. Run cargo build --release first." }

Get-CimInstance Win32_Process |
    Where-Object { $_.Name -like "AutoHotkey*" -and $_.CommandLine -like "*window-labels*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path $PidFile) {
    $stalePid = Get-Content $PidFile -Raw
    $running = Get-Process -Id $stalePid -ErrorAction SilentlyContinue
    if ($running) {
        try {
            & $exe --config $ConfigPath --log-dir $LogDir --pid-file $PidFile stop *> $null
        } catch {
            Write-Warning "stop command failed for pid $stalePid; proceeding with start"
        }
    } else {
        Remove-Item $PidFile -Force
        Write-Host "Removed stale PID file (pid $stalePid not running)"
    }
}

Start-Process -WindowStyle Hidden -FilePath $exe -ArgumentList @(
    "--config", $ConfigPath,
    "--log-dir", $LogDir,
    "--pid-file", $PidFile,
    "run"
)

Start-Sleep -Milliseconds 500
& $exe --config $ConfigPath --log-dir $LogDir --pid-file $PidFile status