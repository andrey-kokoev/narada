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
import { join } from "node:path";
import { resolveSiteRoot } from "./path-utils.js";
import type { LinuxSiteMode } from "./types.js";

export interface ResolveSecretOptions {
  /** Last-resort value from a config file */
  configValue?: string | null;
  /** Override the default .env file path */
  envFilePath?: string;
}

/**
 * Build the environment variable name for a secret.
 * Format: NARADA_{SITE_ID}_{SECRET_NAME} (uppercased, sanitized).
 */
export function envVarName(siteId: string, secretName: string): string {
  const safeSiteId = siteId.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
  const safeSecret = secretName.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
  return `NARADA_${safeSiteId}_${safeSecret}`;
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
  _secretName: string,
): string | null {
  // v1: Read from $CREDENTIALS_DIRECTORY/{secret_name}
  // https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials
  return null;
}

/**
 * Attempt to resolve a secret from the desktop Secret Service (libsecret).
 * v1 enhancement: user-mode can store secrets in the GNOME/KDE keyring.
 * Returns null in v0 (no Secret Service integration).
 */
async function resolveFromSecretService(
  _siteId: string,
  _secretName: string,
): Promise<string | null> {
  // v1: Use libsecret or a thin wrapper around the Secret Service D-Bus API
  return null;
}

/**
 * Attempt to resolve a secret from `pass` (passwordstore.org).
 * v1 enhancement: user-mode can use `pass` for secrets.
 * Returns null in v0 (no pass integration).
 */
async function resolveFromPass(
  _siteId: string,
  _secretName: string,
): Promise<string | null> {
  // v1: Execute `pass show narada/{site_id}/{secret_name}`
  return null;
}

/**
 * Resolve a secret for the given site using the mode-specific precedence chain.
 *
 * System-mode precedence (highest to lowest):
 *   v0: Environment variable (NARADA_{SITE_ID}_{SECRET_NAME}) → .env file → config value
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
  const envName = envVarName(siteId, secretName);
  const envFilePath =
    options?.envFilePath ?? join(resolveSiteRoot(siteId, mode), ".env");

  // v1: Mode-specific high-precedence stores
  if (mode === "system") {
    const systemdValue = resolveFromSystemdCredentials(siteId, secretName);
    if (systemdValue !== null) return systemdValue;
  } else {
    const secretServiceValue = await resolveFromSecretService(siteId, secretName);
    if (secretServiceValue !== null) return secretServiceValue;

    const passValue = await resolveFromPass(siteId, secretName);
    if (passValue !== null) return passValue;
  }

  // Env var
  const envValue = process.env[envName];
  if (envValue !== undefined && envValue !== "") {
    return envValue;
  }

  // .env file
  const envFileValues = readEnvFile(envFilePath);
  const envFileValue = envFileValues.get(envName);
  if (envFileValue !== undefined && envFileValue !== "") {
    return envFileValue;
  }

  // Config value
  const configValue = options?.configValue;
  if (configValue !== undefined && configValue !== null && configValue !== "") {
    return configValue;
  }

  return null;
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
