import { runGovernedCommandSync } from '@narada2/process-launch-posture';

export const SITE_SECRET_LOOKUP_TIMEOUT_MS = 5000;
export const SITE_SECRET_LOOKUP_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$name = [Environment]::GetEnvironmentVariable('NARADA_SECRET_LOOKUP_NAME', 'Process')
if ([string]::IsNullOrWhiteSpace($name)) { exit 3 }
if (-not (Get-Module -ListAvailable -Name Microsoft.PowerShell.SecretManagement)) { exit 10 }
Import-Module Microsoft.PowerShell.SecretManagement -ErrorAction Stop
$secret = Get-Secret -Name $name -AsPlainText -ErrorAction SilentlyContinue
if ($null -eq $secret -or [string]::IsNullOrWhiteSpace([string]$secret)) { exit 2 }
[Console]::Out.Write([string]$secret)
`;

export class CredentialLocatorResolutionError extends Error {
  constructor(code, locator) {
    super(`${code}:${locator?.id ?? 'credential-locator:unknown'}`);
    this.name = 'CredentialLocatorResolutionError';
    this.code = code;
    this.locatorId = locator?.id ?? null;
  }
}

/** Resolve one exact plan-bound locator. Environment is credential transport only. */
export async function resolveCredentialLocator(locator, {
  env = process.env,
  lookupScript = SITE_SECRET_LOOKUP_SCRIPT,
  timeoutMs = SITE_SECRET_LOOKUP_TIMEOUT_MS,
  runCommandSync = runGovernedCommandSync,
} = {}) {
  if (!locator || locator.store === 'none') return null;
  if (locator.store === 'env') {
    const value = env[locator.reference];
    if (typeof value === 'string' && value.length > 0) return value;
    throw new CredentialLocatorResolutionError('credential-unavailable', locator);
  }
  if (locator.store === 'site-secret') {
    const result = runCommandSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', lookupScript], {
      encoding: 'utf8',
      timeout: timeoutMs,
      env: { ...env, NARADA_SECRET_LOOKUP_NAME: locator.reference },
    });
    const value = !result.error && result.status === 0 ? String(result.stdout ?? '').trim() : '';
    if (value) return value;
    throw new CredentialLocatorResolutionError('credential-unavailable', locator);
  }
  throw new CredentialLocatorResolutionError('credential-store-not-supported', locator);
}
