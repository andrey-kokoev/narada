param(
    [ValidateSet("wsl-bash-from-windows")]
    [string]$Embodiment = "wsl-bash-from-windows",

    [ValidateSet("pwd", "list", "git_status", "narada_inbox_doctor", "narada_task_read")]
    [string]$CommandId = "pwd",

    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$Cwd = "/home/andrey",
    [int]$TaskNumber = 0,
    [int]$TimeoutSeconds = 5,
    [int]$OutputLimitBytes = 4096,
    [switch]$DryRun,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

throw "ee_mcp_retired_not_admitted: delegated CLI embodiment not loadable / missing EE-MCP capability"

function ConvertFrom-NaradaJson {
    param([string]$Json)
    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Json | ConvertFrom-Json -Depth 100 }
    return $Json | ConvertFrom-Json
}

function ConvertTo-NaradaJson {
    param($Value)
    $command = Get-Command ConvertTo-Json
    if ($command.Parameters.ContainsKey("Depth")) { return $Value | ConvertTo-Json -Depth 100 }
    return $Value | ConvertTo-Json
}

function Write-NaradaJsonFile {
    param([string]$Path, [object]$Value)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    [System.IO.File]::WriteAllText($Path, (ConvertTo-NaradaJson $Value) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Quote-BashSingle {
    param([string]$Value)
    "'" + ($Value -replace "'", "'\''") + "'"
}

function Quote-WindowsArgument {
    param([string]$Value)
    if ($Value -notmatch '[\s"]') { return $Value }
    '"' + ($Value -replace '\\(?=\\*")', '$0$0' -replace '"', '\"') + '"'
}

function Normalize-WslPath {
    param([string]$Path)
    $normalized = ($Path -replace '\\', '/').Trim()
    while ($normalized.Length -gt 1 -and $normalized.EndsWith("/")) {
        $normalized = $normalized.Substring(0, $normalized.Length - 1)
    }
    return $normalized
}

function Test-WslPathUnderPrefix {
    param(
        [string]$Path,
        [string]$Prefix
    )

    $normalizedPath = Normalize-WslPath $Path
    $normalizedPrefix = Normalize-WslPath $Prefix
    return (
        $normalizedPath -eq $normalizedPrefix -or
        $normalizedPath.StartsWith($normalizedPrefix + "/", [System.StringComparison]::Ordinal)
    )
}

function Convert-WindowsPathToWslPath {
    param([string]$Path)
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ($resolved -match '^([A-Za-z]):\\(.*)$') {
        $drive = $Matches[1].ToLowerInvariant()
        $rest = ($Matches[2] -replace '\\', '/')
        return "/mnt/$drive/$rest"
    }
    throw "windows_path_cannot_be_converted_to_wsl: $Path"
}

$surfaceMapPath = Join-Path $UserSiteRoot "operator-surfaces\typed-mcp-surfaces.json"
if (-not (Test-Path -LiteralPath $surfaceMapPath)) { throw "typed_mcp_surface_map_missing: $surfaceMapPath" }
$surfaceMap = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($surfaceMapPath))
$surface = @($surfaceMap.surfaces | Where-Object { $_.surface_id -eq "ee-mcp.wsl-bash-from-windows" }) | Select-Object -First 1
if (-not $surface) { throw "typed_mcp_surface_missing: ee-mcp.wsl-bash-from-windows" }
$configPath = Join-Path $UserSiteRoot "config.json"
$config = if (Test-Path -LiteralPath $configPath) { ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($configPath)) } else { $null }

$limits = $surface.limits
$maxTimeout = [int]$limits.max_timeout_seconds
$maxOutput = [int]$limits.max_output_bytes
if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt $maxTimeout) { throw "timeout_out_of_bounds: max $maxTimeout seconds" }
if ($OutputLimitBytes -lt 128 -or $OutputLimitBytes -gt $maxOutput) { throw "output_limit_out_of_bounds: max $maxOutput bytes" }

$allowedPrefix = $false
foreach ($prefix in @($limits.allowed_cwd_prefixes)) {
    if (Test-WslPathUnderPrefix -Path $Cwd -Prefix ([string]$prefix)) { $allowedPrefix = $true }
}
if (-not $allowedPrefix) { throw "cwd_refused_by_ee_mcp_policy: $Cwd" }

$commandMap = @{
    pwd = "pwd"
    list = "ls -la"
    git_status = "git status --short"
}
if ($CommandId -like "narada_*") {
    $wslCliRoot = [string]$config.narada_cli.wsl.authority_entrypoint
    if ([string]::IsNullOrWhiteSpace($wslCliRoot)) {
        throw "ee_mcp_missing_narada_wsl_cli: delegated CLI embodiment not loadable / missing EE-MCP capability"
    }
    $siteRootWsl = Convert-WindowsPathToWslPath -Path $UserSiteRoot
    $naradaPrefix = "cd {0} && narada" -f (Quote-BashSingle $wslCliRoot)
    $commandMap.narada_inbox_doctor = "$naradaPrefix inbox doctor --cwd $(Quote-BashSingle $siteRootWsl) --format json"
    if ($CommandId -eq "narada_task_read" -and $TaskNumber -lt 1) {
        throw "task_number_required_for_narada_task_read"
    }
    if ($TaskNumber -gt 0) {
        $commandMap.narada_task_read = "$naradaPrefix task read $TaskNumber --cwd $(Quote-BashSingle $siteRootWsl) --format json"
    }
}
$bashCommand = "cd {0} && {1}" -f (Quote-BashSingle $Cwd), $commandMap[$CommandId]
$runId = "ee_mcp_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"), ([Guid]::NewGuid().ToString("N").Substring(0, 8))
$evidenceDir = Join-Path $UserSiteRoot ([string]$surface.evidence_path)
$evidencePath = Join-Path $evidenceDir ($runId + ".json")

$result = [ordered]@{
    schema = "narada.typed_mcp.ee_mcp.prototype_event.v0"
    run_id = $runId
    occurred_at = (Get-Date -Format "o")
    surface_id = "ee-mcp.wsl-bash-from-windows"
    surface_type = "EE-MCP"
    dry_run = [bool]$DryRun
    embodiment = $Embodiment
    command_id = $CommandId
    task_number = if ($TaskNumber -gt 0) { $TaskNumber } else { $null }
    cwd = $Cwd
    timeout_seconds = $TimeoutSeconds
    output_limit_bytes = $OutputLimitBytes
    mutation_posture = "read_only"
    authority_boundary = $surface.authority_boundary
    command = "wsl -d Ubuntu-24.04 -- bash -lc <allowlisted:$CommandId>"
    status = "planned"
    exit_code = $null
    timed_out = $false
    stdout = ""
    stderr = ""
    evidence_path = $evidencePath
}

if ($DryRun) {
    $result.status = "dry_run"
    Write-NaradaJsonFile -Path $evidencePath -Value $result
    if ($PassThru) { ConvertTo-NaradaJson $result } else { Write-Host "EE-MCP dry-run ok. Evidence: $evidencePath" }
    return
}

try {
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = "wsl.exe"
    $psi.Arguments = (@("-d", "Ubuntu-24.04", "--", "bash", "-lc", $bashCommand) | ForEach-Object { Quote-WindowsArgument $_ }) -join " "
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $process = [System.Diagnostics.Process]::Start($psi)
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        $process.Kill()
        $result.timed_out = $true
        $result.status = "timeout"
        $result.exit_code = -1
    } else {
        $result.exit_code = $process.ExitCode
        $result.status = if ($process.ExitCode -eq 0) { "completed" } else { "failed" }
    }
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $result.stdout = if ([Text.Encoding]::UTF8.GetByteCount($stdout) -gt $OutputLimitBytes) { $stdout.Substring(0, [Math]::Min($stdout.Length, $OutputLimitBytes)) } else { $stdout }
    $result.stderr = if ([Text.Encoding]::UTF8.GetByteCount($stderr) -gt $OutputLimitBytes) { $stderr.Substring(0, [Math]::Min($stderr.Length, $OutputLimitBytes)) } else { $stderr }
} finally {}

Write-NaradaJsonFile -Path $evidencePath -Value $result
if ($result.exit_code -ne 0) {
    if ($PassThru) { ConvertTo-NaradaJson $result }
    throw "ee_mcp_execution_failed: $($result.stderr)"
}
if ($PassThru) { ConvertTo-NaradaJson $result } else { Write-Host "EE-MCP completed $CommandId. Evidence: $evidencePath" }
