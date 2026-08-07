$script:OverlaySurfaceSnapshotSchema = 'narada.window_surface_overlay.surface_snapshot.v1'
$script:OverlayRuntimeStateSchema = 'narada.window_surface_overlay.runtime_state.v1'
$script:OverlaySurfaceId = 'narada-desktop-overlay-surface'
$script:OverlayFocusOwnerSchema = 'narada.window_surface_overlay.focus_owner.v1'

function Set-OverlayLifecycleState([string]$Next) {
    $current = [string]$script:LifecycleState
    if ($current -eq $Next) { return }
    $allowed = switch ($current) {
        'starting' { @('running', 'stopping', 'failed') }
        'running' { @('stopping', 'failed') }
        'stopping' { @('stopped', 'failed') }
        default { @() }
    }
    if ($allowed -notcontains $Next) { throw "overlay_lifecycle_transition_invalid:${current}:${Next}" }
    $script:LifecycleState = $Next
}

function Set-OverlayVisibilityState([string]$Next) {
    $current = [string]$script:VisibilityState
    if ($current -eq $Next) { return }
    $allowed = switch ($current) {
        'unknown' { @('showing', 'hiding', 'fault') }
        'showing' { @('visible', 'hiding', 'fault') }
        'visible' { @('showing', 'hiding', 'fault') }
        'hiding' { @('hidden', 'showing', 'fault') }
        'hidden' { @('showing', 'fault') }
        'fault' { @('showing', 'hiding', 'fault') }
        default { @() }
    }
    if ($allowed -notcontains $Next) { throw "overlay_visibility_transition_invalid:${current}:${Next}" }
    $script:VisibilityState = $Next
}

function Set-OverlayFocusState([string]$Next) {
    $current = [string]$script:FocusState
    if ($current -eq $Next) { return }
    $allowed = switch ($current) {
        'inactive' { @('requested') }
        'requested' { @('focused', 'failed', 'inactive') }
        'focused' { @('requested', 'inactive') }
        'failed' { @('requested', 'inactive') }
        default { @() }
    }
    if ($allowed -notcontains $Next) { throw "overlay_focus_transition_invalid:${current}:${Next}" }
    $script:FocusState = $Next
}

function Normalize-OverlayVisibilityPolicy([string]$Policy) {
    $value = if ($null -eq $Policy) { '' } else { $Policy.Trim().ToLowerInvariant() }
    if ($value -eq 'windows-terminal') { return 'terminal-group' }
    if ($value -in @('always', 'terminal-group')) { return $value }
    throw 'overlay_visibility_policy_invalid'
}

function Get-OverlaySurfaceRoot([string]$StateRoot) {
    $parent = Split-Path -Parent -Path $StateRoot
    if ([string]::IsNullOrWhiteSpace($parent)) { return $StateRoot }
    return $parent
}

function Read-OverlaySurfaceJson([string]$Path, [object]$Fallback = $null) {
    if (-not (Test-Path -LiteralPath $Path)) { return $Fallback }
    try { return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json } catch { return $Fallback }
}

function Write-OverlaySurfaceJsonAtomic([string]$Path, [object]$Value) {
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        $Value | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $temporary -Encoding UTF8
        [System.IO.File]::Move($temporary, $Path, $true)
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

function Write-OverlayRuntimeState {
    param(
        [Parameter(Mandatory = $true)][string]$StateRoot,
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Policy,
        [Parameter(Mandatory = $true)][string]$Lifecycle,
        [Parameter(Mandatory = $true)][string]$Visibility,
        [Parameter(Mandatory = $true)][string]$DesiredVisibility,
        [Parameter(Mandatory = $true)][string]$VisibilityReason,
        [Parameter(Mandatory = $true)][string]$ZOrder,
        [Parameter(Mandatory = $true)][string]$Focus,
        [object]$ProcessId = $null,
        [object]$SurfaceRevision = $null,
        [string]$Detail = $null
    )
    $path = Join-Path $StateRoot 'visibility.state.json'
    $state = [ordered]@{
        schema = $script:OverlayRuntimeStateSchema
        id = $Id
        pid = $ProcessId
        policy = Normalize-OverlayVisibilityPolicy $Policy
        lifecycle = $Lifecycle
        visibility = $Visibility
        desired_visibility = $DesiredVisibility
        visibility_reason = $VisibilityReason
        z_order = $ZOrder
        focus = $Focus
        surface_revision = $SurfaceRevision
        updated_at = [DateTime]::UtcNow.ToString('o')
    }
    if ($Detail) { $state.detail = $Detail }
    Write-OverlaySurfaceJsonAtomic $path $state
}

function Get-OverlayFocusOwnerPath([string]$SurfaceRoot) {
    Join-Path $SurfaceRoot 'focus.owner.json'
}

function Read-OverlayFocusOwner([string]$SurfaceRoot) {
    $owner = Read-OverlaySurfaceJson (Get-OverlayFocusOwnerPath $SurfaceRoot) $null
    if (-not $owner -or $owner.schema -ne $script:OverlayFocusOwnerSchema) { return $null }
    $ownerPid = 0
    if (-not [int]::TryParse([string]$owner.pid, [ref]$ownerPid) -or $ownerPid -le 0) { return $null }
    if (-not (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) { return $null }
    return $owner
}

function Set-OverlayFocusOwner {
    param(
        [Parameter(Mandatory = $true)][string]$SurfaceRoot,
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][int]$ProcessId
    )
    New-Item -ItemType Directory -Path $SurfaceRoot -Force | Out-Null
    Write-OverlaySurfaceJsonAtomic (Get-OverlayFocusOwnerPath $SurfaceRoot) ([ordered]@{
        schema = $script:OverlayFocusOwnerSchema
        surface_id = $script:OverlaySurfaceId
        id = $Id
        pid = $ProcessId
        updated_at = [DateTime]::UtcNow.ToString('o')
    })
}

function Clear-OverlayFocusOwner([string]$SurfaceRoot, [string]$Id) {
    $path = Get-OverlayFocusOwnerPath $SurfaceRoot
    $owner = Read-OverlayFocusOwner $SurfaceRoot
    if ($owner -and $owner.id -eq $Id) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
}

function Get-OverlayForegroundContext {
    $foregroundWindow = [NaradaWindowSurfaceOverlayNative]::GetForegroundWindow()
    if ($foregroundWindow -eq [IntPtr]::Zero) {
        return [pscustomobject]@{ kind = 'unknown'; pid = $null; overlay_id = $null; title = '' }
    }
    [uint32]$processId = 0
    [void][NaradaWindowSurfaceOverlayNative]::GetWindowThreadProcessId($foregroundWindow, [ref]$processId)
    $windowTitle = [System.Text.StringBuilder]::new(256)
    [void][NaradaWindowSurfaceOverlayNative]::GetWindowText($foregroundWindow, $windowTitle, $windowTitle.Capacity)
    $title = $windowTitle.ToString()
    $processName = ''
    try { $processName = (Get-Process -Id ([int]$processId) -ErrorAction Stop).ProcessName } catch {}
    if ($processName -in @('WindowsTerminal', 'WindowsTerminalPreview')) {
        return [pscustomobject]@{ kind = 'terminal'; pid = [int]$processId; overlay_id = $null; title = $title }
    }
    if ($title.StartsWith($script:OverlayWindowTitlePrefix, [StringComparison]::Ordinal)) {
        return [pscustomobject]@{ kind = 'overlay'; pid = [int]$processId; overlay_id = $title.Substring($script:OverlayWindowTitlePrefix.Length); title = $title }
    }
    return [pscustomobject]@{ kind = 'external'; pid = [int]$processId; overlay_id = $null; title = $title }
}

function Get-OverlayVisibilityDecision([string]$Policy, [string]$ForegroundKind) {
    $normalizedPolicy = Normalize-OverlayVisibilityPolicy $Policy
    if ($normalizedPolicy -eq 'always') {
        return [pscustomobject]@{ desired_visibility = 'visible'; reason = 'policy_always' }
    }
    if ($ForegroundKind -in @('terminal', 'overlay')) {
        return [pscustomobject]@{ desired_visibility = 'visible'; reason = 'terminal_group_active' }
    }
    if ($ForegroundKind -eq 'unknown') {
        return [pscustomobject]@{ desired_visibility = 'hidden'; reason = 'foreground_unknown' }
    }
    return [pscustomobject]@{ desired_visibility = 'hidden'; reason = 'foreground_external' }
}

function Get-OverlaySurfaceMembers {
    param(
        [Parameter(Mandatory = $true)][string]$SurfaceRoot,
        [Parameter(Mandatory = $true)][string]$CurrentId,
        [Parameter(Mandatory = $true)][int]$CurrentPid,
        [Parameter(Mandatory = $true)][string]$CurrentPolicy,
        [Parameter(Mandatory = $true)][string]$CurrentLifecycle,
        [Parameter(Mandatory = $true)][string]$CurrentVisibility,
        [Parameter(Mandatory = $true)][string]$CurrentZOrder,
        [Parameter(Mandatory = $true)][string]$CurrentFocus,
        [Parameter(Mandatory = $true)][string]$ForegroundKind
    )
    $members = @()
    $directories = @(Get-ChildItem -LiteralPath $SurfaceRoot -Directory -ErrorAction SilentlyContinue)
    foreach ($directory in $directories) {
        $id = $directory.Name
        $stateRoot = $directory.FullName
        $memberPid = $null
        $policy = $null
        $runtime = Read-OverlaySurfaceJson (Join-Path $stateRoot 'visibility.state.json') $null
        if ($id -eq $CurrentId) {
            $memberPid = $CurrentPid
            $policy = Normalize-OverlayVisibilityPolicy $CurrentPolicy
            $lifecycle = $CurrentLifecycle
            $visibility = $CurrentVisibility
            $zOrder = $CurrentZOrder
            $focus = $CurrentFocus
        } else {
            $pidPath = Join-Path $stateRoot 'overlay.pid'
            if (Test-Path -LiteralPath $pidPath) {
                $candidate = 0
                [int]::TryParse((Get-Content -Raw -LiteralPath $pidPath).Trim(), [ref]$candidate) | Out-Null
                if ($candidate -gt 0 -and (Get-Process -Id $candidate -ErrorAction SilentlyContinue)) { $memberPid = $candidate }
            }
            if ($null -eq $memberPid) { continue }
            $policyPath = Join-Path $stateRoot 'visibility.policy'
            $rawPolicy = if (Test-Path -LiteralPath $policyPath) {
                (Get-Content -Raw -LiteralPath $policyPath -ErrorAction SilentlyContinue).Trim()
            } else { 'terminal-group' }
            try { $policy = Normalize-OverlayVisibilityPolicy $rawPolicy } catch { $policy = 'terminal-group' }
            $lifecycle = if ($runtime -and $runtime.lifecycle) { [string]$runtime.lifecycle } else { 'running' }
            $visibility = if ($runtime -and $runtime.visibility) { [string]$runtime.visibility } else { 'unknown' }
            $zOrder = if ($runtime -and $runtime.z_order) { [string]$runtime.z_order } else { 'topmost' }
            $focus = if ($runtime -and $runtime.focus) { [string]$runtime.focus } else { 'inactive' }
        }
        $decision = Get-OverlayVisibilityDecision $policy $ForegroundKind
        $members += [pscustomobject]@{
            id = $id
            pid = $memberPid
            policy = $policy
            lifecycle = $lifecycle
            visibility = $visibility
            z_order = $zOrder
            focus = $focus
            decision = $decision
        }
    }
    return @($members | Sort-Object id)
}

function Get-OverlaySurfaceProjection {
    param(
        [Parameter(Mandatory = $true)][string]$SurfaceRoot,
        [Parameter(Mandatory = $true)][string]$CurrentId,
        [Parameter(Mandatory = $true)][int]$CurrentPid,
        [Parameter(Mandatory = $true)][string]$CurrentPolicy,
        [Parameter(Mandatory = $true)][string]$CurrentLifecycle,
        [Parameter(Mandatory = $true)][string]$CurrentVisibility,
        [Parameter(Mandatory = $true)][string]$CurrentZOrder,
        [Parameter(Mandatory = $true)][string]$CurrentFocus
    )
    New-Item -ItemType Directory -Path $SurfaceRoot -Force | Out-Null
    $foreground = Get-OverlayForegroundContext
    $focusOwner = Read-OverlayFocusOwner $SurfaceRoot
    $members = Get-OverlaySurfaceMembers -SurfaceRoot $SurfaceRoot -CurrentId $CurrentId -CurrentPid $CurrentPid -CurrentPolicy $CurrentPolicy -CurrentLifecycle $CurrentLifecycle -CurrentVisibility $CurrentVisibility -CurrentZOrder $CurrentZOrder -CurrentFocus $CurrentFocus -ForegroundKind $foreground.kind
    $focusKey = if ($focusOwner) { [string]$focusOwner.id + ':' + [string]$focusOwner.pid } else { 'none' }
    $stateKey = ($members | ForEach-Object {
        $_.id + ':' + [string]$_.pid + ':' + $_.policy + ':' + $_.lifecycle + ':' + $_.visibility + ':' + $_.z_order + ':' + $_.focus + ':' + $_.decision.desired_visibility + ':' + $_.decision.reason
    }) -join '|'
    $topologyKey = ($foreground.kind + ':' + [string]$foreground.pid + ':' + $focusKey + '|' + $stateKey)
    $path = Join-Path $SurfaceRoot 'surface.snapshot.json'
    $previous = Read-OverlaySurfaceJson $path $null
    if ($previous -and $previous.schema -eq $script:OverlaySurfaceSnapshotSchema -and $previous.topology_key -eq $topologyKey) { return $previous }
    $revision = if ($previous -and $previous.revision) { [int]$previous.revision + 1 } else { 1 }
    return [pscustomobject]@{
        schema = $script:OverlaySurfaceSnapshotSchema
        surface_id = $script:OverlaySurfaceId
        revision = $revision
        topology_key = $topologyKey
        foreground = $foreground
        focus_owner = $focusOwner
        members = @($members)
        updated_at = [DateTime]::UtcNow.ToString('o')
    }
}

function Update-OverlaySurfaceProjection {
    param(
        [Parameter(Mandatory = $true)][string]$SurfaceRoot,
        [Parameter(Mandatory = $true)][string]$CurrentId,
        [Parameter(Mandatory = $true)][int]$CurrentPid,
        [Parameter(Mandatory = $true)][string]$CurrentPolicy,
        [Parameter(Mandatory = $true)][string]$CurrentLifecycle,
        [Parameter(Mandatory = $true)][string]$CurrentVisibility,
        [Parameter(Mandatory = $true)][string]$CurrentZOrder,
        [Parameter(Mandatory = $true)][string]$CurrentFocus
    )
    $mutex = [Threading.Mutex]::new($false, 'Local\Narada.WindowSurfaceOverlay.Coordinator')
    $locked = $false
    try {
        $locked = $mutex.WaitOne(2000)
        if (-not $locked) { throw 'overlay_surface_projection_lock_timeout' }
        $snapshot = Get-OverlaySurfaceProjection @PSBoundParameters
        $path = Join-Path $SurfaceRoot 'surface.snapshot.json'
        $existing = Read-OverlaySurfaceJson $path $null
        if (-not $existing -or $existing.topology_key -ne $snapshot.topology_key) { Write-OverlaySurfaceJsonAtomic $path $snapshot }
        return $snapshot
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

function Get-OverlaySurfaceDecision([object]$Snapshot, [string]$Id, [string]$Policy) {
    $member = @($Snapshot.members | Where-Object { $_.id -eq $Id }) | Select-Object -First 1
    if ($member -and $member.decision) { return $member.decision }
    return Get-OverlayVisibilityDecision $Policy $Snapshot.foreground.kind
}
