import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";

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
 * Resolve the canonical site root directory.
 *
 * Default: ~/Library/Application Support/Narada/{site_id}
 * Override: NARADA_SITE_ROOT env variable, or explicit envOverride argument.
 */
export function resolveSiteRoot(siteId: string, envOverride?: string): string {
  const override = envOverride ?? process.env.NARADA_SITE_ROOT;
  if (override) return join(override, siteId);
  return join(homedir(), "Library", "Application Support", "Narada", siteId);
}

/**
 * Build a path inside a site directory (siteId-based).
 */
export function sitePath(siteId: string, ...segments: string[]): string {
  return join(resolveSiteRoot(siteId), ...segments);
}

/**
 * Build a path inside a site directory (siteRoot-based).
 */
export function sitePathFromRoot(siteRoot: string, ...segments: string[]): string {
  return join(siteRoot, ...segments);
}

/**
 * Ensure the site directory and standard subdirectories exist (siteId-based).
 *
 * Idempotent: safe to call multiple times.
 */
export async function ensureSiteDir(siteId: string): Promise<void> {
  const root = resolveSiteRoot(siteId);
  await ensureSiteDirFromRoot(root);
}

/**
 * Ensure the site directory and standard subdirectories exist (siteRoot-based).
 *
 * Idempotent: safe to call multiple times.
 */
export async function ensureSiteDirFromRoot(siteRoot: string): Promise<void> {
  await mkdir(siteRoot, { recursive: true });
  for (const subdir of SITE_SUBDIRECTORIES) {
    await mkdir(join(siteRoot, subdir), { recursive: true });
  }
}

/**
 * Path to the site config file (siteId-based).
 */
export function siteConfigPath(siteId: string): string {
  return sitePath(siteId, "config.json");
}

/**
 * Path to the site config file (siteRoot-based).
 */
export function siteConfigPathFromRoot(siteRoot: string): string {
  return join(siteRoot, "config.json");
}

/**
 * Path to the coordinator SQLite database (siteId-based).
 */
export function siteDbPath(siteId: string): string {
  return sitePath(siteId, "db", "coordinator.db");
}

/**
 * Path to the coordinator SQLite database (siteRoot-based).
 */
export function siteCoordinatorPath(siteRoot: string): string {
  return join(siteRoot, "db", "coordinator.db");
}

/**
 * Path to the logs directory (siteId-based).
 */
export function siteLogsPath(siteId: string): string {
  return sitePath(siteId, "logs");
}

/**
 * Path to the logs directory (siteRoot-based).
 */
export function siteLogsPathFromRoot(siteRoot: string): string {
  return join(siteRoot, "logs");
}

/**
 * Path to the traces directory (siteId-based).
 */
export function siteTracesPath(siteId: string): string {
  return sitePath(siteId, "traces");
}

/**
 * Path to the traces directory (siteRoot-based).
 */
export function siteTracesPathFromRoot(siteRoot: string): string {
  return join(siteRoot, "traces");
}
