$NaradaOperatorSurfaceCarrierLifecycleSchema = "narada.operator_surface_carrier.lifecycle_state.v1"
$NaradaOperatorSurfaceCarrierLifecycleTransitions = @{
    requested = @("planning", "launching", "waiting_for_claim", "resuming", "refused", "failed")
    planning = @("planned", "refused", "failed")
    planned = @("launching", "resuming", "refused")
    launching = @("waiting_for_claim", "claim_written", "refused", "failed")
    waiting_for_claim = @("claim_written", "refused", "failed")
    claim_written = @("resolving", "refused", "failed")
    resolving = @("resolved", "refused", "failed")
    resolved = @("binding", "verified", "refused", "failed")
    binding = @("bound", "refused", "failed")
    bound = @("verified", "failed")
    resuming = @("planning", "launching", "verified", "refused", "failed")
    partial = @()
    verified = @()
    refused = @()
    failed = @()
}

function Assert-NaradaOperatorSurfaceCarrierState {
    param([Parameter(Mandatory = $true)][string]$State)
    if (-not $NaradaOperatorSurfaceCarrierLifecycleTransitions.ContainsKey($State)) {
        throw "unsupported_operator_surface_carrier_state: $State"
    }
}

function Test-NaradaOperatorSurfaceCarrierTransition {
    param(
        [Parameter(Mandatory = $true)][string]$From,
        [Parameter(Mandatory = $true)][string]$To
    )
    Assert-NaradaOperatorSurfaceCarrierState -State $From
    Assert-NaradaOperatorSurfaceCarrierState -State $To
    return $From -eq $To -or @($NaradaOperatorSurfaceCarrierLifecycleTransitions[$From]) -contains $To
}

function New-NaradaOperatorSurfaceCarrierLifecycle {
    param([string]$InitialState = "requested")
    Assert-NaradaOperatorSurfaceCarrierState -State $InitialState
    return [ordered]@{
        schema = $NaradaOperatorSurfaceCarrierLifecycleSchema
        state = $InitialState
        history = @($InitialState)
    }
}

function Move-NaradaOperatorSurfaceCarrierLifecycle {
    param(
        [Parameter(Mandatory = $true)][object]$Lifecycle,
        [Parameter(Mandatory = $true)][string]$To
    )
    if (-not (Test-NaradaOperatorSurfaceCarrierTransition -From ([string]$Lifecycle.state) -To $To)) {
        throw "invalid_operator_surface_carrier_transition: $($Lifecycle.state)->$To"
    }
    if ([string]$Lifecycle.state -eq $To) { return $Lifecycle }
    return [ordered]@{
        schema = $NaradaOperatorSurfaceCarrierLifecycleSchema
        state = $To
        history = @($Lifecycle.history) + @($To)
    }
}

function Add-NaradaOperatorSurfaceCarrierLifecycleEvidence {
    param(
        [Parameter(Mandatory = $true)][object]$Result,
        [Parameter(Mandatory = $true)][object]$Lifecycle
    )
    $Result.lifecycle_schema = $Lifecycle.schema
    $Result.lifecycle_state = $Lifecycle.state
    $Result.lifecycle_history = @($Lifecycle.history)
    return $Result
}
