param(
    [Parameter(Mandatory = $true)][string]$ActionId,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$SpecPath,
    [Parameter(Mandatory = $true)][string]$StatePath
)
$ErrorActionPreference = 'Stop'

function Write-ActionState([string]$status, [hashtable]$extra = @{}) {
    $state = [ordered]@{
        schema = 'narada.window_surface_overlay.action_state.v1'
        action_id = $ActionId
        request_id = $RequestId
        status = $status
        started_at = $script:StartedAt
        pid = $PID
    }
    foreach ($key in $extra.Keys) { $state[$key] = $extra[$key] }
    $temporary = $StatePath + '.' + $PID + '.tmp'
    $state | ConvertTo-Json -Depth 8 | Set-Content -Path $temporary -Encoding UTF8
    Move-Item -Path $temporary -Destination $StatePath -Force
}

function Bounded-Detail([string]$value) {
    $normalized = ($value -replace '\s+', ' ').Trim()
    if ($normalized.Length -le 800) { return $normalized }
    return $normalized.Substring(0, 800)
}

$script:StartedAt = [DateTime]::UtcNow.ToString('o')
try {
    $spec = Get-Content -Raw -Path $SpecPath | ConvertFrom-Json
    $command = @($spec.command) | ForEach-Object { [string]$_ }
    if ($command.Count -lt 1 -or [string]::IsNullOrWhiteSpace($command[0])) { throw 'overlay_action_command_invalid' }
    Write-ActionState 'running'

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $command[0]
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    if ($spec.working_directory) { $startInfo.WorkingDirectory = [string]$spec.working_directory }
    foreach ($argument in @($command | Select-Object -Skip 1)) { [void]$startInfo.ArgumentList.Add($argument) }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw 'overlay_action_process_start_failed' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
        $detail = Bounded-Detail ($(if ($stderr) { $stderr } else { $stdout }))
        Write-ActionState 'failed' @{ finished_at = [DateTime]::UtcNow.ToString('o'); exit_code = $process.ExitCode; detail = $detail }
        exit 0
    }

    if ($spec.success_probe_url) {
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        $ready = $false
        $lastProbeError = ''
        do {
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri ([string]$spec.success_probe_url) -TimeoutSec 2
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { $ready = $true; break }
            } catch { $lastProbeError = $_.Exception.Message }
            Start-Sleep -Milliseconds 200
        } while ([DateTime]::UtcNow -lt $deadline)
        if (-not $ready) {
            Write-ActionState 'failed' @{ finished_at = [DateTime]::UtcNow.ToString('o'); exit_code = 0; detail = Bounded-Detail ('Readiness verification failed: ' + $lastProbeError) }
            exit 0
        }
    }
    Write-ActionState 'succeeded' @{ finished_at = [DateTime]::UtcNow.ToString('o'); exit_code = 0; detail = 'Console readiness verified.' }
} catch {
    Write-ActionState 'failed' @{ finished_at = [DateTime]::UtcNow.ToString('o'); detail = Bounded-Detail $_.Exception.Message }
}
