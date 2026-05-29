#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$IsnOutputRef,

    [Parameter(Mandatory = $true)]
    [string]$TraceOutputRef,

    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

function Resolve-McpOutputPath {
    param([Parameter(Mandatory = $true)][string]$Ref)
    $id = $Ref -replace '^mcp_output:', ''
    $path = Join-Path $RepoRoot ".ai/tmp/mcp-outputs/workspace/$id.json"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "MCP output file not found for $Ref at $path"
    }
    return $path
}

function Read-McpOutputTextJson {
    param([Parameter(Mandatory = $true)][string]$Ref)
    $path = Resolve-McpOutputPath -Ref $Ref
    $raw = Get-Content -LiteralPath $path -Raw
    $parsed = $raw | ConvertFrom-Json
    if ($parsed.PSObject.Properties.Name -contains 'output_text') {
        return $parsed.output_text | ConvertFrom-Json
    }
    if ($parsed.PSObject.Properties.Name -contains 'content') {
        $content = $parsed.content | ConvertFrom-Json
        if ($content.PSObject.Properties.Name -contains 'full_output') { return $content.full_output }
        return $content
    }
    if ($parsed -is [array] -and $parsed.Count -gt 0 -and $parsed[0].type -eq 'text') {
        $text = $parsed[0].text | ConvertFrom-Json
        if ($text.PSObject.Properties.Name -contains 'full_output') { return $text.full_output }
        return $text
    }
    if ($parsed.PSObject.Properties.Name -contains 'type' -and $parsed.type -eq 'text') {
        $text = $parsed.text | ConvertFrom-Json
        if ($text.PSObject.Properties.Name -contains 'full_output') { return $text.full_output }
        return $text
    }
    if ($parsed.PSObject.Properties.Name -contains 'full_output') { return $parsed.full_output }
    return $parsed
}

function Get-NodeGroup {
    param([string]$Plane)
    switch ($Plane) {
        'discovery' { 'Discovery' }
        'selection' { 'Selection' }
        'de_arbitrization' { 'De-Arbitrization' }
        'coverage' { 'Coverage' }
        'execution' { 'Execution' }
        'verification' { 'Verification' }
        'integration' { 'Integration' }
        default { 'Other' }
    }
}

function Add-Link {
    param(
        [System.Collections.Generic.List[object]]$Links,
        [string]$Source,
        [string]$Target,
        [string]$Kind,
        [string]$Label,
        [object]$Payload = $null
    )
    if ([string]::IsNullOrWhiteSpace($Source) -or [string]::IsNullOrWhiteSpace($Target)) { return }
    $Links.Add([pscustomobject]@{
        source = $Source
        target = $Target
        kind = $Kind
        label = $Label
        payload = $Payload
    })
}

$isn = Read-McpOutputTextJson -Ref $IsnOutputRef
$trace = Read-McpOutputTextJson -Ref $TraceOutputRef

$nodes = New-Object 'System.Collections.Generic.List[object]'
$links = New-Object 'System.Collections.Generic.List[object]'
$known = New-Object 'System.Collections.Generic.HashSet[string]'

foreach ($n in @($isn.nodes)) {
    [void]$known.Add($n.node_id)
    $nodes.Add([pscustomobject]@{
        id = $n.node_id
        label = $n.title
        kind = 'ISN'
        group = Get-NodeGroup -Plane $n.plane
        plane = $n.plane
        status = $n.status
        summary = $n.summary
        linked_task_number = $n.linked_task_number
        relations = @($n.relations)
        evidence_refs = @($n.evidence_refs)
        next_movement = $n.next_movement
        authority_owner = $n.authority_owner
        created_at = $n.created_at
        updated_at = $n.updated_at
    })
}

foreach ($n in @($isn.nodes)) {
    foreach ($rel in @($n.relations)) {
        if ([string]::IsNullOrWhiteSpace($rel)) { continue }
        $parts = $rel -split ':', 2
        $relKind = $parts[0]
        $relTarget = if ($parts.Count -gt 1) { $parts[1] } else { $rel }
        $targetId = $null
        if ($relTarget -match '^isn_[a-zA-Z0-9]+$') {
            $targetId = $relTarget
        } elseif ($relTarget -match '(isn_[a-zA-Z0-9]+)') {
            $targetId = $Matches[1]
        } elseif ($relTarget -match '^task[:#-]?(\d+)$') {
            $targetId = "task:$($Matches[1])"
        } elseif ($rel -match 'task[:#-]?(\d+)') {
            $targetId = "task:$($Matches[1])"
        } elseif ($rel -match '(env_[a-zA-Z0-9-]+)') {
            $targetId = $Matches[1]
        } else {
            $targetId = "rel:$rel"
        }
        if (-not $known.Contains($targetId)) {
            [void]$known.Add($targetId)
            $nodes.Add([pscustomobject]@{
                id = $targetId
                label = $targetId
                kind = if ($targetId -like 'task:*') { 'TaskRef' } elseif ($targetId -like 'env_*') { 'EnvelopeRef' } else { 'RelationRef' }
                group = 'Reference'
                summary = "Referenced by relation: $rel"
            })
        }
        Add-Link -Links $links -Source $n.node_id -Target $targetId -Kind 'relation' -Label $relKind -Payload $rel
    }

    if ($null -ne $n.linked_task_number) {
        $taskId = "task:$($n.linked_task_number)"
        if (-not $known.Contains($taskId)) {
            [void]$known.Add($taskId)
            $nodes.Add([pscustomobject]@{ id = $taskId; label = $taskId; kind = 'TaskRef'; group = 'Reference'; summary = 'Linked task lifecycle task.' })
        }
        Add-Link -Links $links -Source $n.node_id -Target $taskId -Kind 'linked_task' -Label 'linked task'
    }

    foreach ($ev in @($n.evidence_refs)) {
        if ($ev -match '^(task[:#]?)(\d+)$') {
            $taskId = "task:$($Matches[2])"
            if (-not $known.Contains($taskId)) {
                [void]$known.Add($taskId)
                $nodes.Add([pscustomobject]@{ id = $taskId; label = $taskId; kind = 'TaskRef'; group = 'Reference'; summary = 'Evidence task reference.' })
            }
            Add-Link -Links $links -Source $n.node_id -Target $taskId -Kind 'evidence' -Label 'evidence'
        } elseif ($ev -match '(env_[a-zA-Z0-9-]+)') {
            $envId = $Matches[1]
            if (-not $known.Contains($envId)) {
                [void]$known.Add($envId)
                $nodes.Add([pscustomobject]@{ id = $envId; label = $envId; kind = 'EnvelopeRef'; group = 'Reference'; summary = 'Evidence inbox/CAPA envelope reference.' })
            }
            Add-Link -Links $links -Source $n.node_id -Target $envId -Kind 'evidence' -Label 'evidence'
        }
    }
}

foreach ($s in @($trace.sequences)) {
    $sid = $s.sequence_id
    if (-not $known.Contains($sid)) {
        [void]$known.Add($sid)
        $nodes.Add([pscustomobject]@{
            id = $sid
            label = if ($s.title) { $s.title } else { $sid }
            kind = 'MovementSequence'
            group = 'Movement'
            summary = $s.summary
            completed_step_count = $s.completed_step_count
            created_at = $s.created_at
            updated_at = $s.updated_at
        })
    }
}

foreach ($t in @($trace.traces)) {
    $tid = $t.movement_id
    if (-not $known.Contains($tid)) {
        [void]$known.Add($tid)
        $nodes.Add([pscustomobject]@{
            id = $tid
            label = "$($t.navigation_plane) move $($t.step_index)"
            kind = 'MovementTrace'
            group = 'Movement'
            navigation_plane = $t.navigation_plane
            node_type = $t.node_type
            summary = if ($t.action_taken.summary) { $t.action_taken.summary } elseif ($t.next_pressure.reason) { $t.next_pressure.reason } else { $t.created_at }
            created_at = $t.created_at
            action_taken = $t.action_taken
            before_state = $t.before_state
            after_state = $t.after_state
            next_pressure = $t.next_pressure
        })
    }
    if ($t.sequence_id) { Add-Link -Links $links -Source $t.sequence_id -Target $tid -Kind 'sequence_step' -Label "step $($t.step_index)" }
    if ($t.isn_node_id) { Add-Link -Links $links -Source $tid -Target $t.isn_node_id -Kind 'trace_isn' -Label 'trace ISN' }
    if ($null -ne $t.linked_task_number) {
        $taskId = "task:$($t.linked_task_number)"
        if (-not $known.Contains($taskId)) {
            [void]$known.Add($taskId)
            $nodes.Add([pscustomobject]@{ id = $taskId; label = $taskId; kind = 'TaskRef'; group = 'Reference'; summary = 'Movement linked task.' })
        }
        Add-Link -Links $links -Source $tid -Target $taskId -Kind 'trace_task' -Label 'trace task'
    }
}

$out = [pscustomobject]@{
    schema = 'narada.inquiry_space.actual_graph_snapshot.v0'
    generated_at = (Get-Date).ToUniversalTime().ToString('o')
    source_refs = @($IsnOutputRef, $TraceOutputRef)
    isn_count = @($isn.nodes).Count
    trace_count = @($trace.traces).Count
    sequence_count = @($trace.sequences).Count
    nodes = $nodes
    links = $links
}

$dataPath = Join-Path $RepoRoot 'kb/site-lift/inquiry-space-actual-graph-data.js'
$payloadJson = $out | ConvertTo-Json -Depth 80
$content = "window.INQUIRY_SPACE_GRAPH_DATA = $payloadJson;`n"
if ($PSCmdlet.ShouldProcess($dataPath, 'Write actual Inquiry Space graph snapshot')) {
    Set-Content -LiteralPath $dataPath -Value $content -Encoding UTF8
}

[pscustomobject]@{
    status = 'ok'
    data_path = $dataPath
    nodes = $nodes.Count
    links = $links.Count
    isn_count = @($isn.nodes).Count
    traces = @($trace.traces).Count
    sequences = @($trace.sequences).Count
} | ConvertTo-Json -Depth 4
