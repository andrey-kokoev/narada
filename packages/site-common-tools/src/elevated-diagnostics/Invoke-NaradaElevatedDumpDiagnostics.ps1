#requires -Version 5.1
<#
.SYNOPSIS
  Elevated, read-only dump/WER collector for Narada PC diagnostics.

.DESCRIPTION
  This script is intended to run from an elevated PowerShell process launched by
  Start-NaradaElevatedDumpDiagnostics.ps1. It reads protected Windows diagnostic
  locations, runs bounded debugger analysis on recent dumps when cdb.exe is
  available, and writes a JSON evidence packet. It does not change display,
  driver, registry, service, or reboot state.
#>
[CmdletBinding()]
param(
  [string]$OutputDirectory = 'C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\evidence\elevated-diagnostics',
  [string]$MirrorOutputDirectory = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) '.ai\tmp\elevated-diagnostics'),
  [int]$Hours = 24,
  [int]$DumpAnalysisLimit = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function ConvertTo-ShortText {
  param(
    [AllowNull()][string]$Text,
    [int]$Limit = 4000
  )
  if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
  $clean = $Text -replace '\s+', ' '
  if ($clean.Length -le $Limit) { return $clean }
  return $clean.Substring(0, $Limit)
}

function Get-FileHashSafe {
  param([string]$Path)
  try { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path -ErrorAction Stop).Hash } catch { return $null }
}

function Get-ChildItemSafe {
  param(
    [string]$Path,
    [switch]$Recurse,
    [int]$Limit = 200
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{ Path = $Path; Exists = $false; Error = $null; Items = @() }
  }

  try {
    $items = Get-ChildItem -LiteralPath $Path -Force -Recurse:$Recurse -ErrorAction Stop |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First $Limit |
      ForEach-Object {
        [pscustomobject]@{
          FullName = $_.FullName
          Name = $_.Name
          Length = if ($_.PSIsContainer) { $null } else { $_.Length }
          LastWriteTime = $_.LastWriteTime
          Attributes = [string]$_.Attributes
          Sha256 = if ($_.PSIsContainer) { $null } else { Get-FileHashSafe -Path $_.FullName }
        }
      }
    return [pscustomobject]@{ Path = $Path; Exists = $true; Error = $null; Items = @($items) }
  } catch {
    return [pscustomobject]@{ Path = $Path; Exists = $true; Error = $_.Exception.Message; Items = @() }
  }
}

function Read-WerMetadata {
  param([string]$Root)
  if (-not (Test-Path -LiteralPath $Root)) { return @() }

  $dirs = Get-ChildItem -LiteralPath $Root -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'Kernel_*' -or $_.Name -like 'Critical_*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 80

  $reports = foreach ($dir in $dirs) {
    $files = Get-ChildItem -LiteralPath $dir.FullName -File -Force -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
    $metadataFiles = $files | Where-Object { $_.Extension -in '.wer', '.txt', '.xml', '.csv' } | Select-Object -First 8
    $metadata = foreach ($file in $metadataFiles) {
      $text = $null
      try { $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop } catch { $text = $_.Exception.Message }
      [pscustomobject]@{
        FullName = $file.FullName
        Length = $file.Length
        LastWriteTime = $file.LastWriteTime
        Sha256 = Get-FileHashSafe -Path $file.FullName
        TextPrefix = ConvertTo-ShortText -Text $text -Limit 2500
      }
    }

    [pscustomobject]@{
      Directory = $dir.FullName
      LastWriteTime = $dir.LastWriteTime
      Files = @($files | Select-Object Name, FullName, Length, LastWriteTime)
      Metadata = @($metadata)
    }
  }
  return @($reports)
}

function Get-Events {
  param([datetime]$StartTime)
  $events = @()
  foreach ($log in @('System', 'Application', 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational', 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational')) {
    try {
      $events += Get-WinEvent -FilterHashtable @{ LogName = $log; StartTime = $StartTime } -MaxEvents 1000 -ErrorAction Stop |
        Where-Object {
          $_.ProviderName -match 'WHEA|Kernel-Power|Windows Error Reporting|Display|nvlddmkm|amdkmdag|igfx' -or
          $_.Message -match 'WindowsBlackScreenDiagnosticsV1|LiveKernelEvent|WATCHDOG|display|graphics|video|TDR|hardware error|RDP|DWM' -or
          $_.LogName -like '*TerminalServices*'
        } |
        Sort-Object TimeCreated |
        ForEach-Object {
          [pscustomobject]@{
            Log = $_.LogName
            TimeCreated = $_.TimeCreated
            Id = $_.Id
            Level = $_.LevelDisplayName
            Provider = $_.ProviderName
            Message = ConvertTo-ShortText -Text $_.Message -Limit 1600
          }
        }
    } catch {
      $events += [pscustomobject]@{ Log = $log; Error = $_.Exception.Message }
    }
  }
  return @($events | Sort-Object TimeCreated)
}

function Find-DebugTools {
  $tools = [System.Collections.Generic.List[object]]::new()
  foreach ($name in @('WinDbgX.exe', 'cdb.exe', 'kd.exe', 'dbgsrv.exe', 'dumpchk.exe')) {
    $found = Get-Command $name -ErrorAction SilentlyContinue
    if ($found) {
      $tools.Add([pscustomobject]@{ Name = $name; Source = $found.Source; Origin = 'PATH' })
    }
  }

  $pkg = Get-AppxPackage Microsoft.WinDbg -ErrorAction SilentlyContinue
  if ($pkg -and $pkg.InstallLocation) {
    foreach ($relative in @('DbgX.Shell.exe', 'amd64\cdb.exe', 'amd64\kd.exe', 'amd64\dbgsrv.exe', 'amd64\ntsd.exe')) {
      $candidate = Join-Path $pkg.InstallLocation $relative
      if (Test-Path -LiteralPath $candidate) {
        $tools.Add([pscustomobject]@{ Name = Split-Path -Leaf $candidate; Source = $candidate; Origin = 'Microsoft.WinDbg AppX' })
      }
    }
  }

  return @($tools.ToArray())
}

function Invoke-DumpAnalysis {
  param(
    [string]$DebuggerPath,
    [string[]]$DumpRoots = @('C:\Windows\LiveKernelReports', 'C:\ProgramData\Microsoft\Windows\WER\ReportQueue', 'C:\ProgramData\Microsoft\Windows\WER\ReportArchive'),
    [int]$Limit = 5
  )

  if ([string]::IsNullOrWhiteSpace($DebuggerPath) -or -not (Test-Path -LiteralPath $DebuggerPath)) {
    return @([pscustomobject]@{ Error = 'cdb.exe not found'; DebuggerPath = $DebuggerPath })
  }

  $dumps = foreach ($root in $DumpRoots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.dmp' -ErrorAction SilentlyContinue
    }
  }
  $dumps = @($dumps | Sort-Object LastWriteTime -Descending | Select-Object -First $Limit)
  if ($dumps.Count -eq 0) {
    return @([pscustomobject]@{ Error = 'no dump files found'; DumpRoots = $DumpRoots; DebuggerPath = $DebuggerPath })
  }

  $results = foreach ($dump in $dumps) {
    $stdoutPath = Join-Path $env:TEMP ('narada-cdb-{0}.out.txt' -f ([guid]::NewGuid().ToString('N')))
    $stderrPath = Join-Path $env:TEMP ('narada-cdb-{0}.err.txt' -f ([guid]::NewGuid().ToString('N')))
    $escapedDump = $dump.FullName.Replace('"', '\"')
    $argLine = '-z "{0}" -c "!analyze -v; q"' -f $escapedDump
    try {
      $process = Start-Process -FilePath $DebuggerPath -ArgumentList $argLine -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -ErrorAction Stop
      $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw -ErrorAction SilentlyContinue } else { '' }
      $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue } else { '' }
      [pscustomobject]@{
        Dump = $dump.FullName
        LastWriteTime = $dump.LastWriteTime
        Length = $dump.Length
        Sha256 = Get-FileHashSafe -Path $dump.FullName
        Debugger = $DebuggerPath
        ExitCode = $process.ExitCode
        StdoutPrefix = ConvertTo-ShortText -Text $stdout -Limit 12000
        StderrPrefix = ConvertTo-ShortText -Text $stderr -Limit 4000
      }
    } catch {
      [pscustomobject]@{
        Dump = $dump.FullName
        LastWriteTime = $dump.LastWriteTime
        Length = $dump.Length
        Sha256 = Get-FileHashSafe -Path $dump.FullName
        Debugger = $DebuggerPath
        Error = $_.Exception.Message
      }
    } finally {
      Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
  }

  return @($results)
}

if (-not (Test-IsAdministrator)) {
  throw 'This collector must be run from an elevated PowerShell process.'
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$startedAt = Get-Date
$startTime = $startedAt.AddHours(-1 * [Math]::Abs($Hours))
$outputPath = Join-Path $OutputDirectory ('dump-diagnostics-{0:yyyyMMdd-HHmmss}.json' -f $startedAt)
$debugTools = @(Find-DebugTools)
$cdb = $debugTools | Where-Object { $_.Name -ieq 'cdb.exe' -and $_.Source -match '\amd64\cdb\.exe$' } | Select-Object -First 1
if (-not $cdb) { $cdb = $debugTools | Where-Object { $_.Name -ieq 'cdb.exe' } | Select-Object -First 1 }
$dumpAnalyses = if ($cdb) { @(Invoke-DumpAnalysis -DebuggerPath $cdb.Source -Limit $DumpAnalysisLimit) } else { @([pscustomobject]@{ Error = 'cdb.exe not found'; DebugTools = $debugTools }) }

$packet = [pscustomobject]@{
  Schema = 'narada.pc.elevated_dump_diagnostics.v2'
  CollectedAt = $startedAt
  Hostname = $env:COMPUTERNAME
  User = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  IsAdministrator = Test-IsAdministrator
  Scope = [pscustomobject]@{
    ReadOnly = $true
    Hours = $Hours
    DumpAnalysisLimit = $DumpAnalysisLimit
    OutputPath = $outputPath
    MirrorOutputDirectory = $MirrorOutputDirectory
    NoRepairActions = $true
  }
  VideoControllers = @(Get-CimInstance Win32_VideoController | Select-Object Name, PNPDeviceID, DriverVersion, DriverDate, Status, AdapterCompatibility, VideoProcessor)
  DesktopMonitors = @(Get-CimInstance Win32_DesktopMonitor | Select-Object Name, PNPDeviceID, Status)
  OperatingSystem = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, LastBootUpTime
  DebugTools = $debugTools
  DumpAnalyses = $dumpAnalyses
  ProtectedLocations = @(
    Get-ChildItemSafe -Path 'C:\Windows\LiveKernelReports' -Recurse -Limit 200
    Get-ChildItemSafe -Path 'C:\Windows\SystemTemp' -Recurse -Limit 120
    Get-ChildItemSafe -Path 'C:\ProgramData\Microsoft\Windows\WER\ReportQueue' -Recurse -Limit 200
    Get-ChildItemSafe -Path 'C:\ProgramData\Microsoft\Windows\WER\ReportArchive' -Recurse -Limit 200
  )
  WerReports = @(
    Read-WerMetadata -Root 'C:\ProgramData\Microsoft\Windows\WER\ReportQueue'
    Read-WerMetadata -Root 'C:\ProgramData\Microsoft\Windows\WER\ReportArchive'
  )
  Events = Get-Events -StartTime $startTime
}

$json = $packet | ConvertTo-Json -Depth 8
$json | Set-Content -LiteralPath $outputPath -Encoding UTF8
if (-not [string]::IsNullOrWhiteSpace($MirrorOutputDirectory)) {
  New-Item -ItemType Directory -Force -Path $MirrorOutputDirectory | Out-Null
  $mirrorPath = Join-Path $MirrorOutputDirectory (Split-Path -Leaf $outputPath)
  $json | Set-Content -LiteralPath $mirrorPath -Encoding UTF8
}
Write-Output $outputPath
