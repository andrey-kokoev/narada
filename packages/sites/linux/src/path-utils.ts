import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { existsSync, accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import type { LinuxSiteMode } from "./types.js";

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

/**
 * Detect the site mode from the runtime environment.
 *
 * - If `EUID === 0` or `/var/lib/narada` is writable, prefer "system"
 * - Otherwise default to "user"
 * - Explicit `NARADA_SITE_MODE` overrides
 */
export function detectMode(): LinuxSiteMode {
  const override = process.env.NARADA_SITE_MODE;
  if (override === "system" || override === "user") return override;

  if (process.getuid !== undefined && process.getuid() === 0) return "system";

  const varLibNarada = "/var/lib/narada";
  if (existsSync(varLibNarada)) {
    try {
      accessSync(varLibNarada, constants.W_OK);
      return "system";
    } catch {
      // not writable, fall through to user
    }
  }

  return "user";
}

/**
 * Resolve the canonical site root directory.
 *
 * System-mode: `/var/lib/narada/{site_id}`
 * User-mode: `~/.local/share/narada/{site_id}`
 *
 * Both respect `NARADA_SITE_ROOT` override.
 */
export function resolveSiteRoot(
  siteId: string,
  mode: LinuxSiteMode
): string {
  const override = process.env.NARADA_SITE_ROOT;
  if (override) return join(override, siteId);

  if (mode === "system") {
    return join("/var/lib/narada", siteId);
  }

  const xdgDataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(xdgDataHome, "narada", siteId);
}

/**
 * Build a path inside a site directory.
 */
export function sitePath(
  siteId: string,
  mode: LinuxSiteMode,
  ...segments: string[]
): string {
  return join(resolveSiteRoot(siteId, mode), ...segments);
}

/**
 * Ensure the site directory and standard subdirectories exist.
 *
 * Idempotent: safe to call multiple times.
 */
export async function ensureSiteDir(
  siteId: string,
  mode: LinuxSiteMode
): Promise<void> {
  const root = resolveSiteRoot(siteId, mode);
  await mkdir(root, { recursive: true });
  for (const subdir of SITE_SUBDIRECTORIES) {
    await mkdir(join(root, subdir), { recursive: true });
  }
}

/**
 * Path to the site config file.
 */
export function siteConfigPath(
  siteId: string,
  mode: LinuxSiteMode
): string {
  return sitePath(siteId, mode, "config.json");
}

/**
 * Path to the coordinator SQLite database.
 */
export function siteDbPath(
  siteId: string,
  mode: LinuxSiteMode
): string {
  return sitePath(siteId, mode, "db", "coordinator.db");
}

/**
 * Path to the logs directory.
 */
export function siteLogsPath(
  siteId: string,
  mode: LinuxSiteMode
): string {
  return sitePath(siteId, mode, "logs");
}

/**
 * Path to the traces directory.
 */
export function siteTracesPath(
  siteId: string,
  mode: LinuxSiteMode
): string {
  return sitePath(siteId, mode, "traces");
}

/**
 * Path to the runtime state directory.
 */
export function siteRuntimePath(
  siteId: string,
  mode: LinuxSiteMode
): string {
  if (mode === "system") {
    return join("/run/narada", siteId);
  }
  const uid = process.getuid?.() ?? 1000;
  return join("/run/user", String(uid), "narada", siteId);
}
