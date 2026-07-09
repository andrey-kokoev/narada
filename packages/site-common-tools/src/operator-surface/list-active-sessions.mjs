#!/usr/bin/env node
/**
 * list-active-sessions.mjs
 *
 * Discover active Kimi CLI sessions and map them to Narada identities.
 *
 * Usage:
 *   node tools/operator-surface/list-active-sessions.mjs [<site-root>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execGovernedSync } from '@narada2/process-launch-posture';

function parseArgs(argv) {
  const args = { siteRoot: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) args.siteRoot = resolve(arg);
  }
  return args;
}

function parseCommandLine(cmd) {
  const result = { raw: cmd, session_label: null, workspace: null, profile: null, role_flag: null };
  if (!cmd) return result;

  // Split by spaces, respecting quotes
  const args = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = regex.exec(cmd)) !== null) {
    args.push(m[1] || m[2] || m[3]);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-S' && i + 1 < args.length) {
      result.session_label = args[i + 1];
    } else if (arg === '-w' && i + 1 < args.length) {
      result.workspace = args[i + 1];
    } else if (arg === '-p' && i + 1 < args.length) {
      result.profile = args[i + 1];
    } else if (arg === '-r' && i + 1 < args.length) {
      result.role_flag = args[i + 1];
    }
  }

  return result;
}

function loadJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function findStateJson(workspace) {
  const candidates = [
    workspace ? join(workspace, '.kimi', 'state.json') : null,
    workspace ? join(workspace, 'state.json') : null,
    join(process.env.LOCALAPPDATA || '', 'kimi', 'state.json'),
    join(process.env.APPDATA || '', 'kimi', 'state.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  const siteRoot = args.siteRoot;

  // Query WMI for kimi.exe processes via WMIC CSV output
  let processes = [];
  try {
    const output = execGovernedSync('wmic process where "name=\'kimi.exe\'" get ProcessId,CommandLine /format:csv', {
      encoding: 'utf8',
      timeout: 15000,
    });
    // Parse CSV: Node,CommandLine,ProcessId
    // CommandLine may contain literal quotes; split by last comma for ProcessId
    const lines = output.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const line of lines) {
      if (line.startsWith('Node,')) continue;
      const lastComma = line.lastIndexOf(',');
      if (lastComma <= 0) continue;
      const pid = line.slice(lastComma + 1).trim();
      const front = line.slice(0, lastComma);
      const firstComma = front.indexOf(',');
      if (firstComma <= 0) continue;
      let cmd = front.slice(firstComma + 1).trim();
      // Remove surrounding quotes if present
      if (cmd.startsWith('"') && cmd.endsWith('"')) {
        cmd = cmd.slice(1, -1);
      }
      if (pid && cmd) {
        processes.push({ pid, cmd });
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', error: 'wmi_query_failed', detail: err.message }));
    process.exit(1);
  }

  // Load identity and session mappings
  const identitiesPath = join(siteRoot, 'operator-surfaces', 'identities.json');
  const desiredSessionsPath = join(siteRoot, 'operator-surfaces', 'desired-sessions.json');
  const identitiesData = loadJsonIfExists(identitiesPath);
  const desiredSessionsData = loadJsonIfExists(desiredSessionsPath);

  const identityRoleMap = new Map();
  if (identitiesData?.identities) {
    for (const id of identitiesData.identities) {
      identityRoleMap.set(id.identity_name, id.role);
    }
  }

  const sessionIdentityMap = new Map();
  if (desiredSessionsData?.sessions) {
    for (const s of desiredSessionsData.sessions) {
      sessionIdentityMap.set(s.session_id, s.identity_name);
    }
  }

  const sessions = [];
  for (const proc of processes) {
    const parsed = parseCommandLine(proc.cmd);
    const identityName = parsed.session_label || parsed.role_flag || null;
    const role = identityName ? (identityRoleMap.get(identityName) || null) : null;

    // Try to find state.json for custom_title
    let customTitle = null;
    const statePath = findStateJson(parsed.workspace);
    if (statePath) {
      const state = loadJsonIfExists(statePath);
      customTitle = state?.custom_title ?? null;
    }

    sessions.push({
      pid: proc.pid,
      identity_name: identityName,
      role,
      session_label: parsed.session_label,
      workspace: parsed.workspace,
      profile: parsed.profile,
      role_flag: parsed.role_flag,
      custom_title: customTitle,
      state_json_path: statePath ?? null,
    });
  }

  const report = {
    schema: 'narada.operator_surface.active_sessions.v0',
    generated_at: new Date().toISOString(),
    site_root: siteRoot,
    count: sessions.length,
    sessions,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
