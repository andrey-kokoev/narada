function Resolve-OperatorSurfaceDesktopDeliveryPlan {
    param(
        [Parameter(Mandatory = $true)]
        [int]$CurrentDesktop,

        [Parameter(Mandatory = $true)]
        [int]$TargetDesktop,

        [int]$PreviousForegroundDesktop = -1,

        [ValidateSet("warn_countdown", "refuse")]
        [string]$CrossDesktopPolicy = "refuse"
    )

    $targetKnown = $TargetDesktop -ge 0
    $previousKnown = $PreviousForegroundDesktop -ge 0

    if (-not $targetKnown) {
        return [pscustomobject][ordered]@{
            case = "target_desktop_unknown"
            action = "refuse"
            target_desktop_known = $false
            previous_foreground_desktop_known = $previousKnown
            desktop_switch_planned = $false
            restore_desktop_planned = $false
            message = "target_desktop_unknown: refresh or repair the runtime HWND binding before operator-surface delivery"
        }
    }

    if ($TargetDesktop -eq $CurrentDesktop) {
        $case = if ($previousKnown -and $PreviousForegroundDesktop -ne $CurrentDesktop) {
            "target_current_previous_non_current"
        } else {
            "target_on_current_desktop"
        }
        return [pscustomobject][ordered]@{
            case = $case
            action = "deliver_same_desktop"
            target_desktop_known = $true
            previous_foreground_desktop_known = $previousKnown
            desktop_switch_planned = $false
            restore_desktop_planned = $false
            message = "target is on current Windows desktop"
        }
    }

    if ($CrossDesktopPolicy -eq "refuse") {
        return [pscustomobject][ordered]@{
            case = if ($previousKnown -and $PreviousForegroundDesktop -eq $TargetDesktop) { "source_and_target_same_non_current_desktop" } else { "target_on_other_desktop" }
            action = "refuse_cross_desktop"
            target_desktop_known = $true
            previous_foreground_desktop_known = $previousKnown
            desktop_switch_planned = $false
            restore_desktop_planned = $false
            message = "cross_desktop_delivery_refused_by_policy"
        }
    }

    [pscustomobject][ordered]@{
        case = if ($previousKnown -and $PreviousForegroundDesktop -eq $TargetDesktop) { "source_and_target_same_non_current_desktop" } else { "target_on_other_desktop" }
        action = "warn_switch_deliver_restore"
        target_desktop_known = $true
        previous_foreground_desktop_known = $previousKnown
        desktop_switch_planned = $true
        restore_desktop_planned = $true
        message = "cross-desktop delivery requires operator-visible countdown before switching"
    }
}
