/**
 * Credential resolver for Windows Site variants.
 *
 * Provides variant-specific secret resolution:
 * - Native Windows: Credential Manager → env var → .env file → config value
 * - WSL: env var → .env file → config value
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveSiteRoot } from "./path-utils.js";

export type WindowsVariant = "native" | "wsl";

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
 * Build the Credential Manager target name for a secret.
 * Format: Narada/{site_id}/{secret_name}
 */
export function credentialManagerTarget(
  siteId: string,
  secretName: string,
): string {
  return `Narada/${siteId}/${secretName}`;
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
      if (key) result.set(key, value);
    }
  } catch {
    // silent no-op if .env cannot be read
  }
  return result;
}

/**
 * Attempt to resolve a secret from Windows Credential Manager via keytar.
 * Returns null if keytar is unavailable or the secret is not found.
 */
async function resolveFromCredentialManager(
  siteId: string,
  secretName: string,
): Promise<string | null> {
  try {
    const keytar = await import("keytar");
    const target = credentialManagerTarget(siteId, secretName);
    const result = await keytar.getPassword(target, "default");
    return result;
  } catch {
    return null;
  }
}

/**
 * Resolve a secret for the given site using the variant-specific precedence chain.
 *
 * Native Windows precedence (highest to lowest):
 *   1. Windows Credential Manager
 *   2. Environment variable (NARADA_{SITE_ID}_{SECRET_NAME})
 *   3. .env file in site root
 *   4. Config file value (passed as options.configValue)
 *
 * WSL precedence (highest to lowest):
 *   1. Environment variable
 *   2. .env file in site root
 *   3. Config file value
 *
 * Returns null if the secret is not found at any level.
 * Throws if the native variant is requested on a non-Windows platform.
 */
export async function resolveSecret(
  siteId: string,
  secretName: string,
  variant: WindowsVariant,
  options?: ResolveSecretOptions,
): Promise<string | null> {
  if (variant === "native" && process.platform !== "win32") {
    throw new Error(
      `Windows Credential Manager resolution requested for site "${siteId}" ` +
        `but the current platform (${process.platform}) is not Windows. ` +
        `Use variant "wsl" for Linux-based environments.`,
    );
  }

  const envName = envVarName(siteId, secretName);
  const envFilePath =
    options?.envFilePath ?? join(resolveSiteRoot(siteId, variant), ".env");

  // Native Windows: Credential Manager has highest precedence
  if (variant === "native") {
    const cmValue = await resolveFromCredentialManager(siteId, secretName);
    if (cmValue !== null) return cmValue;
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
  secretName: string,
  variant: WindowsVariant,
  options?: ResolveSecretOptions,
): Promise<string> {
  const value = await resolveSecret(siteId, secretName, variant, options);
  if (value === null) {
    const envName = envVarName(siteId, secretName);
    const cmTarget =
      variant === "native" ? credentialManagerTarget(siteId, secretName) : null;
    let message =
      `Required secret "${secretName}" for site "${siteId}" was not found. ` +
      `Checked: environment variable ${envName}`;
    if (cmTarget) {
      message += `, Credential Manager target "${cmTarget}"`;
    }
    message += `, .env file, and config value.`;
    throw new Error(message);
  }
  return value;
}
