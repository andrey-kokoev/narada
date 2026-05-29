# Install-AgentDesktopShortcuts.ps1
# Plans or materializes operator-surface agent launch affordances as local Windows .lnk projections.

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string] $AffordancePath = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) 'operator-surfaces\agent-launch-affordances.json'),
    [string] $ShortcutDirectory = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) '.crew\agent-shortcuts'),
    [string] $DesktopPath,
    [string] $SiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string] $Runtime,
    [ValidateSet('Plan', 'Create')]
    [string] $Mode = 'Plan',
    [string] $PCLocusAuthorityPath,
    [string] $TraceDirectory = $(Join-Path $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }) '.ai\operator-surface-crossing-evidence')
)

$ErrorActionPreference = 'Stop'

$RuntimeContractSchema = 'narada.runtime_substrate_kind.v1'
$AdmittedRuntimeSubstrateKinds = @('kimi', 'codex', 'agent-cli')

function Get-RuntimeKindRefusal {
    param(
        [string] $Candidate
    )

    [ordered]@{
        schema = $RuntimeContractSchema
        status = 'refused'
        reason_code = 'runtime_substrate_kind_unsupported'
        candidate_runtime_substrate_kind = [string] $Candidate
        admitted_runtime_substrate_kinds = $AdmittedRuntimeSubstrateKinds
        reason = 'runtime_substrate_kind is not admitted by narada.runtime_substrate_kind.v1'
        required_next_step = 'Use one of the admitted runtime_substrate_kind values or update the versioned runtime contract first.'
    }
}

function Assert-RuntimeSubstrateKind {
    param(
        [string] $Candidate
    )

    if ($Candidate -in $AdmittedRuntimeSubstrateKinds) {
        return $Candidate
    }

    $refusal = Get-RuntimeKindRefusal -Candidate $Candidate
    throw ($refusal | ConvertTo-Json -Depth 10 -Compress)
}

function ConvertTo-Hashtable {
    param(
        [Parameter(Mandatory = $true)]
        [object] $InputObject
    )

    if ($null -eq $InputObject) {
        return @{}
    }

    $json = $InputObject | ConvertTo-Json -Depth 20
    return ConvertFrom-Json -InputObject $json -AsHashtable
}

function Get-PcLocusAuthority {
    param(
        [string] $Path
    )

    if (-not $Path) {
        throw 'pc_locus_authority_required: executable .lnk creation requires -Mode Create and -PCLocusAuthorityPath pointing to an admitted PC-locus materialization authority packet.'
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "pc_locus_authority_not_found: $Path"
    }

    $authority = ConvertTo-Hashtable -InputObject (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    if ([string] $authority.target_locus -ne 'pc_site') {
        throw 'pc_locus_authority_requires_target_locus_pc_site'
    }
    if ([string] $authority.materialization_kind -ne 'agent_desktop_shortcuts') {
        throw 'pc_locus_authority_requires_agent_desktop_shortcuts_kind'
    }
    if ([string] $authority.authority_state -ne 'admitted') {
        throw 'pc_locus_authority_requires_admitted_state'
    }
    if (-not [string] $authority.authority_basis) {
        throw 'pc_locus_authority_requires_authority_basis'
    }

    return $authority
}

function New-ShortcutPlanEntry {
    param(
        [Parameter(Mandatory = $true)]
        [string] $ShortcutFilePath,
        [Parameter(Mandatory = $true)]
        [string] $Description,
        [Parameter(Mandatory = $true)]
        [string] $Arguments,
        [Parameter(Mandatory = $true)]
        [string] $TargetPath,
        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string] $RuntimeSubstrateKind,
        [Parameter(Mandatory = $true)]
        [string] $CarrierRuntime
    )

    [pscustomobject]@{
        Path = $ShortcutFilePath
        ProjectionKind = 'windows_lnk'
        AuthorityLocus = 'pc_site'
        TargetPath = $TargetPath
        Arguments = $Arguments
        WorkingDirectory = $WorkingDirectory
        Description = $Description
        RuntimeContractSchema = $RuntimeContractSchema
        RuntimeSubstrateKind = $RuntimeSubstrateKind
        CarrierRuntime = $CarrierRuntime
        Runtime = $CarrierRuntime
    }
}

function Write-MaterializationTrace {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Directory,
        [Parameter(Mandatory = $true)]
        [hashtable] $Authority,
        [Parameter(Mandatory = $true)]
        [object[]] $Shortcuts,
        [Parameter(Mandatory = $true)]
        [string] $RuntimeSubstrateKind,
        [Parameter(Mandatory = $true)]
        [string] $CarrierRuntime,
        [Parameter(Mandatory = $true)]
        [string] $ShortcutDirectory,
        [Parameter(Mandatory = $true)]
        [string] $AffordancePath
    )

    if (-not (Test-Path -LiteralPath $Directory)) {
        New-Item -ItemType Directory -Force -LiteralPath $Directory | Out-Null
    }

    $timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    $tracePath = Join-Path $Directory "agent-desktop-shortcuts-$timestamp.json"
    $trace = [ordered]@{
        schema = 'narada.operator_surface.agent_desktop_shortcut_materialization_trace.v0'
        recorded_at = (Get-Date).ToUniversalTime().ToString('o')
        target_locus = 'pc_site'
        source_locus = 'user_site'
        source_affordance_path = $AffordancePath
        shortcut_directory = $ShortcutDirectory
        runtime_contract_schema = $RuntimeContractSchema
        runtime_substrate_kind = $RuntimeSubstrateKind
        carrier_runtime = $CarrierRuntime
        runtime = $CarrierRuntime
        authority = $Authority
        materialized_shortcuts = @($Shortcuts)
        note = 'Executable .lnk files are PC-locus/local projections. User Site launch affordance JSON remains portable authority.'
    }
    $trace | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tracePath -Encoding UTF8
    return $tracePath
}

if (-not (Test-Path -LiteralPath $AffordancePath)) {
    throw "Agent launch affordance file not found: $AffordancePath"
}

$projection = Get-Content -LiteralPath $AffordancePath -Raw | ConvertFrom-Json
if (-not $Runtime) {
    $Runtime = [string] $projection.default_runtime_substrate_kind
}
if (-not $Runtime) {
    $Runtime = [string] $projection.default_runtime
}
$Runtime = Assert-RuntimeSubstrateKind -Candidate $Runtime

$launcher = Join-Path $SiteRoot 'tools\operator-surface-carriers\windows-glue\Start-CodexResumeOperatorSurfaces.ps1'
$powerShellExe = Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'
if (-not (Test-Path -LiteralPath $powerShellExe)) {
    $pwshCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    if ($pwshCommand) {
        $powerShellExe = $pwshCommand.Source
    } else {
        throw 'PowerShell 7 executable pwsh.exe was not found. Refusing to materialize agent shortcuts with Windows PowerShell 5.1.'
    }
}

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Operator-surface carrier launcher not found: $launcher"
}

if ($DesktopPath) {
    $ShortcutDirectory = $DesktopPath
}

$planned = @()
$created = @()
$aggregateCount = 0
$aggregateCarrierRuntimes = @{}

foreach ($affordance in $projection.affordances) {
    $enabled = [bool] $affordance.enabled
    $materializations = @($affordance.materializations)
    if (-not $enabled -or $materializations -notcontains 'desktop_shortcut') {
        continue
    }

    $label = [string] $affordance.label
    $identityName = [string] $affordance.identity_name
    $shortcutRuntimeSubstrateKind = [string] $affordance.runtime_substrate_kind
    if (-not $shortcutRuntimeSubstrateKind) {
        $shortcutRuntimeSubstrateKind = [string] $affordance.runtime
    }
    if (-not $shortcutRuntimeSubstrateKind) {
        $shortcutRuntimeSubstrateKind = $Runtime
    }
    $shortcutRuntimeSubstrateKind = Assert-RuntimeSubstrateKind -Candidate $shortcutRuntimeSubstrateKind
    if ($shortcutRuntimeSubstrateKind -ne $Runtime) {
        continue
    }
    $carrierRuntime = [string] $affordance.runtime
    if (-not $carrierRuntime) {
        $carrierRuntime = $shortcutRuntimeSubstrateKind
    }
    $carrierRuntime = Assert-RuntimeSubstrateKind -Candidate $carrierRuntime
    if (-not $label -or -not $identityName) {
        throw 'Agent launch affordance entries require label and identity_name.'
    }
    $aggregateCount += 1
    $aggregateCarrierRuntimes[$carrierRuntime] = $true

    $shortcutFilePath = Join-Path $ShortcutDirectory ("Narada Agent - $label ($shortcutRuntimeSubstrateKind).lnk")
    $description = "Start $identityName through the operator-surface carrier launcher using runtime_substrate_kind $shortcutRuntimeSubstrateKind and carrier runtime $carrierRuntime"
    $arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -UserSiteRoot "{1}" -IdentityResumePair "{2}={2}" -Runtime {3} -EnsurePresent -ShowSummary' -f $launcher, $SiteRoot, $identityName, $carrierRuntime
    $planned += New-ShortcutPlanEntry -ShortcutFilePath $shortcutFilePath -Description $description -Arguments $arguments -TargetPath $powerShellExe -WorkingDirectory $SiteRoot -RuntimeSubstrateKind $shortcutRuntimeSubstrateKind -CarrierRuntime $carrierRuntime
}

if ($aggregateCount -gt 0) {
    $aggregateCarrierRuntimeValues = @($aggregateCarrierRuntimes.Keys)
    if ($aggregateCarrierRuntimeValues.Count -ne 1) {
        throw "aggregate_shortcut_requires_single_carrier_runtime: runtime_substrate_kind '$Runtime' maps to multiple carrier runtimes: $($aggregateCarrierRuntimeValues -join ', ')"
    }
    $aggregateCarrierRuntime = [string] $aggregateCarrierRuntimeValues[0]
    $allShortcutFilePath = Join-Path $ShortcutDirectory ("Narada Agents - All ($Runtime).lnk")
    $description = "Start all enabled Narada agents through the operator-surface carrier launcher using runtime_substrate_kind $Runtime and carrier runtime $aggregateCarrierRuntime"
    $arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -UserSiteRoot "{1}" -Runtime {2} -EnsurePresent -ShowSummary' -f $launcher, $SiteRoot, $aggregateCarrierRuntime
    $planned += New-ShortcutPlanEntry -ShortcutFilePath $allShortcutFilePath -Description $description -Arguments $arguments -TargetPath $powerShellExe -WorkingDirectory $SiteRoot -RuntimeSubstrateKind $Runtime -CarrierRuntime $aggregateCarrierRuntime
}

if ($Mode -eq 'Plan') {
    [pscustomobject]@{
        Status = 'planned'
        RuntimeContractSchema = $RuntimeContractSchema
        RuntimeSubstrateKind = $Runtime
        Runtime = $Runtime
        ShortcutDirectory = $ShortcutDirectory
        AffordancePath = $AffordancePath
        ShortcutAuthority = 'pc_site_projection_required'
        MigrationGuidance = 'Existing .crew/agent-shortcuts and Desktop .lnk files are local PC projections. Keep or remove them only through PC-locus materialization/disposition authority; User Site JSON remains portable intent.'
        PlannedShortcuts = $planned
    }
    return
}

$pcAuthority = Get-PcLocusAuthority -Path $PCLocusAuthorityPath

if (-not (Test-Path -LiteralPath $ShortcutDirectory)) {
    New-Item -ItemType Directory -Force -LiteralPath $ShortcutDirectory | Out-Null
}

$shell = New-Object -ComObject WScript.Shell
foreach ($entry in $planned) {
    if ($PSCmdlet.ShouldProcess($entry.Path, 'Create PC-locus Narada agent shortcut projection')) {
        $shortcut = $shell.CreateShortcut($entry.Path)
        $shortcut.TargetPath = $entry.TargetPath
        $shortcut.Arguments = $entry.Arguments
        $shortcut.WorkingDirectory = $entry.WorkingDirectory
        $shortcut.IconLocation = "$($entry.TargetPath),0"
        $shortcut.Description = $entry.Description
        $shortcut.Save()
        $created += $entry.Path
    }
}

$createdCarrierRuntimes = @($planned | Select-Object -ExpandProperty CarrierRuntime -Unique)
$createdCarrierRuntime = if ($createdCarrierRuntimes.Count -eq 1) { [string] $createdCarrierRuntimes[0] } else { 'multiple' }
$tracePath = Write-MaterializationTrace -Directory $TraceDirectory -Authority $pcAuthority -Shortcuts $created -RuntimeSubstrateKind $Runtime -CarrierRuntime $createdCarrierRuntime -ShortcutDirectory $ShortcutDirectory -AffordancePath $AffordancePath

[pscustomobject]@{
    Status = 'created'
    RuntimeContractSchema = $RuntimeContractSchema
    RuntimeSubstrateKind = $Runtime
    Runtime = $Runtime
    CarrierRuntime = $createdCarrierRuntime
    ShortcutDirectory = $ShortcutDirectory
    AffordancePath = $AffordancePath
    AuthorityPath = $PCLocusAuthorityPath
    TracePath = $tracePath
    ShortcutAuthority = 'pc_site_projection_recorded'
    Shortcuts = $created
}
