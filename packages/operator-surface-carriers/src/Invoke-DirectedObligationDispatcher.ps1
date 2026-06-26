param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$PcSiteRoot = if ($env:NARADA_PC_SITE_ROOT) { $env:NARADA_PC_SITE_ROOT } else { "C:\ProgramData\Narada\sites\pc\desktop-sunroom-2" },
    [string]$IdentityName = "narada-andrey.Kevin",
    [string]$FromIdentity = "narada-andrey.Bob",
    [string]$ObligationsPath,
    [string]$WorkboardFixturePath,
    [string]$BridgeResultFixturePath,
    [string]$StatePath,
    [string]$NowIso,
    [switch]$EmitOsm,
    [switch]$NoStateWrite,
    [switch]$PassThru
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([Parameter(ValueFromPipeline = $true)]$Json)
    begin { $chunks = New-Object System.Collections.Generic.List[string] }
    process { if ($null -ne $Json) { $chunks.Add([string]$Json) } }
    end {
        $raw = $chunks -join [Environment]::NewLine
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        $command = Get-Command ConvertFrom-Json
        if ($command.Parameters.ContainsKey("Depth")) { return $raw | ConvertFrom-Json -Depth 100 }
        return $raw | ConvertFrom-Json
    }
}

function Write-JsonFile {
    param([string]$Path, [object]$Value)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $json = $Value | ConvertTo-Json -Depth 100
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return [System.IO.File]::ReadAllText($Path) | ConvertFrom-NaradaJson
}

function Get-Array {
    param($Value)
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Array]) { return @($Value) }
    return @($Value)
}

function Get-PropertyValue {
    param($Object, [string[]]$Names)
    if ($null -eq $Object) { return $null }
    foreach ($name in $Names) {
        if ($Object -and $Object.PSObject.Properties.Name -contains $name) { return $Object.$name }
    }
    return $null
}

function Get-ObligationPriority {
    param([string]$Kind)
    switch ($Kind) {
        "review_request" { return 10 }
        "builder_handoff" { return 20 }
        "inbox_handoff" { return 30 }
        "local_followup_nudge" { return 40 }
        default { return 90 }
    }
}

function New-ObligationMessage {
    param($Obligation)
    $kind = [string]$Obligation.kind
    $task = Get-PropertyValue $Obligation @("task_number")
    $payload = Get-PropertyValue $Obligation @("payload")
    $summary = [string](Get-PropertyValue $payload @("summary", "title"))
    if ([string]::IsNullOrWhiteSpace($summary)) { $summary = "$kind obligation" }
    if ($task) { return "Directed obligation: $kind for task #$task. $summary" }
    return "Directed obligation: $kind. $summary"
}

if (-not (Test-Path -LiteralPath $UserSiteRoot)) { throw "user_site_root_missing: $UserSiteRoot" }
$UserSiteRoot = (Resolve-Path -LiteralPath $UserSiteRoot).Path
if (-not (Test-Path -LiteralPath $PcSiteRoot)) { New-Item -ItemType Directory -Force -Path $PcSiteRoot | Out-Null }
if (-not $StatePath) { $StatePath = Join-Path $PcSiteRoot "runtime\directed-obligations\dispatcher-state.json" }
$factsPath = Join-Path $UserSiteRoot "operator-surfaces\directed-obligation-facts.json"
$now = if ($NowIso) { [datetime]::Parse($NowIso) } else { Get-Date }

$reader = Join-Path $PSScriptRoot "Get-DirectedObligations.ps1"
$readerArgs = @{
    UserSiteRoot = $UserSiteRoot
    IdentityName = $IdentityName
    PassThru = $true
}
if ($ObligationsPath) { $readerArgs.ObligationsPath = $ObligationsPath }
if ($WorkboardFixturePath) { $readerArgs.WorkboardFixturePath = $WorkboardFixturePath }
if ($NowIso) { $readerArgs.NowIso = $NowIso }
$view = (& $reader @readerArgs) | ConvertFrom-NaradaJson

$state = Read-JsonFile $StatePath
if (-not $state) {
    $state = [pscustomobject][ordered]@{
        schema = "narada.operator_surfaces.directed_obligation_dispatcher_state.v0"
        items = @()
    }
}

$due = @($view.due_obligations | Sort-Object @{ Expression = { Get-ObligationPriority ([string]$_.kind) }; Ascending = $true }, updated_at)
$selected = if ($due.Count -gt 0) { $due[0] } else { $null }
$sent = $null
$deliveryIssue = $null
$suppressed = $false

if ($selected) {
    $fingerprint = "{0}|{1}|{2}|{3}" -f $IdentityName, $selected.obligation_id, $selected.updated_at, $selected.dedupe_key
    $existing = @($state.items | Where-Object { [string]$_.fingerprint -eq $fingerprint } | Select-Object -First 1)[0]
    if ($existing -and $existing.sent_at) {
        $suppressed = $true
    } elseif ($EmitOsm) {
        $bus = Join-Path $UserSiteRoot "tools\operator-surface-carriers\Send-OperatorSurfaceMessageBus.ps1"
        if (-not (Test-Path -LiteralPath $bus)) {
            $bus = Join-Path $PSScriptRoot "Send-OperatorSurfaceMessageBus.ps1"
        }
        if (-not (Test-Path -LiteralPath $bus)) { throw "operator_surface_message_bus_missing: $bus" }
        $busArgs = @{
            UserSiteRoot = $UserSiteRoot
            PcSiteRoot = $PcSiteRoot
            IdentityName = $IdentityName
            FromIdentity = $FromIdentity
            Text = (New-ObligationMessage -Obligation $selected)
            MessagePosture = "note"
            SubmitStrategy = "known_surface_submit"
            DedupeKey = "directed-obligation:$fingerprint"
            PassThru = $true
        }
        if ($BridgeResultFixturePath) { $busArgs.BridgeResultFixturePath = $BridgeResultFixturePath }
        $delivery = (& $bus @busArgs) | ConvertFrom-NaradaJson
        $sent = $delivery
        if ([string]$delivery.delivery_state -ne "delivered") { $deliveryIssue = "osm_delivery_not_delivered" }
        $record = [ordered]@{
            fingerprint = $fingerprint
            obligation_id = [string]$selected.obligation_id
            identity_name = $IdentityName
            sent_at = $now.ToString("o")
            delivery_state = [string]$delivery.delivery_state
        }
        $items = New-Object System.Collections.Generic.List[object]
        $replaced = $false
        foreach ($item in @($state.items)) {
            if ([string]$item.fingerprint -eq $fingerprint) { $items.Add([pscustomobject]$record); $replaced = $true } else { $items.Add($item) }
        }
        if (-not $replaced) { $items.Add([pscustomobject]$record) }
        $state.items = @($items.ToArray())
    } else {
        $deliveryIssue = "due_without_emit_osm"
    }
}

if (-not $NoStateWrite) {
    $state | Add-Member -NotePropertyName updated_at -NotePropertyValue ($now.ToString("o")) -Force
    Write-JsonFile -Path $StatePath -Value $state
    Write-JsonFile -Path $factsPath -Value ([ordered]@{
        schema = "narada.operator_surfaces.directed_obligation_facts.v0"
        generated_at = $now.ToString("o")
        source = "Invoke-DirectedObligationDispatcher.ps1"
        identity_name = $IdentityName
        obligation_source_path = $view.source_path
        due_count = $due.Count
        next_obligation = $selected
        delivery_issue = $deliveryIssue
        suppressed = $suppressed
        delivery = $sent
        authority = [ordered]@{
            obligation_authority = "operator-surfaces/directed-obligations.json"
            delivery_authority = "PC Site runtime operator-surface-message-bus"
            projection_authority = $false
        }
    })
}

$result = [pscustomobject][ordered]@{
    schema = "narada.operator_surfaces.directed_obligation_dispatch.v0"
    generated_at = $now.ToString("o")
    identity_name = $IdentityName
    obligation_view = $view
    next_obligation = $selected
    due_count = $due.Count
    emitted = [bool]$sent
    delivery = $sent
    delivery_issue = $deliveryIssue
    suppressed = $suppressed
    state_path = $StatePath
    surface_facts_path = $factsPath
}

if ($PassThru) { $result | ConvertTo-Json -Depth 100 } else { $result }
