param(
    [string]$PcSiteRoot = "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2"
)

$ErrorActionPreference = "Stop"

$targetDir = Join-Path $PcSiteRoot "tools\osl-webview2-panel-host"
$publishDir = Join-Path $targetDir "app"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
New-Item -ItemType Directory -Force -Path $publishDir | Out-Null

foreach ($file in @(
    "osl-webview2-panel-host.csproj",
    "Program.cs",
    "Start-OslPanelHost.ps1",
    "Stop-OslPanelHost.ps1",
    "Inspect-OslPanelHost.ps1"
)) {
    Copy-Item -Force -Path (Join-Path $PSScriptRoot $file) -Destination $targetDir
}

$project = Join-Path $PSScriptRoot "osl-webview2-panel-host.csproj"
dotnet publish $project -c Release -o $publishDir --nologo --verbosity quiet -p:WarningLevel=0 | Out-Null

Write-Host "Installed OSL WebView2 panel host to $publishDir"
