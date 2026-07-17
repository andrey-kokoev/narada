[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('openai-api','kimi-api','kimi-code-api','anthropic-api','deepseek-api','glm-api','openrouter-api')][string]$Provider,
  [switch]$InstallModules,
  [switch]$StatusOnly
)

$ErrorActionPreference = 'Stop'

if ($InstallModules) {
  Install-Module Microsoft.PowerShell.SecretManagement -Scope CurrentUser -Repository PSGallery -Force -AllowClobber
  Install-Module Microsoft.PowerShell.SecretStore -Scope CurrentUser -Repository PSGallery -Force -AllowClobber
}
Import-Module Microsoft.PowerShell.SecretManagement -ErrorAction Stop
Import-Module Microsoft.PowerShell.SecretStore -ErrorAction Stop

$vault = Get-SecretVault -Name SecretStore -ErrorAction SilentlyContinue
if ($null -eq $vault) {
  Register-SecretVault -Name SecretStore -ModuleName Microsoft.PowerShell.SecretStore -DefaultVault -AllowClobber
}
if (-not (Get-SecretVault -Name SecretStore).IsDefault) {
  Set-SecretVaultDefault -Name SecretStore
}

$secretRef = "narada/provider/$Provider/api-key"
if ($StatusOnly) {
  $present = $false
  try {
    $value = Get-Secret -Name $secretRef -Vault SecretStore -ErrorAction Stop
    $present = $null -ne $value -and (-not ($value -is [securestring]) -or $value.Length -gt 0)
  } catch { $present = $false }
  [pscustomobject]@{ schema = 'narada.provider_secret.status.v1'; provider = $Provider; secret_ref = $secretRef; present = $present } | ConvertTo-Json -Compress
  exit 0
}

$secret = Read-Host "Enter API key for $Provider" -AsSecureString
Set-Secret -Name $secretRef -Vault SecretStore -Secret $secret
[pscustomobject]@{ schema = 'narada.provider_secret.set.v1'; provider = $Provider; secret_ref = $secretRef; stored = $true } | ConvertTo-Json -Compress

