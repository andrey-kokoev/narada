param(
    [string]$ConfigPath = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) 'operator-surfaces\window-labels.json'),
    [string]$LogDir = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\logs\window-surface-overlay",
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\window-surface-overlay.pid"
)

$ErrorActionPreference = "Stop"

$localExe = Join-Path $PSScriptRoot "narada-window-surface-overlay.exe"
$sourceExe = Join-Path $PSScriptRoot "target\release\narada-window-surface-overlay.exe"
$exe = if (Test-Path $localExe) { $localExe } elseif (Test-Path $sourceExe) { $sourceExe } else { throw "Overlay executable not found." }

& $exe --config $ConfigPath --log-dir $LogDir --pid-file $PidFile stop