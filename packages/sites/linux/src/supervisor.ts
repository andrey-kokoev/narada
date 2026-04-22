import { join } from "node:path";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolveSiteRoot } from "./path-utils.js";
import type { LinuxSiteConfig, LinuxSiteMode } from "./types.js";

export interface SupervisorRegistration {
  servicePath?: string;
  timerPath?: string;
  cronEntry?: string;
}

export interface ServiceGenerationOptions {
  /** Hardening level. v0 = minimal; v1 = full. Defaults to v0. */
  hardeningLevel?: "v0" | "v1";
}

/**
 * Detect whether systemd is available on this system.
 */
export async function isSystemdAvailable(): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access("/run/systemd/system");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// systemd unit generation
// ---------------------------------------------------------------------------

/**
 * Generate a systemd service unit file for a Linux Site.
 */
export function generateSystemdService(
  config: LinuxSiteConfig,
  options?: ServiceGenerationOptions
): string {
  const siteRoot = resolveSiteRoot(config.site_id, config.mode);
  const hardening = options?.hardeningLevel ?? "v0";

  const v1Hardening = hardening === "v1"
    ? `
# v1 full hardening
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${siteRoot}
`
    : "";

  const service = `[Unit]
Description=Narada Site Cycle Runner -- ${config.site_id}
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env node ${siteRoot}/node_modules/.bin/narada cycle --site ${config.site_id}
WorkingDirectory=${siteRoot}
Environment="NODE_ENV=production"
StandardOutput=journal
StandardError=journal

# Runtime directory (auto-created and cleaned up by systemd)
RuntimeDirectory=narada/${config.site_id}

# Safety limits
TimeoutStartSec=${Math.ceil(config.ceiling_ms / 1000)}
TimeoutStopSec=30
MemoryMax=512M

# v0 hardening
NoNewPrivileges=yes
PrivateTmp=yes
${v1Hardening}`;

  return service;
}

/**
 * Validate that a generated systemd service unit contains required directives.
 *
 * Checks:
 * - Has [Unit], [Service] sections
 * - Contains After=network-online.target or After=network.target
 * - Contains TimeoutStartSec=
 * - Contains TimeoutStopSec=
 * - Contains Type=oneshot
 */
export function validateSystemdService(content: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!content.includes("[Unit]")) errors.push("Missing [Unit] section");
  if (!content.includes("[Service]")) errors.push("Missing [Service] section");
  if (!content.includes("Type=oneshot")) errors.push("Missing Type=oneshot");

  const hasNetworkOrdering =
    content.includes("After=network-online.target") ||
    content.includes("After=network.target");
  if (!hasNetworkOrdering) errors.push("Missing After=network-online.target or After=network.target");

  if (!content.includes("TimeoutStartSec=")) errors.push("Missing TimeoutStartSec=");
  if (!content.includes("TimeoutStopSec=")) errors.push("Missing TimeoutStopSec=");

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a systemd timer unit file for a Linux Site.
 */
export function generateSystemdTimer(config: LinuxSiteConfig): string {
  const timer = `[Unit]
Description=Narada Site Cycle Timer -- ${config.site_id}

[Timer]
OnBootSec=1min
OnUnitActiveSec=${config.cycle_interval_minutes}min
Persistent=true

[Install]
WantedBy=timers.target
`;

  return timer;
}

/**
 * Determine the unit file directory for a given mode.
 */
export function unitDir(mode: LinuxSiteMode): string {
  if (mode === "system") return "/etc/systemd/system";
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(
    process.env.HOME ?? "/tmp",
    ".config"
  );
  return join(xdgConfigHome, "systemd", "user");
}

/**
 * Write systemd unit files to the appropriate directory.
 *
 * Returns paths to the written files. Does NOT run systemctl.
 */
export async function writeSystemdUnits(
  config: LinuxSiteConfig
): Promise<{ servicePath: string; timerPath: string }> {
  const service = generateSystemdService(config);
  const timer = generateSystemdTimer(config);
  const serviceName = `narada-site-${config.site_id}`;
  const dir = unitDir(config.mode);

  await mkdir(dir, { recursive: true });

  const servicePath = join(dir, `${serviceName}.service`);
  const timerPath = join(dir, `${serviceName}.timer`);

  await writeFile(servicePath, service, "utf8");
  await writeFile(timerPath, timer, "utf8");

  return { servicePath, timerPath };
}

/**
 * Remove systemd unit files for a site.
 */
export async function removeSystemdUnits(
  siteId: string,
  mode: LinuxSiteMode
): Promise<void> {
  const serviceName = `narada-site-${siteId}`;
  const dir = unitDir(mode);
  const servicePath = join(dir, `${serviceName}.service`);
  const timerPath = join(dir, `${serviceName}.timer`);

  try {
    await rm(servicePath, { force: true });
  } catch {
    // ignore
  }
  try {
    await rm(timerPath, { force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Cron fallback
// ---------------------------------------------------------------------------

/**
 * Generate a cron fallback entry for a Linux Site from a full config.
 */
export function generateCronEntry(config: LinuxSiteConfig): string;
/**
 * Generate a cron fallback entry from discrete parameters.
 */
export function generateCronEntry(
  siteId: string,
  mode: LinuxSiteMode,
  intervalMinutes: number
): string;
export function generateCronEntry(
  configOrSiteId: LinuxSiteConfig | string,
  mode?: LinuxSiteMode,
  intervalMinutes?: number
): string {
  let siteId: string;
  let siteMode: LinuxSiteMode;
  let interval: number;
  let siteRoot: string;

  if (typeof configOrSiteId === "string") {
    siteId = configOrSiteId;
    siteMode = mode!;
    interval = intervalMinutes!;
    siteRoot = resolveSiteRoot(siteId, siteMode);
  } else {
    siteId = configOrSiteId.site_id;
    siteMode = configOrSiteId.mode;
    interval = configOrSiteId.cycle_interval_minutes;
    siteRoot = resolveSiteRoot(siteId, siteMode);
  }

  const cronExpr =
    interval < 60
      ? `*/${interval} * * * *`
      : `0 */${Math.floor(interval / 60)} * * *`;
  return `${cronExpr} cd ${siteRoot} && /usr/bin/env node node_modules/.bin/narada cycle --site ${siteId} >> ${siteRoot}/logs/cycles/cron.log 2>&1`;
}

/**
 * Write a cron entry to a file in the site directory.
 */
export async function writeCronEntry(
  config: LinuxSiteConfig
): Promise<string> {
  const entry = generateCronEntry(config);
  const siteRoot = resolveSiteRoot(config.site_id, config.mode);
  await mkdir(join(siteRoot, "systemd"), { recursive: true });
  const cronPath = join(siteRoot, "systemd", "cron.tab");
  await writeFile(cronPath, `${entry}\n`, "utf8");
  return cronPath;
}

// ---------------------------------------------------------------------------
// Shell script
// ---------------------------------------------------------------------------

/**
 * Generate a shell script for manual invocation.
 */
export function generateShellScript(config: LinuxSiteConfig): string {
  const siteRoot = resolveSiteRoot(config.site_id, config.mode);
  return `#!/bin/bash
set -euo pipefail

SITE_ID="${config.site_id}"
SITE_ROOT="${siteRoot}"

export NODE_ENV=production
cd "$SITE_ROOT"

exec node node_modules/.bin/narada cycle --site "$SITE_ID" "$@"
`;
}

/**
 * Write the shell script to the site directory.
 */
export async function writeShellScript(config: LinuxSiteConfig): Promise<string> {
  const siteRoot = resolveSiteRoot(config.site_id, config.mode);
  await mkdir(siteRoot, { recursive: true });
  const scriptPath = join(siteRoot, "run-cycle.sh");
  const script = generateShellScript(config);
  await writeFile(scriptPath, script, "utf8");
  return scriptPath;
}

// ---------------------------------------------------------------------------
// High-level supervisor
// ---------------------------------------------------------------------------

export interface LinuxSiteSupervisor {
  register(config: LinuxSiteConfig): Promise<SupervisorRegistration>;
  unregister(siteId: string, mode: LinuxSiteMode): Promise<void>;
  listRegistered(mode: LinuxSiteMode): Promise<string[]>;
}

export class DefaultLinuxSiteSupervisor implements LinuxSiteSupervisor {
  async register(config: LinuxSiteConfig): Promise<SupervisorRegistration> {
    const systemdAvailable = await isSystemdAvailable();

    if (systemdAvailable) {
      const { servicePath, timerPath } = await writeSystemdUnits(config);
      return { servicePath, timerPath };
    }

    const cronEntry = await writeCronEntry(config);
    return { cronEntry };
  }

  async unregister(siteId: string, mode: LinuxSiteMode): Promise<void> {
    await removeSystemdUnits(siteId, mode);

    // Also remove cron file if present
    const siteRoot = resolveSiteRoot(siteId, mode);
    const cronPath = join(siteRoot, "systemd", "cron.tab");
    try {
      await rm(cronPath, { force: true });
    } catch {
      // ignore
    }
  }

  async listRegistered(mode: LinuxSiteMode): Promise<string[]> {
    const dir = unitDir(mode);
    if (!existsSync(dir)) return [];

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    const sites = new Set<string>();

    for (const entry of entries) {
      const match = entry.match(/^narada-site-(.+)\.(service|timer)$/);
      if (match) {
        sites.add(match[1]);
      }
    }

    return Array.from(sites).sort();
  }
}
