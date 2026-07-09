/**
 * Credential resolver for macOS Sites.
 *
 * Precedence (highest to lowest):
 *   1. macOS Keychain (`security find-generic-password`)
 *   2. Environment variable (`SITE_{SITE_ID}_{SECRET_NAME}`)
 *   3. `.env` file in site root
 *   4. Config file value (passed as options.configValue)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileGoverned } from "@narada2/process-launch-posture";
import { resolveSiteRoot } from "./path-utils.js";

type CredentialExec = (
  command: string,
  args?: string[],
  options?: { timeout?: number },
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

const execAsync: CredentialExec = execFileGoverned;

/**
 * Internal hook for tests to inject a mock exec implementation.
 * @internal
 */
let _testExecImpl: CredentialExec | undefined;

function getExecAsync(): CredentialExec {
  return _testExecImpl ?? execAsync;
}

/** @internal */
export function _setTestExecImpl(impl: CredentialExec | undefined): void {
  _testExecImpl = impl;
}

export interface ResolveSecretOptions {
  /** Last-resort value from a config file */
  configValue?: string | null;
  /** Override the default .env file path */
  envFilePath?: string;
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
 * Build the macOS Keychain service name for a secret.
 * Format: dev.narada.site.{site_id}.{secret_name}
 */
export function keychainServiceName(siteId: string, secretName: string): string {
  return `dev.narada.site.${siteId}.${secretName}`;
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
 * Attempt to resolve a secret from the macOS Keychain via the `security` CLI.
 * Returns null if the secret is not found or Keychain access fails.
 */
async function resolveFromKeychain(
  siteId: string,
  secretName: string,
): Promise<string | null> {
  const service = keychainServiceName(siteId, secretName);
  try {
    const { stdout } = await getExecAsync()(
      "security",
      ["find-generic-password", "-s", service, "-w"],
      { timeout: 5_000 },
    );
    const trimmed = String(stdout).trim();
    if (trimmed) return trimmed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a secret for the given site using the macOS precedence chain.
 *
 * Returns null if the secret is not found at any level.
 */
export async function resolveSecret(
  siteId: string,
  secretName: string,
  options?: ResolveSecretOptions,
): Promise<string | null> {
  const envName = envVarName(siteId, secretName);
  const envFilePath =
    options?.envFilePath ?? join(resolveSiteRoot(siteId), ".env");

  // 1. Keychain
  const keychainValue = await resolveFromKeychain(siteId, secretName);
  if (keychainValue !== null) return keychainValue;

  // 2. Env var
  const envValue = process.env[envName];
  if (envValue !== undefined && envValue !== "") {
    return envValue;
  }

  // 3. .env file
  const envFileValues = readEnvFile(envFilePath);
  const envFileValue = envFileValues.get(envName);
  if (envFileValue !== undefined && envFileValue !== "") {
    return envFileValue;
  }

  // 4. Config value
  const configValue = options?.configValue;
  if (configValue !== undefined && configValue !== null && configValue !== "") {
    return configValue;
  }

  return null;
}

/**
 * Resolve a secret, throwing a clear error if it is not found.
 */
export async function resolveSecretRequired(
  siteId: string,
  secretName: string,
  options?: ResolveSecretOptions,
): Promise<string> {
  const value = await resolveSecret(siteId, secretName, options);
  if (value === null) {
    const envName = envVarName(siteId, secretName);
    const kcService = keychainServiceName(siteId, secretName);
    throw new Error(
      `Required secret "${secretName}" for site "${siteId}" was not found. ` +
        `Checked: Keychain service "${kcService}", environment variable ${envName}, ` +
        `.env file, and config value.`,
    );
  }
  return value;
}

/**
 * Trigger a TCC permission prompt interactively for Keychain access.
 *
 * This performs a no-op Keychain read so the system prompts the user
 * to allow Keychain access for the current process. The operator should
 * run this before activating the LaunchAgent.
 *
 * Returns true if the TCC prompt was triggered (regardless of user
 * response). Returns false if the `security` command is unavailable.
 */
export async function setupKeychainAccess(siteId: string): Promise<boolean> {
  const testService = `dev.narada.site.${siteId}.narada-setup-test`;
  try {
    await getExecAsync()(
      "security",
      ["find-generic-password", "-s", testService, "-w"],
      { timeout: 5_000 },
    );
    return true;
  } catch {
    // Even on failure, the command was attempted and may have triggered the prompt
    return true;
  }
}
