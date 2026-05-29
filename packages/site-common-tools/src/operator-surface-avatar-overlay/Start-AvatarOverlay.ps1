param(
    [string]$RuntimePath = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) 'operator-surfaces\avatar-overlay-runtime.json'),
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PidFile = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime\operator-surface-avatar-overlay.pid"
)

$ErrorActionPreference = "Stop"

$project = Join-Path $PSScriptRoot "operator-surface-avatar-overlay.csproj"
if (-not (Test-Path -LiteralPath $project -PathType Leaf)) {
    throw "Avatar overlay project not found: $project"
}

if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    $stalePid = [string](Get-Content -LiteralPath $PidFile -Raw).Trim()
    $running = if ($stalePid) { Get-Process -Id $stalePid -ErrorAction SilentlyContinue } else { $null }
    if ($running) {
        Stop-Process -Id $running.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 300
    } else {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
}

Start-Process -WindowStyle Hidden -FilePath "dotnet" -ArgumentList @(
    "run",
    "--project", $project,
    "--",
    "--runtime", $RuntimePath,
    "--pid-file", $PidFile,
    "--user-site-root", $UserSiteRoot,
    "run"
)

Start-Sleep -Milliseconds 750
if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    $pidText = [string](Get-Content -LiteralPath $PidFile -Raw).Trim()
    Write-Host "pid $pidText"
} else {
    Write-Host "starting"
}
