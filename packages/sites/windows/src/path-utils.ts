import { win32, posix } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync, accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import type { WindowsSiteVariant } from "./types.js";

/** Standard subdirectories created inside a site root. */
export const SITE_SUBDIRECTORIES = [
  "state",
  "messages",
  "tombstones",
  "views",
  "blobs",
  "tmp",
  "db",
  "logs",
  "traces",
] as const;

function getPathLib(variant: WindowsSiteVariant) {
  return variant === "native" ? win32 : posix;
}

/**
 * Detect the site variant from the runtime environment.
 */
export function detectVariant(): WindowsSiteVariant {
  if (process.platform === "win32") return "native";
  // WSL sets WSL_DISTRO_NAME or has "microsoft" in /proc/version
  if (process.env.WSL_DISTRO_NAME) return "wsl";
  try {
    const { readFileSync } = require("node:fs");
    const version = readFileSync("/proc/version", "utf8");
    if (version.toLowerCase().includes("microsoft")) return "wsl";
  } catch {
    // ignore
  }
  // Default to wsl on Linux-like platforms for this package
  return "wsl";
}

/**
 * Resolve the canonical site root directory.
 *
 * Native: %LOCALAPPDATA%\Narada\{site_id}  (backslash separators)
 * WSL: /var/lib/narada/{site_id} if writable, else ~/narada/{site_id}
 *
 * Both respect NARADA_SITE_ROOT override.
 */
export function resolveSiteRoot(
  siteId: string,
  variant: WindowsSiteVariant
): string {
  const pathLib = getPathLib(variant);
  const override = process.env.NARADA_SITE_ROOT;
  if (override) return pathLib.join(override, siteId);

  if (variant === "native") {
    const localAppData =
      process.env.LOCALAPPDATA ??
      (process.env.USERPROFILE
        ? pathLib.join(process.env.USERPROFILE, "AppData", "Local")
        : undefined);
    if (!localAppData) {
      throw new Error(
        "Cannot resolve site root: LOCALAPPDATA or USERPROFILE not set"
      );
    }
    return pathLib.join(localAppData, "Narada", siteId);
  }

  // WSL: prefer /var/lib/narada if writable, fallback to ~/narada
  const varLibNarada = "/var/lib/narada";
  if (existsSync(varLibNarada)) {
    try {
      accessSync(varLibNarada, constants.W_OK);
      return posix.join(varLibNarada, siteId);
    } catch {
      // not writable, fall through to home fallback
    }
  }
  return posix.join(homedir(), "narada", siteId);
}

/**
 * Build a path inside a site directory.
 *
 * Uses Windows-style separators for native and POSIX separators for WSL,
 * regardless of the current runtime platform.
 */
export function sitePath(
  siteId: string,
  variant: WindowsSiteVariant,
  ...segments: string[]
): string {
  const pathLib = getPathLib(variant);
  return pathLib.join(resolveSiteRoot(siteId, variant), ...segments);
}

/**
 * Ensure the site directory and standard subdirectories exist.
 *
 * Idempotent: safe to call multiple times.
 */
export async function ensureSiteDir(
  siteId: string,
  variant: WindowsSiteVariant
): Promise<void> {
  const root = resolveSiteRoot(siteId, variant);
  const pathLib = getPathLib(variant);
  await mkdir(root, { recursive: true });
  for (const subdir of SITE_SUBDIRECTORIES) {
    await mkdir(pathLib.join(root, subdir), { recursive: true });
  }
}

/**
 * Path to the site config file.
 */
export function siteConfigPath(
  siteId: string,
  variant: WindowsSiteVariant
): string {
  return sitePath(siteId, variant, "config.json");
}

/**
 * Path to the coordinator SQLite database.
 */
export function siteDbPath(
  siteId: string,
  variant: WindowsSiteVariant
): string {
  return sitePath(siteId, variant, "db", "coordinator.db");
}

/**
 * Path to the logs directory.
 */
export function siteLogsPath(
  siteId: string,
  variant: WindowsSiteVariant
): string {
  return sitePath(siteId, variant, "logs");
}

/**
 * Path to the traces directory.
 */
export function siteTracesPath(
  siteId: string,
  variant: WindowsSiteVariant
): string {
  return sitePath(siteId, variant, "traces");
}
