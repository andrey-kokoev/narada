[CmdletBinding()]
param(
  [string]$SiteRoot = "D:\code\narada",
  [string]$ShortcutPath = "D:\code\narada\.crew\agent-shortcuts\Narada Architect (codex).lnk",
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

$resolvedSiteRoot = (Resolve-Path -LiteralPath $SiteRoot).Path
$scriptPath = Join-Path $resolvedSiteRoot "tools\operator-surface-carriers\windows-glue\Start-NaradaArchitect.ps1"
$shortcutDir = Split-Path -Parent $ShortcutPath
$expectedTarget = (Get-Command powershell.exe -ErrorAction Stop).Source
$expectedArguments = "-NoExit -ExecutionPolicy Bypass -File `"$scriptPath`""

if (-not (Test-Path -LiteralPath $scriptPath)) { throw "launch_carrier_missing:$scriptPath" }
if (-not (Test-Path -LiteralPath $shortcutDir)) {
  if ($VerifyOnly) { throw "shortcut_dir_missing:$shortcutDir" }
  New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
}

$shell = New-Object -ComObject WScript.Shell

if (-not $VerifyOnly) {
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $expectedTarget
  $shortcut.Arguments = $expectedArguments
  $shortcut.WorkingDirectory = $resolvedSiteRoot
  $shortcut.Description = "Launch Narada architect Codex session through Narada proper crew launch intent sequence"
  $shortcut.IconLocation = "$expectedTarget,0"
  $shortcut.Save()
}

if (-not (Test-Path -LiteralPath $ShortcutPath)) { throw "shortcut_missing:$ShortcutPath" }
$readback = $shell.CreateShortcut($ShortcutPath)
$result = [ordered]@{
  schema = "narada.crew_startup_shortcut.windows_shortcut_materialization.v0"
  status = "verified"
  shortcut_path = $ShortcutPath
  target_path = $readback.TargetPath
  arguments = $readback.Arguments
  working_directory = $readback.WorkingDirectory
  expected_target_path = $expectedTarget
  expected_arguments = $expectedArguments
  execution_admitted = $true
  creates_windows_lnk = $true
  placed_on_desktop = $false
  placed_in_start_menu = $false
  copies_operator_surface_runtime = $false
  imports_source_site_state = $false
  native_shell_fallback_allowed = $false
}

if ($readback.TargetPath -ne $expectedTarget) { throw "shortcut_target_mismatch:$($readback.TargetPath)" }
if ($readback.Arguments -ne $expectedArguments) { throw "shortcut_arguments_mismatch:$($readback.Arguments)" }
if ($readback.WorkingDirectory -ne $resolvedSiteRoot) { throw "shortcut_working_directory_mismatch:$($readback.WorkingDirectory)" }

$result | ConvertTo-Json -Depth 8
