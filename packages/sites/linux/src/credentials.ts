/**
 * Credential resolver for Linux Sites.
 *
 * Provides mode-specific secret resolution:
 * - System-mode (v0): env var → `.env` file → config value
 * - User-mode (v0): env var → `.env` file → config value
 * - System-mode (v1): systemd credentials → env var → `.env` → config
 * - User-mode (v1): Secret Service / `pass` → env var → `.env` → config
 */

import { readFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { resolveSiteRoot } from "./path-utils.js";
import type { LinuxSiteMode } from "./types.js";

export interface ResolveSecretOptions {
  /** Last-resort value from a config file */
  configValue?: string | null;
  /** Override the default .env file path */
  envFilePath?: string;
  /** Override the systemd credential directory for deterministic tests or wrappers. */
  systemdCredentialsDirectory?: string;
  /** Override the Secret Service helper command. */
  secretServiceCommand?: string;
  /** Override the pass helper command. */
  passCommand?: string;
}

export type SecretResolutionSource =
  | "systemd_credentials"
  | "secret_service"
  | "pass"
  | "environment"
  | "env_file"
  | "config"
  | "missing";

export interface SecretResolutionEvidence {
  schema: "narada.linux.secret_resolution.v1";
  status: "resolved" | "missing";
  site_id: string;
  mode: LinuxSiteMode;
  secret_name: string;
  environment_variable: string;
  source: SecretResolutionSource;
  checked_sources: SecretResolutionSource[];
  value_present: boolean;
}

export interface ProviderReadinessOptions extends ResolveSecretOptions {
  endpoint?: string | null;
  endpointProbe?: (endpoint: string) => Promise<"available" | "unavailable">;
}

export interface ProviderReadiness {
  schema: "narada.linux.provider_readiness.v1";
  provider: string;
  mode: LinuxSiteMode;
  credential_kind: "api_key_secret";
  status: "ready" | "missing" | "malformed" | "unavailable";
  credential: SecretResolutionEvidence;
  endpoint?: string;
  reason?: string;
  remediation?: string;
}

const execFileAsync = promisify(execFile);

function safeSecretName(value: string): string | null {
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : null;
}

async function readCommandSecret(command: string, args: string[]): Promise<string | null> {
  try {
    const result = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    const value = String(result.stdout).trim();
    return value ? value.split(/\r?\n/, 1)[0]!.trim() || null : null;
  } catch {
    return null;
  }
}

/**
 * Build the environment variable name for a secret.
 * Format: SITE_{SITE_ID}_{SECRET_NAME} (uppercased, sanitized).
 */
export function envVarName(siteId: string, secretName: string): string {
  const safeSiteId = siteId.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
  const safeSecret = secretName.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
  return `SITE_${safeSiteId}_${safeSecret}`;
}

/**
 * Read a .env file into a Map without mutating process.env.
 */
function readEnvFile(path: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!existsSync(path)) return result;
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes if present
      const unquoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
          ? value.slice(1, -1)
          : value;
      if (key) result.set(key, unquoted);
    }
  } catch {
    // silent no-op if .env cannot be read
  }
  return result;
}

/**
 * Attempt to resolve a secret from systemd credentials.
 * v1 enhancement: systemd units can inject credentials via `LoadCredential=`.
 * Returns null in v0 (no systemd credential integration).
 */
function resolveFromSystemdCredentials(
  _siteId: string,
  secretName: string,
  credentialsDirectory?: string,
): string | null {
  const directory = credentialsDirectory ?? process.env.CREDENTIALS_DIRECTORY;
  const safeName = safeSecretName(secretName);
  if (!directory || !safeName) return null;
  try {
    const value = readFileSync(join(directory, safeName), "utf8").trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Attempt to resolve a secret from the desktop Secret Service (libsecret).
 * v1 enhancement: user-mode can store secrets in the GNOME/KDE keyring.
 * Returns null in v0 (no Secret Service integration).
 */
async function resolveFromSecretService(
  siteId: string,
  secretName: string,
  command = "secret-tool",
): Promise<string | null> {
  const safeName = safeSecretName(secretName);
  if (!safeName) return null;
  return readCommandSecret(command, [
    "lookup",
    "service", "narada",
    "site_id", siteId,
    "secret_name", safeName,
  ]);
}

/**
 * Attempt to resolve a secret from `pass` (passwordstore.org).
 * v1 enhancement: user-mode can use `pass` for secrets.
 * Returns null in v0 (no pass integration).
 */
async function resolveFromPass(
  siteId: string,
  secretName: string,
  command = "pass",
): Promise<string | null> {
  const safeName = safeSecretName(secretName);
  if (!safeName || !safeSecretName(siteId)) return null;
  return readCommandSecret(command, ["show", `narada/${siteId}/${safeName}`]);
}

/**
 * Resolve a secret for the given site using the mode-specific precedence chain.
 *
 * System-mode precedence (highest to lowest):
 *   v0: Environment variable (SITE_{SITE_ID}_{SECRET_NAME}) → .env file → config value
 *   v1: systemd credentials → Environment variable → .env file → config value
 *
 * User-mode precedence (highest to lowest):
 *   v0: Environment variable → .env file → config value
 *   v1: Secret Service → pass → Environment variable → .env file → config value
 *
 * Returns null if the secret is not found at any level.
 */
export async function resolveSecret(
  siteId: string,
  mode: LinuxSiteMode,
  secretName: string,
  options?: ResolveSecretOptions,
): Promise<string | null> {
  const evidence = await resolveSecretWithEvidence(siteId, mode, secretName, options);
  if (evidence.status === "missing") return null;

  if (mode === "system") {
    return resolveFromSystemdCredentials(siteId, secretName, options?.systemdCredentialsDirectory)
      ?? process.env[envVarName(siteId, secretName)]
      ?? readEnvFile(options?.envFilePath ?? join(resolveSiteRoot(siteId, mode), ".env")).get(envVarName(siteId, secretName))
      ?? options?.configValue
      ?? null;
  }
  if (evidence.source === "secret_service") {
    return resolveFromSecretService(siteId, secretName, options?.secretServiceCommand);
  }
  if (evidence.source === "pass") {
    return resolveFromPass(siteId, secretName, options?.passCommand);
  }
  const envName = envVarName(siteId, secretName);
  const envFilePath =
    options?.envFilePath ?? join(resolveSiteRoot(siteId, mode), ".env");
  if (evidence.source === "environment") return process.env[envName] ?? null;
  if (evidence.source === "env_file") return readEnvFile(envFilePath).get(envName) ?? null;
  return options?.configValue ?? null;
}

/**
 * Resolve a secret while retaining only redacted provenance, never the value.
 */
export async function resolveSecretWithEvidence(
  siteId: string,
  mode: LinuxSiteMode,
  secretName: string,
  options?: ResolveSecretOptions,
): Promise<SecretResolutionEvidence> {
  const envName = envVarName(siteId, secretName);
  const checkedSources: SecretResolutionSource[] = [];
  const resolved = (source: SecretResolutionSource): SecretResolutionEvidence => ({
    schema: "narada.linux.secret_resolution.v1",
    status: "resolved",
    site_id: siteId,
    mode,
    secret_name: secretName,
    environment_variable: envName,
    source,
    checked_sources: [...checkedSources, source],
    value_present: true,
  });

  if (mode === "system") {
    checkedSources.push("systemd_credentials");
    if (resolveFromSystemdCredentials(siteId, secretName, options?.systemdCredentialsDirectory) !== null) {
      return resolved("systemd_credentials");
    }
  } else {
    checkedSources.push("secret_service");
    if (await resolveFromSecretService(siteId, secretName, options?.secretServiceCommand) !== null) {
      return resolved("secret_service");
    }
    checkedSources.push("pass");
    if (await resolveFromPass(siteId, secretName, options?.passCommand) !== null) {
      return resolved("pass");
    }
  }

  checkedSources.push("environment");
  if (process.env[envName] !== undefined && process.env[envName] !== "") return resolved("environment");

  checkedSources.push("env_file");
  const envFileValues = readEnvFile(options?.envFilePath ?? join(resolveSiteRoot(siteId, mode), ".env"));
  if (envFileValues.get(envName)) return resolved("env_file");

  checkedSources.push("config");
  if (options?.configValue !== undefined && options.configValue !== null && options.configValue !== "") return resolved("config");

  return {
    schema: "narada.linux.secret_resolution.v1",
    status: "missing",
    site_id: siteId,
    mode,
    secret_name: secretName,
    environment_variable: envName,
    source: "missing",
    checked_sources: checkedSources,
    value_present: false,
  };
}

/**
 * Check provider credential and endpoint readiness without exposing a secret.
 */
export async function checkProviderReadiness(
  siteId: string,
  mode: LinuxSiteMode,
  provider: string,
  secretName: string,
  options?: ProviderReadinessOptions,
): Promise<ProviderReadiness> {
  const credential = await resolveSecretWithEvidence(siteId, mode, secretName, options);
  const base = {
    schema: "narada.linux.provider_readiness.v1" as const,
    provider,
    mode,
    credential_kind: "api_key_secret" as const,
    credential,
    ...(options?.endpoint ? { endpoint: options.endpoint } : {}),
  };
  if (credential.status === "missing") {
    return {
      ...base,
      status: "missing",
      reason: `Credential ${credential.environment_variable} was not found in the admitted Linux sources.`,
      remediation: `Bind ${credential.environment_variable} through the Site-authorized secret store; do not put the raw value in Site config.`,
    };
  }
  if (options?.endpoint) {
    let parsed: URL;
    try {
      parsed = new URL(options.endpoint);
      if (!['http:', 'https:', 'codex:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    } catch {
      return { ...base, status: "malformed", reason: "Provider endpoint is not a supported URL.", remediation: "Use an https:// endpoint or codex://local-subscription for local subscription auth." };
    }
    if (options.endpointProbe && await options.endpointProbe(parsed.toString()) === "unavailable") {
      return { ...base, status: "unavailable", reason: "Provider endpoint probe failed.", remediation: "Verify network access and provider endpoint configuration." };
    }
  }
  return { ...base, status: "ready" };
}

/**
 * Resolve a secret, throwing a clear error if it is not found.
 *
 * This is a convenience wrapper around {@link resolveSecret} for required secrets.
 */
export async function resolveSecretRequired(
  siteId: string,
  mode: LinuxSiteMode,
  secretName: string,
  options?: ResolveSecretOptions,
): Promise<string> {
  const value = await resolveSecret(siteId, mode, secretName, options);
  if (value === null) {
    const envName = envVarName(siteId, secretName);
    let message =
      `Required secret "${secretName}" for site "${siteId}" (mode: ${mode}) was not found. ` +
      `Checked: environment variable ${envName}`;
    if (mode === "system") {
      message += ", systemd credentials";
    } else {
      message += ", Secret Service, pass store";
    }
    message += ", .env file, and config value.";
    throw new Error(message);
  }
  return value;
}
