#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const RESULT_SCHEMA = 'narada.agent_start.result.v0';
const ADMITTED_AGENTS = new Set(['narada.architect']);

function parseArgs(argv) {
  const result = {};
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith('--')) {
    result.identity = argv[0];
    i = 1;
  }
  for (; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--runtime') result.runtime = argv[++i];
    else if (arg === '--json') result.json = true;
    else if (arg === '--dry-run') result.dry_run = true;
    else if (arg === '--exec') result.exec = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return result;
}

function startEvent(identity, runtime, dryRun) {
  const now = new Date().toISOString();
  const eventId = `agent_start_${now.replace(/[-:.]/g, '').replace('T', '_').replace('Z', '')}_${identity.replace(/[^A-Za-z0-9]+/g, '_')}`;
  return {
    schema: 'narada.agent_start.event.v0',
    event_id: eventId,
    site_id: 'narada-proper',
    site_root: rootDir,
    identity,
    role: identity === 'narada.architect' ? 'architect' : 'unknown',
    runtime,
    status: dryRun ? 'planned' : 'materialized',
    materialized_at: now,
    source_state_imported: false,
    operator_surface_runtime_copied: false,
    native_shell_fallback_allowed: false,
  };
}

function writeEvent(event) {
  const outDir = join(rootDir, '.narada', 'crew', 'agent-start-events');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${event.event_id}.json`);
  writeFileSync(path, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  return path;
}

function codexArgs() {
  return ['--ask-for-approval', 'never', '--disable', 'shell_tool'];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const identity = args.identity;
  const runtime = args.runtime ?? 'codex';
  const dryRun = args.dry_run === true;
  const exec = args.exec === true;
  if (!identity) throw new Error('identity_required');
  if (!ADMITTED_AGENTS.has(identity)) throw new Error(`agent_not_admitted:${identity}`);
  if (runtime !== 'codex') throw new Error(`runtime_not_admitted:${runtime}`);

  const event = startEvent(identity, runtime, dryRun);
  const eventPath = dryRun ? null : writeEvent(event);
  const runtimeArgs = codexArgs();
  const result = {
    schema: RESULT_SCHEMA,
    status: exec && !dryRun ? 'launching' : 'planned',
    identity,
    runtime,
    agent_start_event: event.event_id,
    event_path: eventPath,
    exec,
    dry_run: dryRun,
    runtime_args: runtimeArgs,
    exec_command: exec ? ['codex', ...runtimeArgs].join(' ') : null,
    required_environment: {
      NARADA_AGENT_ID: identity,
      NARADA_AGENT_START_EVENT_ID: event.event_id,
    },
    not_claimed: [
      'exact Codex resume binding',
      'operator-surface runtime binding',
      'operator-surface runtime copying',
      'source Site runtime state import',
      'secret or credential access',
    ],
  };

  console.log(JSON.stringify(result, null, 2));
  if (!exec || dryRun) return;

  const child = spawn('codex', runtimeArgs, {
    stdio: 'inherit',
    cwd: rootDir,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NARADA_AGENT_ID: identity,
      NARADA_AGENT_START_EVENT_ID: event.event_id,
    },
  });
  child.on('error', (error) => {
    console.error(`[FAIL] Failed to spawn runtime: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ schema: RESULT_SCHEMA, status: 'refused', refusals: [error instanceof Error ? error.message : String(error)] }, null, 2));
  process.exit(2);
}
