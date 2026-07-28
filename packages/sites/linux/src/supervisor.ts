import { join } from "node:path/posix";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveSiteRoot } from "./path-utils.js";
import type { LinuxSiteConfig, LinuxSiteMode } from "./types.js";

const execFileAsync = promisify(execFile);

export interface SupervisorRegistration {
  schema?: "narada.linux.supervisor.registration.v1";
  status?: "planned" | "applied" | "refused" | "partial";
  mutation_performed?: boolean;
  site_id?: string;
  mode?: LinuxSiteMode;
  data_preserved?: boolean;
  servicePath?: string;
  timerPath?: string;
  cronEntry?: string;
  activation?: {
    status: "planned" | "applied" | "refused" | "partial";
    nextAction: string;
  };
  refusal_reason?: string;
}

function systemctlPathAvailable(): boolean {
  const configured = process.env.NARADA_SYSTEMCTL_PATH?.trim();
  if (configured) return existsSync(configured);
  return ["/usr/bin/systemctl", "/bin/systemctl", "/usr/local/bin/systemctl"].some(existsSync);
}

/**
 * Report whether the selected systemd scope can be used by this process.
 * The checks are intentionally injectable so Windows/CI can prove the Linux
 * contract without pretending that a local systemd instance exists.
 */
export async function inspectSystemdCapability(
  mode: LinuxSiteMode,
  options: SystemdCapabilityOptions = {},
): Promise<SystemdCapability> {
  const systemdAvailable = options.systemdAvailable ?? await isSystemdAvailable();
  const systemctlAvailable = options.systemctlAvailable ?? systemctlPathAvailable();
  const effectiveUid = options.effectiveUid ?? process.geteuid?.();
  const privileges: SystemdCapability["privileges"] =
    effectiveUid === 0 ? "root" : effectiveUid === undefined ? "unknown" : "user";
  const runtimeDirectory = options.runtimeDirectory
    ?? process.env.XDG_RUNTIME_DIR
    ?? (effectiveUid === undefined ? undefined : `/run/user/${effectiveUid}`);
  const userSessionAvailable = mode === "user"
    ? !!runtimeDirectory && existsSync(runtimeDirectory)
    : null;
  const reasons: string[] = [];

  if (!systemdAvailable) reasons.push("systemd is not available on this host");
  if (!systemctlAvailable) reasons.push("systemctl is not available on this host");
  if (mode === "user" && !userSessionAvailable) reasons.push("the user systemd session is not available");
  if (mode === "system" && privileges !== "root") reasons.push("system scope requires root privileges");

  const status = reasons.length === 0 ? "ready" : "refused";
  return {
    schema: "narada.linux.systemd.capability.v1",
    mode,
    status,
    systemd_available: systemdAvailable,
    systemctl_available: systemctlAvailable,
    user_session_available: userSessionAvailable,
    privileges,
    reasons,
    ...(status === "refused"
      ? { remediation: mode === "user"
        ? "Start a user systemd session (and enable linger when unattended operation is required), or use the cron fallback."
        : "Run the system-scope operation as root, or choose Linux user mode." }
      : {}),
  };
}

export interface SystemdCapability {
  schema: "narada.linux.systemd.capability.v1";
  mode: LinuxSiteMode;
  status: "ready" | "refused";
  systemd_available: boolean;
  systemctl_available: boolean;
  user_session_available: boolean | null;
  privileges: "root" | "user" | "unknown";
  reasons: string[];
  remediation?: string;
}

export interface SystemdCapabilityOptions {
  systemdAvailable?: boolean;
  systemctlAvailable?: boolean;
  runtimeDirectory?: string;
  effectiveUid?: number;
}

export type SupervisorLifecycleOperation =
  | "enable"
  | "disable"
  | "start"
  | "stop"
  | "status";

export interface SupervisorLifecycleResult {
  schema: "narada.linux.supervisor.lifecycle.v1";
  operation: SupervisorLifecycleOperation;
  status: "planned" | "applied" | "refused" | "partial";
  mutation_performed: boolean;
  site_id: string;
  mode: LinuxSiteMode;
  unit: string;
  command: string[];
  data_preserved: true;
  output?: string;
  reason?: string;
  remediation?: string;
}

export type SystemctlCommandRunner = (
  args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

function defaultCliCommand(): string[] {
  const entrypoint = process.env.NARADA_CLI_ENTRYPOINT?.trim();
  return entrypoint ? [process.execPath, entrypoint] : ["narada"];
}

function systemdArgument(value: string): string {
  return /[\s"\\]/.test(value)
    ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`
    : value;
}

function shellArgument(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function supervisorCommand(config: LinuxSiteConfig): string[] {
  return config.cli_command?.length ? config.cli_command : defaultCliCommand();
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
  const siteRoot = config.site_root || resolveSiteRoot(config.site_id, config.mode);
  const hardening = options?.hardeningLevel ?? "v0";
  const command = [...supervisorCommand(config), "cycle", "--site", config.site_id];

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
ExecStart=${command.map(systemdArgument).join(" ")}
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
    siteRoot = configOrSiteId.site_root || resolveSiteRoot(siteId, siteMode);
  }

  const cronExpr =
    interval < 60
      ? `*/${interval} * * * *`
      : `0 */${Math.floor(interval / 60)} * * *`;
  const command = typeof configOrSiteId === "string"
    ? process.env.NARADA_CLI_ENTRYPOINT?.trim()
      ? [process.execPath, process.env.NARADA_CLI_ENTRYPOINT.trim()]
      : ["narada"]
    : supervisorCommand(configOrSiteId);
  return `${cronExpr} cd ${shellArgument(siteRoot)} && ${command.map(shellArgument).join(" ")} cycle --site ${shellArgument(siteId)} >> ${shellArgument(join(siteRoot, "logs", "cycles", "cron.log"))} 2>&1`;
}

/**
 * Write a cron entry to a file in the site directory.
 */
export async function writeCronEntry(
  config: LinuxSiteConfig
): Promise<string> {
  const entry = generateCronEntry(config);
  const siteRoot = config.site_root || resolveSiteRoot(config.site_id, config.mode);
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
  const siteRoot = config.site_root || resolveSiteRoot(config.site_id, config.mode);
  const command = supervisorCommand(config).map(shellArgument).join(" ");
  return `#!/bin/bash
set -euo pipefail

SITE_ID="${config.site_id}"
SITE_ROOT="${siteRoot}"

export NODE_ENV=production
cd "$SITE_ROOT"

exec ${command} cycle --site "$SITE_ID" "$@"
`;
}

/**
 * Write the shell script to the site directory.
 */
export async function writeShellScript(config: LinuxSiteConfig): Promise<string> {
  const siteRoot = config.site_root || resolveSiteRoot(config.site_id, config.mode);
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
  unregister(siteId: string, mode: LinuxSiteMode): Promise<SupervisorRegistration>;
  listRegistered(mode: LinuxSiteMode): Promise<string[]>;
  lifecycle(
    config: LinuxSiteConfig,
    operation: SupervisorLifecycleOperation,
    options?: { apply?: boolean },
  ): Promise<SupervisorLifecycleResult>;
}

export interface LinuxSiteSupervisorOptions {
  capability?: SystemdCapabilityOptions;
  runSystemctl?: SystemctlCommandRunner;
}

export class DefaultLinuxSiteSupervisor implements LinuxSiteSupervisor {
  private readonly options: LinuxSiteSupervisorOptions;

  constructor(options: LinuxSiteSupervisorOptions = {}) {
    this.options = options;
  }

  async register(config: LinuxSiteConfig): Promise<SupervisorRegistration> {
    const capability = await inspectSystemdCapability(config.mode, this.options.capability);

    if (capability.status === "ready") {
      const { servicePath, timerPath } = await writeSystemdUnits(config);
      return {
        schema: "narada.linux.supervisor.registration.v1",
        status: "planned",
        mutation_performed: true,
        site_id: config.site_id,
        mode: config.mode,
        data_preserved: true,
        servicePath,
        timerPath,
        activation: {
          status: "planned",
          nextAction: `Run systemctl ${config.mode === "user" ? "--user " : ""}daemon-reload && systemctl ${config.mode === "user" ? "--user " : ""}enable --now narada-site-${config.site_id}.timer`,
        },
      };
    }

    if (config.mode === "system") {
      return {
        schema: "narada.linux.supervisor.registration.v1",
        status: "refused",
        mutation_performed: false,
        site_id: config.site_id,
        mode: config.mode,
        data_preserved: true,
        activation: { status: "refused", nextAction: capability.remediation ?? "Resolve Linux supervisor prerequisites." },
        refusal_reason: capability.reasons.join("; "),
      };
    }

    const cronEntry = await writeCronEntry(config);
    return {
      schema: "narada.linux.supervisor.registration.v1",
      status: "planned",
      mutation_performed: true,
      site_id: config.site_id,
      mode: config.mode,
      data_preserved: true,
      cronEntry,
      activation: {
        status: "planned",
        nextAction: `Install the generated cron entry from ${cronEntry} with the selected Linux user's crontab.`,
      },
    };
  }

  async unregister(siteId: string, mode: LinuxSiteMode): Promise<SupervisorRegistration> {
    await removeSystemdUnits(siteId, mode);

    // Also remove cron file if present
    const siteRoot = resolveSiteRoot(siteId, mode);
    const cronPath = join(siteRoot, "systemd", "cron.tab");
    try {
      await rm(cronPath, { force: true });
    } catch {
      // ignore
    }

    return {
      schema: "narada.linux.supervisor.registration.v1",
      status: "applied",
      mutation_performed: true,
      site_id: siteId,
      mode,
      data_preserved: true,
      activation: {
        status: "applied",
        nextAction: "Site state and evidence were preserved; no supervisor units remain registered.",
      },
    };
  }

  async lifecycle(
    config: LinuxSiteConfig,
    operation: SupervisorLifecycleOperation,
    options: { apply?: boolean } = {},
  ): Promise<SupervisorLifecycleResult> {
    const capability = await inspectSystemdCapability(config.mode, this.options.capability);
    const unit = `narada-site-${config.site_id}.timer`;
    const scope = config.mode === "user" ? ["--user"] : [];
    const command = operation === "status"
      ? [...scope, "is-active", unit]
      : operation === "enable"
        ? [...scope, "enable", unit]
        : operation === "disable"
          ? [...scope, "disable", unit]
          : operation === "start"
            ? [...scope, "start", unit]
            : [...scope, "stop", unit];
    const base = {
      schema: "narada.linux.supervisor.lifecycle.v1" as const,
      operation,
      site_id: config.site_id,
      mode: config.mode,
      unit,
      command,
      data_preserved: true as const,
    };

    if (capability.status === "refused") {
      return {
        ...base,
        status: "refused",
        mutation_performed: false,
        reason: capability.reasons.join("; "),
        remediation: capability.remediation,
      };
    }
    if (!options.apply) {
      return { ...base, status: "planned", mutation_performed: false };
    }

    const runner = this.options.runSystemctl ?? (async (args: string[]) => {
      try {
        const result = await execFileAsync("systemctl", args, { encoding: "utf8", timeout: 10_000 });
        return { exitCode: 0, stdout: String(result.stdout), stderr: String(result.stderr ?? "") };
      } catch (error) {
        const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
        return { exitCode: typeof failure.code === "number" ? failure.code : 1, stdout: String(failure.stdout ?? ""), stderr: String(failure.stderr ?? failure.message ?? "") };
      }
    });
    const result = await runner(command);
    return {
      ...base,
      status: result.exitCode === 0 ? "applied" : "partial",
      mutation_performed: operation !== "status" && result.exitCode === 0,
      output: `${result.stdout}${result.stderr}`.trim() || undefined,
      ...(result.exitCode === 0 ? {} : { reason: `systemctl exited with code ${result.exitCode}` }),
    };
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
