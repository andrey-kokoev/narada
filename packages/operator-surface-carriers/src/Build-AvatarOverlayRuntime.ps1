param(
    [string]$UserSiteRoot = $(if ($env:NARADA_USER_SITE_ROOT) { $env:NARADA_USER_SITE_ROOT } else { Join-Path $HOME 'Narada' }),
    [string]$WindowLabelsPath = "",
    [string]$InspectJsonPath = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

function ConvertFrom-NaradaJson {
    param([string]$Json)

    $command = Get-Command ConvertFrom-Json
    if ($command.Parameters.ContainsKey("Depth")) {
        return $Json | ConvertFrom-Json -Depth 100
    }
    return $Json | ConvertFrom-Json
}

function ConvertTo-NaradaJson {
    param([object]$Value)
    $Value | ConvertTo-Json -Depth 100
}

function Get-ObjectPropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )

    if (-not $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property) { return $null }
    return $property.Value
}

function Resolve-AvatarKind {
    param([object]$Asset)

    $kind = [string](Get-ObjectPropertyValue -Object $Asset -Name "kind")
    if (-not [string]::IsNullOrWhiteSpace($kind)) { return $kind.Trim().ToLowerInvariant() }

    $mediaType = [string](Get-ObjectPropertyValue -Object $Asset -Name "media_type")
    switch ($mediaType.ToLowerInvariant()) {
        "video/webm" { return "webm" }
        "video/mp4" { return "mp4" }
        "text/javascript" { return "threejs" }
        "text/html" { return "threejs" }
        default { return "" }
    }
}

function Get-InspectMatchIndex {
    param([object]$Inspect)

    $index = @{}
    if (-not $Inspect) { return $index }
    foreach ($record in @($Inspect)) {
        $matched = Get-ObjectPropertyValue -Object $record -Name "matched"
        if (-not $matched) { continue }
        $surfaceId = [string](Get-ObjectPropertyValue -Object $matched -Name "surface_id")
        if ([string]::IsNullOrWhiteSpace($surfaceId)) { continue }
        $index[$surfaceId] = $record
    }
    return $index
}

if ([string]::IsNullOrWhiteSpace($WindowLabelsPath)) {
    $WindowLabelsPath = Join-Path $UserSiteRoot "operator-surfaces\window-labels.json"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $UserSiteRoot "operator-surfaces\avatar-overlay-runtime.json"
}

if (-not (Test-Path -LiteralPath $WindowLabelsPath -PathType Leaf)) {
    throw "Window label projection not found: $WindowLabelsPath"
}

$labels = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($WindowLabelsPath))
$inspect = $null
if (-not [string]::IsNullOrWhiteSpace($InspectJsonPath) -and (Test-Path -LiteralPath $InspectJsonPath -PathType Leaf)) {
    $inspectPayload = ConvertFrom-NaradaJson ([System.IO.File]::ReadAllText($InspectJsonPath))
    $inspect = Get-ObjectPropertyValue -Object $inspectPayload -Name "records"
    if (-not $inspect) { $inspect = Get-ObjectPropertyValue -Object $inspectPayload -Name "matched" }
    if (-not $inspect) { $inspect = $inspectPayload }
}
$inspectIndex = Get-InspectMatchIndex -Inspect $inspect

$entries = [System.Collections.Generic.List[object]]::new()
$diagnostics = [System.Collections.Generic.List[object]]::new()

foreach ($binding in @($labels.bindings)) {
    $avatar = Get-ObjectPropertyValue -Object $binding -Name "avatar"
    if (-not $avatar) { continue }
    $animated = Get-ObjectPropertyValue -Object $avatar -Name "animated"
    if (-not $animated) { continue }

    $kind = Resolve-AvatarKind -Asset $animated
    if ($kind -notin @("webm", "mp4", "threejs")) { continue }

    $surfaceId = [string](Get-ObjectPropertyValue -Object $binding -Name "surface_id")
    $available = (Get-ObjectPropertyValue -Object $animated -Name "available") -eq $true
    if (-not $available) {
        $diagnostics.Add([ordered]@{
            kind = "avatar_overlay_asset_missing"
            surface_id = $surfaceId
            asset_kind = $kind
            path = Get-ObjectPropertyValue -Object $animated -Name "path"
            absolute_path = Get-ObjectPropertyValue -Object $animated -Name "absolute_path"
        })
        continue
    }

    $transparent = (Get-ObjectPropertyValue -Object $animated -Name "transparent_background") -eq $true
    if ($kind -eq "mp4" -and $transparent) {
        $diagnostics.Add([ordered]@{
            kind = "avatar_overlay_mp4_transparency_unsupported"
            surface_id = $surfaceId
            path = Get-ObjectPropertyValue -Object $animated -Name "path"
            message = "MP4 avatars are rectangular only; use WebM for transparent animated avatars."
        })
        continue
    }

    $inspectRecord = $inspectIndex[$surfaceId]
    $matched = if ($inspectRecord) { Get-ObjectPropertyValue -Object $inspectRecord -Name "matched" } else { $null }
    $window = if ($inspectRecord) { Get-ObjectPropertyValue -Object $inspectRecord -Name "window" } else { $null }
    $labelRect = if ($matched) { Get-ObjectPropertyValue -Object $matched -Name "label_rect" } else { $null }
    $renderable = if ($inspectRecord) { (Get-ObjectPropertyValue -Object $inspectRecord -Name "renderable") -eq $true } else { $false }
    $stale = if ($inspectRecord) { (Get-ObjectPropertyValue -Object $inspectRecord -Name "stale") -eq $true } else { $true }
    if (-not $labelRect) {
        $diagnostics.Add([ordered]@{
            kind = "avatar_overlay_live_geometry_unavailable"
            surface_id = $surfaceId
            message = "No OSL inspect label_rect was available for this animated avatar."
        })
    }

    $entries.Add([ordered]@{
        surface_id = $surfaceId
        identity_name = $surfaceId
        label = Get-ObjectPropertyValue -Object $binding -Name "label"
        hwnd = if ($window) { Get-ObjectPropertyValue -Object $window -Name "hwnd" } else { $null }
        visible = ($renderable -and -not $stale -and $null -ne $labelRect)
        label_rect = $labelRect
        operator_surface_label = Get-ObjectPropertyValue -Object $avatar -Name "operator_surface_label"
        animated = [ordered]@{
            kind = $kind
            path = Get-ObjectPropertyValue -Object $animated -Name "path"
            absolute_path = Get-ObjectPropertyValue -Object $animated -Name "absolute_path"
            media_type = Get-ObjectPropertyValue -Object $animated -Name "media_type"
            transparent_background = $transparent
            loop = if ($null -ne (Get-ObjectPropertyValue -Object $animated -Name "loop")) { (Get-ObjectPropertyValue -Object $animated -Name "loop") -eq $true } else { $true }
            muted = if ($null -ne (Get-ObjectPropertyValue -Object $animated -Name "muted")) { (Get-ObjectPropertyValue -Object $animated -Name "muted") -eq $true } else { $true }
            alpha_required = if ($null -ne (Get-ObjectPropertyValue -Object $animated -Name "alpha_required")) { (Get-ObjectPropertyValue -Object $animated -Name "alpha_required") -eq $true } else { $transparent }
            entrypoint = Get-ObjectPropertyValue -Object $animated -Name "entrypoint"
            alt = Get-ObjectPropertyValue -Object $animated -Name "alt"
        }
    })
}

$result = [ordered]@{
    schema = "narada.operator_surfaces.avatar_overlay_runtime.v0"
    generated_at = (Get-Date -Format "o")
    projection_authority = "operator_surface_window_labels_projection"
    window_labels_path = $WindowLabelsPath
    inspect_json_path = if ([string]::IsNullOrWhiteSpace($InspectJsonPath)) { $null } else { $InspectJsonPath }
    renderer = [ordered]@{
        architecture = "companion_webview_process"
        supported_kinds = @("webm", "mp4", "threejs")
        native_projection_kinds = @("gif", "still")
    }
    entries = @($entries.ToArray())
    diagnostics = @($diagnostics.ToArray())
}

$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
}
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputPath, (ConvertTo-NaradaJson $result), $utf8NoBom)
Write-Host "Generated avatar overlay runtime: $OutputPath"
