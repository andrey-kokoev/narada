#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVIDENCE_SCHEMA: any = 'narada.lifecycle.evidence.v0';
const LIFECYCLE_ID: any = 'first_time_narada_operator_onboarding';

function pathEntries(envPath: any = process.env.PATH || '') : any{
  return envPath.split(path.delimiter).filter(Boolean);
}

function commandLooksAvailable(commandName: any, envPath: any = process.env.PATH || '', platform: any = process.platform) : any{
  const extensions: any = platform === 'win32'
    ? ['.exe', '.cmd', '.bat', '.ps1', '']
    : [''];

  for (const entry of pathEntries(envPath)) {
    for (const ext of extensions) {
      const candidate: any = path.join(entry, `${commandName}${ext}`);
      try {
        if (fs.statSync(candidate).isFile()) return true;
      } catch (error: any) {
        if (!error || error.code !== 'ENOENT') continue;
      }
    }
  }
  return false;
}

function statMaybe(targetPath: any) : any{
  try {
    return fs.statSync(targetPath);
  } catch (error: any) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function probeRootPosture(rootPath: any) : any{
  if (!rootPath) {
    return {
      evidence: [],
      blockers: [],
      observations: ['intended_user_site_root_not_supplied']
    };
  }

  const resolved: any = path.resolve(rootPath);
  const stat: any = statMaybe(resolved);
  if (!stat) {
    return {
      evidence: [],
      blockers: [],
      observations: [`intended_user_site_root_missing:${resolved}`]
    };
  }

  if (!stat.isDirectory()) {
    return {
      evidence: [],
      blockers: ['destructive_change_requested'],
      observations: [`intended_user_site_root_not_directory:${resolved}`]
    };
  }

  try {
    fs.accessSync(resolved, fs.constants.W_OK);
    return {
      evidence: ['intended_user_site_root_writable_or_advisory_posture_recorded'],
      blockers: [],
      observations: [`intended_user_site_root_writable:${resolved}`]
    };
  } catch {
    return {
      evidence: ['intended_user_site_root_writable_or_advisory_posture_recorded'],
      blockers: [],
      observations: [`intended_user_site_root_advisory_only:${resolved}`]
    };
  }
}

function probePrerequisites({ userSiteRoot = null, envPath = process.env.PATH || '', platform = process.platform }: any = {}) : any{
  const present: any = ['os_and_shell_identified'];
  const blockers: any = [];
  const observations: any = [
    `platform:${platform}`,
    `os:${os.type()} ${os.release()}`,
    `shell:${process.env.ComSpec || process.env.SHELL || 'unknown'}`
  ];

  if (commandLooksAvailable('git', envPath, platform)) {
    present.push('git_available_or_non_git_posture_recorded');
    observations.push('git_available:path_probe');
  } else {
    observations.push('git_not_found_non_git_posture_required');
  }

  if (process.versions?.node) {
    present.push('node_or_required_runtime_available_if_needed');
    observations.push(`node:${process.versions.node}`);
  }

  const rootPosture: any = probeRootPosture(userSiteRoot);
  present.push(...rootPosture.evidence);
  blockers.push(...rootPosture.blockers);
  observations.push(...rootPosture.observations);

  return {
    schema: EVIDENCE_SCHEMA,
    lifecycle_id: LIFECYCLE_ID,
    stage_id: 'prerequisites_checked',
    present: [...new Set(present)],
    pause_triggers_present: [...new Set(blockers)],
    observations,
    mutating: false
  };
}

function parseArgs(argv: any) : any{
  const options: any = {
    userSiteRoot: null,
    pretty: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg: any = argv[index];
    if (arg === '--user-site-root') {
      const next: any = argv[index + 1];
      if (!next) throw new Error('--user-site-root requires a path');
      options.userSiteRoot = next;
      index += 1;
    } else if (arg === '--pretty') {
      options.pretty = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  return options;
}

function runCli(argv: any = process.argv.slice(2), stdout: any = process.stdout, stderr: any = process.stderr) : any{
  try {
    const options: any = parseArgs(argv);
    const result: any = probePrerequisites(options);
    stdout.write(`${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`);
    return result.pause_triggers_present.length > 0 ? 2 : 0;
  } catch (error: any) {
    const result: any = {
      schema: EVIDENCE_SCHEMA,
      lifecycle_id: LIFECYCLE_ID,
      stage_id: 'prerequisites_checked',
      present: [],
      pause_triggers_present: ['prerequisite_probe_error'],
      observations: [error.message],
      mutating: false
    };
    stderr.write(`${JSON.stringify(result)}\n`);
    return 2;
  }
}

const entryPath: any = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}

export { EVIDENCE_SCHEMA, LIFECYCLE_ID, commandLooksAvailable, probePrerequisites, runCli };
