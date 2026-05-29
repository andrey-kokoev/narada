$ErrorActionPreference = "Stop"

function Get-NaradaHostTopologyScreenSnapshot {
    param([object]$Screen)

    $deviceName = [string]$Screen.DeviceName
    $displayKey = if ($deviceName.StartsWith("\\.\")) { $deviceName.Substring(4) } else { $deviceName }

    [ordered]@{
        device_name = [string]$Screen.DeviceName
        display_key = $displayKey
        primary = [bool]$Screen.Primary
        bounds = [ordered]@{
            left = [int]$Screen.Bounds.X
            top = [int]$Screen.Bounds.Y
            right = [int]($Screen.Bounds.X + $Screen.Bounds.Width)
            bottom = [int]($Screen.Bounds.Y + $Screen.Bounds.Height)
            width = [int]$Screen.Bounds.Width
            height = [int]$Screen.Bounds.Height
        }
        working_area = [ordered]@{
            left = [int]$Screen.WorkingArea.X
            top = [int]$Screen.WorkingArea.Y
            right = [int]($Screen.WorkingArea.X + $Screen.WorkingArea.Width)
            bottom = [int]($Screen.WorkingArea.Y + $Screen.WorkingArea.Height)
            width = [int]$Screen.WorkingArea.Width
            height = [int]$Screen.WorkingArea.Height
        }
    }
}

function Get-NaradaHostTopologySignature {
    param([object]$Snapshot)

    $json = ($Snapshot | ConvertTo-Json -Depth 20 -Compress)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash($bytes)
        (($hash | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $sha256.Dispose()
    }
}

function Get-NaradaHostTopologySnapshot {
    param([object[]]$Screens)

    Add-Type -AssemblyName System.Windows.Forms
    $source = if ($null -ne $Screens) { @($Screens) } else { @([System.Windows.Forms.Screen]::AllScreens) }
    $screens = @($source | ForEach-Object { Get-NaradaHostTopologyScreenSnapshot -Screen $_ })
    $screens = @(
        $screens | Sort-Object `
            @{ Expression = { [int]$_.bounds.left } }, `
            @{ Expression = { [int]$_.bounds.top } }, `
            @{ Expression = { [string]$_.device_name } }
    )

    $snapshot = [ordered]@{
        display_count = $screens.Count
        display_keys = @($screens | ForEach-Object { [string]$_.display_key })
        primary_display_name = $null
        primary_display_key = $null
        screens = $screens
    }
    $primary = @($screens | Where-Object { $_.primary } | Select-Object -First 1 | ForEach-Object { [string]$_.device_name })
    $primaryKey = @($screens | Where-Object { $_.primary } | Select-Object -First 1 | ForEach-Object { [string]$_.display_key })
    if ($primary.Count -gt 0) {
        $snapshot.primary_display_name = [string]$primary[0]
    }
    if ($primaryKey.Count -gt 0) {
        $snapshot.primary_display_key = [string]$primaryKey[0]
    }
    $snapshot.topology_signature = Get-NaradaHostTopologySignature -Snapshot ([pscustomobject]$snapshot)
    [pscustomobject]$snapshot
}
