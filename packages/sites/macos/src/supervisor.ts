import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveSiteRoot } from "./path-utils.js";
import type { MacosSiteConfig } from "./types.js";

export interface LaunchAgentPaths {
  plistPath: string;
  scriptPath: string;
}

/**
 * Generate a launchd LaunchAgent plist for a macOS Site.
 */
export function generateLaunchAgentPlist(
  config: MacosSiteConfig,
  _nodePath: string,
  scriptPath: string,
): string {
  const intervalSeconds = config.cycle_interval_minutes * 60;
  const label = `dev.narada.site.${config.site_id}`;
  const logDir = join(config.site_root, "logs", "cycles");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(scriptPath)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(logDir, "stdout.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(logDir, "stderr.log"))}</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(config.site_root)}</string>
</dict>
</plist>`;

  return plist;
}

/**
 * Generate a shell wrapper script that invokes the Cycle runner.
 *
 * Uses absolute paths and quotes everything to handle spaces
 * in `~/Library/Application Support/`.
 */
export function generateWrapperScript(
  siteRoot: string,
  nodePath: string,
  siteId: string,
): string {
  return `#!/bin/zsh
set -euo pipefail

SITE_ROOT=${quoteShell(siteRoot)}
SITE_ID=${quoteShell(siteId)}
NODE_PATH=${quoteShell(nodePath)}

export NODE_ENV=production
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Change to site root (cd is safe because SITE_ROOT is quoted)
cd "\${SITE_ROOT}"

exec "\${NODE_PATH}" -e "require('@narada2/macos-site').runCycle({ site_id: '\${SITE_ID}' })"
`;
}

/**
 * Write the LaunchAgent plist and wrapper script to disk.
 */
export async function writeLaunchAgentFiles(
  config: MacosSiteConfig,
  nodePath: string = process.execPath,
): Promise<LaunchAgentPaths> {
  const siteRoot = resolveSiteRoot(config.site_id);
  await mkdir(join(siteRoot, "logs", "cycles"), { recursive: true });

  const scriptPath = join(siteRoot, "run-cycle.sh");
  const wrapper = generateWrapperScript(siteRoot, nodePath, config.site_id);
  await writeFile(scriptPath, wrapper, "utf8");

  const launchAgentsDir = join(process.env.HOME ?? "~", "Library", "LaunchAgents");
  await mkdir(launchAgentsDir, { recursive: true });
  const plistPath = join(
    launchAgentsDir,
    `dev.narada.site.${config.site_id}.plist`,
  );
  const plist = generateLaunchAgentPlist(config, nodePath, scriptPath);
  await writeFile(plistPath, plist, "utf8");

  return { plistPath, scriptPath };
}

/**
 * Generate a shell command to register (load) the LaunchAgent.
 */
export function generateLoadCommand(siteId: string): string {
  const label = `dev.narada.site.${siteId}`;
  const plistPath = join(
    process.env.HOME ?? "$HOME",
    "Library",
    "LaunchAgents",
    `${label}.plist`,
  );
  return `launchctl load "${plistPath}"`;
}

/**
 * Generate a shell command to unregister (unload) the LaunchAgent.
 */
export function generateUnloadCommand(siteId: string): string {
  const label = `dev.narada.site.${siteId}`;
  const plistPath = join(
    process.env.HOME ?? "$HOME",
    "Library",
    "LaunchAgents",
    `${label}.plist`,
  );
  return `launchctl unload "${plistPath}"`;
}

/**
 * Generate a shell command to check if the LaunchAgent is loaded.
 */
export function generateStatusCommand(siteId: string): string {
  const label = `dev.narada.site.${siteId}`;
  return `launchctl list | grep "${label}"`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function quoteShell(str: string): string {
  // Use single quotes and escape embedded single quotes
  if (!str.includes("'")) return `'${str}'`;
  return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
}
