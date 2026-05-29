#requires -Version 5.1
<#
.SYNOPSIS
  Launch the Narada dump/WER collector in an elevated PowerShell process.

.DESCRIPTION
  This launcher performs no privileged work itself. It prompts via UAC using
  Start-Process -Verb RunAs and runs Invoke-NaradaElevatedDumpDiagnostics.ps1,
  which writes a JSON evidence packet under the PC Site.
#>
[CmdletBinding()]
param(
  [string]$CollectorPath,
  [string]$OutputDirectory = 'C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\evidence\elevated-diagnostics',
  [int]$Hours = 24
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($CollectorPath)) {
  $CollectorPath = Join-Path $PSScriptRoot 'Invoke-NaradaElevatedDumpDiagnostics.ps1'
}

if (-not (Test-Path -LiteralPath $CollectorPath)) {
  throw "Collector script not found: $CollectorPath"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$transcriptPath = Join-Path $OutputDirectory ('elevated-launch-{0:yyyyMMdd-HHmmss}.log' -f (Get-Date))
$command = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', ('"{0}"' -f $CollectorPath),
  '-OutputDirectory', ('"{0}"' -f $OutputDirectory),
  '-Hours', $Hours
) -join ' '

$process = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $command -PassThru -WindowStyle Normal
$launchRecord = [pscustomobject]@{
  Schema = 'narada.pc.elevated_dump_diagnostics.launch.v1'
  LaunchedAt = Get-Date
  CollectorPath = $CollectorPath
  OutputDirectory = $OutputDirectory
  Hours = $Hours
  ProcessId = $process.Id
  Note = 'UAC prompt accepted by operator if elevated collector runs.'
}
$launchRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $transcriptPath -Encoding UTF8
Write-Output $transcriptPath
