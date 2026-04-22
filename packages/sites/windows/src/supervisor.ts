import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { resolveSiteRoot } from "./path-utils.js";
import type { WindowsSiteConfig } from "./types.js";

export interface SupervisorRegistration {
  servicePath?: string;
  timerPath?: string;
  scriptPath?: string;
  cronEntry?: string;
}

// ---------------------------------------------------------------------------
// WSL / systemd helpers
// ---------------------------------------------------------------------------

/**
 * Generate systemd service and timer unit files for a WSL Site.
 */
export async function generateSystemdUnits(
  config: WindowsSiteConfig,
): Promise<{ service: string; timer: string }> {
  const siteRoot = resolveSiteRoot(config.site_id, config.variant);
  const service = `[Unit]
Description=Narada Site Cycle Runner — ${config.site_id}
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env node ${siteRoot}/node_modules/.bin/narada cycle --site ${config.site_id}
WorkingDirectory=${siteRoot}
Environment="NODE_ENV=production"
StandardOutput=journal
StandardError=journal

# Safety limits
TimeoutStartSec=${Math.ceil(config.ceiling_ms / 1000)}
MemoryMax=512M
`;
  const timer = `[Unit]
Description=Narada Site Cycle Timer — ${config.site_id}

[Timer]
OnBootSec=1min
OnUnitActiveSec=${config.cycle_interval_minutes}min
Persistent=true

[Install]
WantedBy=timers.target
`;
  return { service, timer };
}

/**
 * Write systemd unit files to the site directory.
 */
export async function writeSystemdUnits(
  config: WindowsSiteConfig,
): Promise<{ servicePath: string; timerPath: string }> {
  const { service, timer } = await generateSystemdUnits(config);
  const serviceName = `narada-${config.site_id}`;
  const siteRoot = resolveSiteRoot(config.site_id, config.variant);
  await mkdir(join(siteRoot, "systemd"), { recursive: true });
  const servicePath = join(siteRoot, "systemd", `${serviceName}.service`);
  const timerPath = join(siteRoot, "systemd", `${serviceName}.timer`);
  await writeFile(servicePath, service, "utf8");
  await writeFile(timerPath, timer, "utf8");
  return { servicePath, timerPath };
}

/**
 * Generate a cron fallback entry for a WSL Site.
 */
export function generateCronEntry(config: WindowsSiteConfig): string {
  const siteRoot = resolveSiteRoot(config.site_id, config.variant);
  const interval = config.cycle_interval_minutes;
  const cronExpr =
    interval < 60
      ? `*/${interval} * * * *`
      : `0 */${Math.floor(interval / 60)} * * *`;
  return `${cronExpr} cd ${siteRoot} && /usr/bin/env node node_modules/.bin/narada cycle --site ${config.site_id} >> ${siteRoot}/logs/cycles/cron.log 2>&1`;
}

/**
 * Generate a shell script for manual invocation.
 */
export function generateShellScript(config: WindowsSiteConfig): string {
  const siteRoot = resolveSiteRoot(config.site_id, config.variant);
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
export async function writeShellScript(config: WindowsSiteConfig): Promise<string> {
  const siteRoot = resolveSiteRoot(config.site_id, config.variant);
  await mkdir(siteRoot, { recursive: true });
  const scriptPath = join(siteRoot, "run-cycle.sh");
  const script = generateShellScript(config);
  await writeFile(scriptPath, script, "utf8");
  return scriptPath;
}

// ---------------------------------------------------------------------------
// Native Windows / Task Scheduler helpers
// ---------------------------------------------------------------------------

export interface TaskSchedulerOptions {
  siteId: string;
  siteRoot: string;
  intervalMinutes?: number;
  nodePath?: string;
  scriptPath?: string;
  taskName?: string;
}

export interface ScheduledTaskInfo {
  taskName: string;
  siteId: string;
  intervalMinutes: number;
  command: string;
}

/**
 * Generate the PowerShell command to register a scheduled task for a Site.
 */
export function generateRegisterTaskScript(
  options: TaskSchedulerOptions,
): string {
  const {
    siteId,
    siteRoot,
    intervalMinutes = 5,
    nodePath = "node",
    scriptPath,
    taskName = `Narada-Cycle-${siteId}`,
  } = options;

  const execCommand = scriptPath
    ? `"${nodePath}" "${scriptPath}" --site ${siteId}`
    : `"${nodePath}" -e "require('@narada2/cli').cycle({ site: '${siteId}' })"`;

  const logDir = join(siteRoot, "logs");

  return `
# Register Narada Cycle task for site: ${siteId}
$TaskName = "${taskName}"
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command ${execCommand} *> '${join(logDir, "cycle.log")}'"
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes ${intervalMinutes}) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force
Write-Host "Registered scheduled task: $TaskName (every ${intervalMinutes} minutes)"
`.trim();
}

/**
 * Generate the PowerShell command to unregister a scheduled task.
 */
export function generateUnregisterTaskScript(
  siteId: string,
  taskName = `Narada-Cycle-${siteId}`,
): string {
  return `
# Unregister Narada Cycle task for site: ${siteId}
$TaskName = "${taskName}"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Unregistered scheduled task: $TaskName"
`.trim();
}

/**
 * Generate a PowerShell command to check if the scheduled task exists.
 */
export function generateTaskStatusScript(
  siteId: string,
  taskName = `Narada-Cycle-${siteId}`,
): string {
  return `
# Check Narada Cycle task status for site: ${siteId}
$TaskName = "${taskName}"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "Task: $($task.TaskName)"
    Write-Host "State: $($task.State)"
    Write-Host "Last Run: $($taskInfo.LastRunTime)"
    Write-Host "Next Run: $($taskInfo.NextRunTime)"
    Write-Host "Last Result: $($taskInfo.LastTaskResult)"
} else {
    Write-Host "Task not found: $TaskName"
}
`.trim();
}

/**
 * Build a ScheduledTaskInfo object for documentation/testing.
 */
export function buildTaskInfo(options: TaskSchedulerOptions): ScheduledTaskInfo {
  const {
    siteId,
    intervalMinutes = 5,
    taskName = `Narada-Cycle-${siteId}`,
  } = options;

  return {
    taskName,
    siteId,
    intervalMinutes,
    command: `powershell.exe -Command "${generateRegisterTaskScript(options)}"`,
  };
}
