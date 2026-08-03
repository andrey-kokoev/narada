#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachGlidePaths, SCHEMA_VERSION } from './core.js';
import { formatHuman, formatProviders } from './format.js';
import { launchOverlay, requestOverlayRefresh } from './overlay.js';
import { fetchProviders, selectProviders, supportedProviders } from './providers.js';

const VERSION = '0.1.0';

function help() {
  return `Usage: quota-meter <command> [options]

Commands:
  status                 Fetch current provider quotas
  glide-path             Fetch quotas and calculate glide-path factors
  overlay                Launch a transparent, always-on-top glide monitor
  refresh                Refresh a running overlay immediately
  providers              List supported providers

Options:
  --all                  Query all supported providers (default)
  --provider <list>      Comma-separated providers, e.g. codex,kimi
  --json                 Emit machine-readable JSON
  --pretty               Pretty-print JSON
  --no-login             Never prompt or launch native login
  --timeout <ms>         Provider request timeout (default: 15000)
  --refresh <seconds>    Overlay refresh interval (default: 60)
  --stop                 Stop the running overlay
  --restart              Restart the overlay and reload its saved position
  --version              Show version
  --help                 Show this help

Examples:
  quota-meter status
  quota-meter glide-path --all
  quota-meter glide-path --provider codex,kimi --json
  quota-meter overlay --provider codex,kimi
  quota-meter overlay --restart
  quota-meter overlay --stop
`;
}

function parseArgs(argv) {
  const options = {
    command: 'glide-path',
    providers: 'all',
    json: false,
    pretty: false,
    noLogin: false,
    timeoutMs: 15_000,
    refreshSeconds: 60,
    stop: false,
    restart: false,
  };

  let index = 0;
  const requiredValue = (option) => {
    const value = argv[index++];
    if (!value || value.startsWith('-')) throw new Error(`${option} requires a value`);
    return value;
  };
  if (argv[0] && !argv[0].startsWith('-')) {
    options.command = argv[0];
    index = 1;
  }

  while (index < argv.length) {
    const arg = argv[index++];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--pretty') options.pretty = true;
    else if (arg === '--all') options.providers = 'all';
    else if (arg === '--no-login') options.noLogin = true;
    else if (arg === '--stop') options.stop = true;
    else if (arg === '--provider' || arg === '--providers') options.providers = requiredValue(arg);
    else if (arg.startsWith('--provider=')) options.providers = arg.slice('--provider='.length);
    else if (arg === '--timeout') options.timeoutMs = Number(requiredValue(arg));
    else if (arg.startsWith('--timeout=')) options.timeoutMs = Number(arg.slice('--timeout='.length));
    else if (arg === '--refresh') options.refreshSeconds = Number(requiredValue(arg));
    else if (arg.startsWith('--refresh=')) options.refreshSeconds = Number(arg.slice('--refresh='.length));
    else if (arg === '--restart') options.restart = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!['status', 'glide-path', 'overlay', 'refresh', 'providers'].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout must be a positive number');
  }
  if (!Number.isFinite(options.refreshSeconds) || options.refreshSeconds < 5 || options.refreshSeconds > 3600) {
    throw new Error('--refresh must be between 5 and 3600 seconds');
  }
  if (options.stop && options.command !== 'overlay') {
    throw new Error('--stop is only valid with the overlay command');
  }
  if (options.restart && options.command !== 'overlay') {
    throw new Error('--restart is only valid with the overlay command');
  }
  if (options.stop && options.restart) {
    throw new Error('--stop and --restart cannot be used together');
  }
  return options;
}

function exitCode(payload) {
  if (payload.providers.every((provider) => provider.status === 'ok')) return 0;
  if (payload.providers.some((provider) => provider.status === 'auth_required')) return 2;
  return 1;
}

export function canPromptForLogin(options, input = process.stdin, output = process.stdout) {
  return !options.noLogin && Boolean(input.isTTY && output.isTTY);
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) return { code: 0, output: help() };
  if (options.version) return { code: 0, output: `quota-meter ${VERSION}` };
  if (options.command === 'providers') {
    return {
      code: 0,
      output: options.json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, providers: supportedProviders() }, null, options.pretty ? 2 : 0)
        : formatProviders(supportedProviders()),
    };
  }
  if (options.command === 'refresh') {
    const refreshPath = await requestOverlayRefresh(env);
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      command: 'refresh',
      status: 'requested',
    };
    return {
      code: 0,
      output: options.json ? JSON.stringify(payload, null, options.pretty ? 2 : 0) : `quota-meter overlay refresh requested (${refreshPath})`,
    };
  }
  if (options.command === 'overlay') {
    return launchOverlay(options, env);
  }

  const names = selectProviders(options.providers);
  const results = await fetchProviders(names, {
    env,
    timeoutMs: options.timeoutMs,
    version: VERSION,
    interactive: canPromptForLogin(options),
    json: options.json,
    noLogin: options.noLogin,
  });
  const enriched = results.map((result) => attachGlidePaths(result));

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    command: options.command,
    providers: enriched,
  };

  return {
    code: exitCode(payload),
    output: options.json ? JSON.stringify(payload, null, options.pretty ? 2 : 0) : formatHuman(payload),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  run().then(({ code, output }) => {
    process.stdout.write(`${output}\n`);
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`quota-meter: ${error.message}\n`);
    process.exitCode = 1;
  });
}