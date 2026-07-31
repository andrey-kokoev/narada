$script:OverlayPositionPreferencesSchema = 'narada.window_surface_overlay.preferences.v2'
$script:OverlayPositionAnchors = @('top-left', 'top-right', 'bottom-left', 'bottom-right')

function Get-OverlayPositionPreferencesSchema {
    return $script:OverlayPositionPreferencesSchema
}

function ConvertTo-OverlayPositionNumber([object]$value, [double]$fallback = 0) {
    try {
        $number = [double]$value
        if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { return $fallback }
        return $number
    } catch {
        return $fallback
    }
}

function Normalize-OverlayPositionAnchor([object]$value, [string]$fallback = 'top-right') {
    $anchor = [string]$value
    if ($script:OverlayPositionAnchors -contains $anchor) { return $anchor }
    return $fallback
}

function New-OverlayPositionPreference([string]$anchor = 'top-right', [double]$insetX = 20, [double]$insetY = 20) {
    [pscustomobject]@{
        kind = 'anchor'
        anchor = Normalize-OverlayPositionAnchor $anchor
        inset_x = [Math]::Max(0, (ConvertTo-OverlayPositionNumber $insetX))
        inset_y = [Math]::Max(0, (ConvertTo-OverlayPositionNumber $insetY))
    }
}

function Read-OverlayPositionPreference([object]$value) {
    $position = if ($null -ne $value) { $value.position } else { $null }
    if ($null -ne $position) {
        return New-OverlayPositionPreference ([string]$position.anchor) $position.inset_x $position.inset_y
    }

    # Legacy preferences stored absolute WPF Left/Top coordinates. Keep them
    # long enough to convert against the current monitor after the window has
    # been shown and its DPI is known.
    if ($null -ne $value -and $null -ne $value.left -and $null -ne $value.top) {
        return [pscustomobject]@{
            kind = 'absolute'
            left = ConvertTo-OverlayPositionNumber $value.left
            top = ConvertTo-OverlayPositionNumber $value.top
        }
    }

    return New-OverlayPositionPreference
}

function Clamp-OverlayPosition([double]$left, [double]$top, [double]$width, [double]$height, [object]$workArea) {
    $safeWidth = [Math]::Max(1, (ConvertTo-OverlayPositionNumber $width 1))
    $safeHeight = [Math]::Max(1, (ConvertTo-OverlayPositionNumber $height 1))
    $areaLeft = ConvertTo-OverlayPositionNumber $workArea.left
    $areaTop = ConvertTo-OverlayPositionNumber $workArea.top
    $areaRight = ConvertTo-OverlayPositionNumber $workArea.right ($areaLeft + $safeWidth)
    $areaBottom = ConvertTo-OverlayPositionNumber $workArea.bottom ($areaTop + $safeHeight)

    $minimumLeft = $areaLeft
    $maximumLeft = [Math]::Max($areaLeft, $areaRight - $safeWidth)
    $minimumTop = $areaTop
    $maximumTop = [Math]::Max($areaTop, $areaBottom - $safeHeight)

    [pscustomobject]@{
        left = [Math]::Min($maximumLeft, [Math]::Max($minimumLeft, (ConvertTo-OverlayPositionNumber $left $minimumLeft)))
        top = [Math]::Min($maximumTop, [Math]::Max($minimumTop, (ConvertTo-OverlayPositionNumber $top $minimumTop)))
    }
}

function Get-NearestOverlayPositionPreference([double]$left, [double]$top, [double]$width, [double]$height, [object]$workArea) {
    $clamped = Clamp-OverlayPosition $left $top $width $height $workArea
    $areaLeft = ConvertTo-OverlayPositionNumber $workArea.left
    $areaTop = ConvertTo-OverlayPositionNumber $workArea.top
    $areaRight = ConvertTo-OverlayPositionNumber $workArea.right
    $areaBottom = ConvertTo-OverlayPositionNumber $workArea.bottom
    $safeWidth = [Math]::Max(1, (ConvertTo-OverlayPositionNumber $width 1))
    $safeHeight = [Math]::Max(1, (ConvertTo-OverlayPositionNumber $height 1))

    $leftDistance = $clamped.left - $areaLeft
    $rightDistance = $areaRight - ($clamped.left + $safeWidth)
    $topDistance = $clamped.top - $areaTop
    $bottomDistance = $areaBottom - ($clamped.top + $safeHeight)
    $horizontal = if ($leftDistance -le $rightDistance) { 'left' } else { 'right' }
    $vertical = if ($topDistance -le $bottomDistance) { 'top' } else { 'bottom' }
    $insetX = if ($horizontal -eq 'left') { $leftDistance } else { $rightDistance }
    $insetY = if ($vertical -eq 'top') { $topDistance } else { $bottomDistance }

    New-OverlayPositionPreference "$vertical-$horizontal" $insetX $insetY
}

function Resolve-OverlayPosition([object]$preference, [double]$width, [double]$height, [object]$workArea) {
    $position = $preference
    if ($null -eq $position -or $position.kind -ne 'anchor') {
        $position = New-OverlayPositionPreference
    }
    $anchor = Normalize-OverlayPositionAnchor $position.anchor
    $insetX = [Math]::Max(0, (ConvertTo-OverlayPositionNumber $position.inset_x 20))
    $insetY = [Math]::Max(0, (ConvertTo-OverlayPositionNumber $position.inset_y 20))
    $safeWidth = [Math]::Max(1, (ConvertTo-OverlayPositionNumber $width 1))
    $safeHeight = [Math]::Max(1, (ConvertTo-OverlayPositionNumber $height 1))
    $areaLeft = ConvertTo-OverlayPositionNumber $workArea.left
    $areaTop = ConvertTo-OverlayPositionNumber $workArea.top
    $areaRight = ConvertTo-OverlayPositionNumber $workArea.right ($areaLeft + $safeWidth)
    $areaBottom = ConvertTo-OverlayPositionNumber $workArea.bottom ($areaTop + $safeHeight)
    $left = if ($anchor -like '*-left') { $areaLeft + $insetX } else { $areaRight - $safeWidth - $insetX }
    $top = if ($anchor -like 'top-*') { $areaTop + $insetY } else { $areaBottom - $safeHeight - $insetY }
    Clamp-OverlayPosition $left $top $safeWidth $safeHeight $workArea
}
