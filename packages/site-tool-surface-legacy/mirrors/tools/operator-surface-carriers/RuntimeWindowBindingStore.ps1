function ConvertFrom-NaradaJson {
    param([Parameter(ValueFromPipeline = $true)]$Json)
    begin { $chunks = New-Object System.Collections.Generic.List[string] }
    process { if ($null -ne $Json) { $chunks.Add([string]$Json) } }
    end {
        $raw = $chunks -join [Environment]::NewLine
        $command = Get-Command ConvertFrom-Json
        if ($command.Parameters.ContainsKey("Depth")) { return $raw | ConvertFrom-Json -Depth 100 }
        return $raw | ConvertFrom-Json
    }
}

function Get-NaradaStableHash {
    param([string]$Value)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $sha.Dispose()
    }
}

function Get-NaradaFileHash {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    return Get-NaradaStableHash ([System.IO.File]::ReadAllText($Path))
}

function Write-NaradaJsonAtomic {
    param(
        [string]$Path,
        [object]$Value
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null

    $json = $Value | ConvertTo-Json -Depth 50
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    $tempPath = Join-Path $directory (".{0}.{1}.tmp" -f ([System.IO.Path]::GetFileName($Path)), [Guid]::NewGuid().ToString("N"))
    $backupPath = Join-Path $directory (".{0}.{1}.bak" -f ([System.IO.Path]::GetFileName($Path)), [Guid]::NewGuid().ToString("N"))

    [System.IO.File]::WriteAllText($tempPath, $json, $utf8NoBom)
    try {
        if (Test-Path -LiteralPath $Path) {
            [System.IO.File]::Replace($tempPath, $Path, $backupPath, $true)
            Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        } else {
            [System.IO.File]::Move($tempPath, $Path)
        }
    } finally {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-OperatorSurfaceRuntimeBindingMutation {
    param(
        [string]$PcSiteRoot,
        [string]$UserIdentityRegistry,
        [scriptblock]$Mutation,
        [string]$ExpectedVersionHash,
        [int]$LockTimeoutMs = 10000,
        [int]$MutationDelayMs = 0
    )

    $runtimeDir = Join-Path $PcSiteRoot "runtime"
    $runtimePath = Join-Path $runtimeDir "operator-surface-window-bindings.json"
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

    $mutexName = "Local\Narada.OperatorSurfaceRuntimeBindings.{0}" -f (Get-NaradaStableHash $runtimePath).Substring(0, 32)
    $mutex = [System.Threading.Mutex]::new($false, $mutexName)
    $acquired = $false

    try {
        $acquired = $mutex.WaitOne($LockTimeoutMs)
        if (-not $acquired) {
            throw "runtime_binding_lock_timeout: $runtimePath"
        }

        $beforeRaw = if (Test-Path -LiteralPath $runtimePath) { [System.IO.File]::ReadAllText($runtimePath) } else { "" }
        $beforeHash = Get-NaradaStableHash $beforeRaw
        if (-not [string]::IsNullOrWhiteSpace($ExpectedVersionHash) -and $ExpectedVersionHash -ne $beforeHash) {
            throw "runtime_binding_version_conflict: expected=$ExpectedVersionHash actual=$beforeHash path=$runtimePath"
        }

        $state = if ([string]::IsNullOrWhiteSpace($beforeRaw)) {
            [ordered]@{
                schema                 = "narada.operator_surfaces.runtime_window_bindings.v0"
                owner_pc_site_root     = $PcSiteRoot
                user_identity_registry = $UserIdentityRegistry
                updated_at             = (Get-Date -Format "o")
                bindings               = @()
            }
        } else {
            $beforeRaw | ConvertFrom-NaradaJson
        }

        if ($MutationDelayMs -gt 0) {
            Start-Sleep -Milliseconds $MutationDelayMs
        }

        $mutated = & $Mutation $state
        if ($null -eq $mutated) { $mutated = $state }
        $mutatedBindings = @()
        if ($mutated.PSObject.Properties.Name -contains "bindings") {
            $mutatedBindings = @($mutated.bindings)
        }
        $outputState = [ordered]@{
            schema                 = "narada.operator_surfaces.runtime_window_bindings.v0"
            owner_pc_site_root     = $PcSiteRoot
            user_identity_registry = $UserIdentityRegistry
            updated_at             = (Get-Date -Format "o")
            bindings               = @($mutatedBindings)
        }

        Write-NaradaJsonAtomic -Path $runtimePath -Value $outputState
        $afterHash = Get-NaradaFileHash $runtimePath

        return [pscustomobject][ordered]@{
            runtime_path = $runtimePath
            lock_name = $mutexName
            hash_before = $beforeHash
            hash_after = $afterHash
            binding_count = @($mutatedBindings).Count
        }
    } finally {
        if ($acquired) { $mutex.ReleaseMutex() | Out-Null }
        $mutex.Dispose()
    }
}


function Invoke-OperatorSurfaceRuntimeBindingPruning {
    param(
        [string]$PcSiteRoot,
        [string]$UserIdentityRegistry,
        [string]$IdentityName,
        [int]$LockTimeoutMs = 10000
    )

    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public static class NaradaPruningNative {
        [DllImport("user32.dll")]
        public static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
    }
"@

    $pruningEvidence = @{ pruned = @() }

    $mutation = {
        param($state)

        $pruned = New-Object System.Collections.Generic.List[object]
        $preserved = New-Object System.Collections.Generic.List[object]

        foreach ($binding in @($state.bindings)) {
            $hwnd = [IntPtr]::new([int64]$binding.hwnd)
            $isStale = $false
            $staleReasons = New-Object System.Collections.Generic.List[string]

            if (-not [NaradaPruningNative]::IsWindow($hwnd)) {
                $isStale = $true
                $staleReasons.Add("window_not_live")
            } else {
                $processId = [uint32]0
                [void][NaradaPruningNative]::GetWindowThreadProcessId($hwnd, [ref]$processId)
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                $processName = if ($process) { $process.ProcessName } else { "" }
                $classBuffer = [System.Text.StringBuilder]::new(256)
                [void][NaradaPruningNative]::GetClassName($hwnd, $classBuffer, $classBuffer.Capacity)
                $className = $classBuffer.ToString()

                if ($binding.observed_pid -ne $null -and [int]$binding.observed_pid -ne [int]$processId) {
                    $isStale = $true
                    $staleReasons.Add("pid_mismatch")
                }
                if ($binding.observed_process -and [string]$binding.observed_process -ne [string]$processName) {
                    $isStale = $true
                    $staleReasons.Add("process_mismatch")
                }
                if ($binding.observed_class -and [string]$binding.observed_class -ne [string]$className) {
                    $isStale = $true
                    $staleReasons.Add("class_mismatch")
                }
                if (-not $binding.observed_pid -or -not $binding.observed_process -or -not $binding.observed_class) {
                    $isStale = $true
                    $staleReasons.Add("missing_guards")
                }
            }

            if ($isStale) {
                if ((-not $IdentityName) -or ([string]$binding.identity_name -eq $IdentityName)) {
                    $pruned.Add([pscustomobject][ordered]@{
                        hwnd = [int64]$binding.hwnd
                        identity_name = [string]$binding.identity_name
                        reasons = @($staleReasons.ToArray())
                    })
                    continue
                }
            }
            $preserved.Add($binding)
        }

        $state.bindings = @($preserved.ToArray())
        $pruningEvidence.pruned = @($pruned.ToArray())
        return $state
    }

    $result = Invoke-OperatorSurfaceRuntimeBindingMutation `
        -PcSiteRoot $PcSiteRoot `
        -UserIdentityRegistry $UserIdentityRegistry `
        -Mutation $mutation `
        -LockTimeoutMs $LockTimeoutMs

    return [pscustomobject][ordered]@{
        runtime_path = $result.runtime_path
        hash_before = $result.hash_before
        hash_after = $result.hash_after
        binding_count = $result.binding_count
        pruned = $pruningEvidence.pruned
    }
}
