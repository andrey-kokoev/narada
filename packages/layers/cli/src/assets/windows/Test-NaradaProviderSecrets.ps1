# narada-managed-asset: windows-user-site.v1
[CmdletBinding()]
param(
  [string[]]$Provider
)

$ErrorActionPreference = 'Stop'
$providers = if ($Provider) { $Provider } else { @('openai-api','kimi-api','kimi-code-api','anthropic-api','deepseek-api','glm-api','openrouter-api') }
$secretManagementAvailable = $true
try {
  Import-Module Microsoft.PowerShell.SecretManagement -ErrorAction Stop
  Import-Module Microsoft.PowerShell.SecretStore -ErrorAction Stop
} catch {
  $secretManagementAvailable = $false
}

$vault = if ($secretManagementAvailable) {
  Get-SecretVault -Name SecretStore -ErrorAction SilentlyContinue
} else {
  $null
}

$rows = foreach ($name in $providers) {
  $secretRef = "narada/provider/$name/api-key"
  if (-not $secretManagementAvailable) {
    [pscustomobject]@{
      schema = 'narada.provider_secret.status.v1'
      provider = $name
      present = $false
      status = 'check_required'
      secret_ref = $secretRef
      evidence = 'SecretManagement/SecretStore modules are not available.'
    }
    continue
  }
  if ($null -eq $vault) {
    [pscustomobject]@{
      schema = 'narada.provider_secret.status.v1'
      provider = $name
      present = $false
      status = 'needs_setup'
      secret_ref = $secretRef
      evidence = 'SecretStore vault is not registered.'
    }
    continue
  }
  try {
    $info = Get-SecretInfo -Name $secretRef -Vault SecretStore -ErrorAction Stop
    [pscustomobject]@{
      schema = 'narada.provider_secret.status.v1'
      provider = $name
      present = $null -ne $info
      status = if ($null -ne $info) { 'ready' } else { 'needs_setup' }
      secret_ref = $secretRef
      evidence = if ($null -ne $info) { 'SecretStore entry metadata is present.' } else { 'SecretStore entry is missing.' }
    }
  } catch {
    [pscustomobject]@{
      schema = 'narada.provider_secret.status.v1'
      provider = $name
      present = $false
      status = 'check_required'
      secret_ref = $secretRef
      evidence = 'SecretStore entry could not be inspected without changing vault state.'
    }
  }
}
$rows | ConvertTo-Json -Depth 4
