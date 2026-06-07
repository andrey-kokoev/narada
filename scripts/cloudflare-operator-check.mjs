#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stderr, stdout } from 'node:process';

const args = process.argv.slice(2);
const repoRoot = new URL('..', import.meta.url);
const envPath = new URL('.env', repoRoot);
const require = createRequire(import.meta.url);

loadLocalEnv(envPath);

if (flag('--help') || flag('-h')) {
  printHelp();
  process.exit(0);
}

const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_live_smoke';
const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const registryPath = option('--registry') ?? process.env.NARADA_SITE_CONTINUITY_REGISTRY ?? join(tmpdir(), 'narada-cloudflare-operator-continuity.db');
const expectToolEffectPosture = option('--expect-tool-effect-posture') ?? process.env.CLOUDFLARE_CARRIER_EXPECT_TOOL_EFFECT_POSTURE ?? 'configured';

if (flag('--write-env')) await writeLocalEnv({ workerUrl, tokenFile });
if (!workerUrl) fail('cloudflare_operator_check_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!tokenFile) fail('cloudflare_operator_check_requires_--token-file_or_CLOUDFLARE_CARRIER_TOKEN_FILE');

const tokenStat = await readableFileStat(tokenFile);
if (!tokenStat.ok) fail('cloudflare_operator_check_token_file_unreadable', { token_file: tokenFile, error: tokenStat.error });
const bearerToken = (await readFile(tokenFile, 'utf8')).trim();
if (!bearerToken) fail('cloudflare_operator_check_token_file_empty', { token_file: tokenFile });

const consoleCheck = await readConsole(workerUrl);
assert.equal(consoleCheck.http_status, 200);
assert.match(consoleCheck.body, /Narada Cloudflare Carrier/);
assert.match(consoleCheck.body, /naradaCloudflareCarrierClient/);
assert.match(consoleCheck.body, /auth\/microsoft\/login|Microsoft/i);

const smoke = await runJsonCommand('live-carrier-smoke', [
  'node',
  'packages/cloudflare-carrier/scripts/cloudflare-carrier-live-smoke.mjs',
  '--url',
  workerUrl,
  '--token-file',
  tokenFile,
  '--site',
  siteId,
  '--expect-tool-effect-posture',
  expectToolEffectPosture,
]);
assert.equal(smoke.status, 'ok');
assert.equal(smoke.worker_url, workerUrl);
assert.equal(smoke.principal_id, 'service');
assert.equal(smoke.provider_adapter_posture, 'cloudflare-workers-ai');
assert.equal(smoke.tool_effect_posture, expectToolEffectPosture);

const siteRead = await postCarrier(workerUrl, bearerToken, {
  operation: 'site.read',
  request_id: `operator_check_site_read_${Date.now()}`,
  params: {
    site_id: siteId,
    carrier_event_limit: 20,
    session_limit: 10,
  },
});
assert.equal(siteRead.http_status, 200);
assert.equal(siteRead.body.ok, true);
assert.equal((siteRead.body.site?.site_id ?? siteRead.body.site_id), siteId);
const memberships = siteRead.body.product?.memberships ?? siteRead.body.memberships ?? [];
const currentMembership = siteRead.body.product?.membership ?? siteRead.body.membership ?? null;
assert.ok(Array.isArray(memberships));
assert.ok(memberships.length > 0);

const continuityFirst = await runJsonCommand('site-continuity-loop:first', continuityCommand());
assert.equal(continuityFirst.status, 'ok');
assert.equal(continuityFirst.site_id, siteId);
assert.equal(continuityFirst.windows_packet_count, 1);

const continuitySecond = await runJsonCommand('site-continuity-loop:idempotent', continuityCommand());
assert.equal(continuitySecond.status, 'ok');
assert.equal(continuitySecond.windows_packet_count, 1);

const microsoftLoginUrl = new URL('/auth/microsoft/login', withTrailingSlash(workerUrl)).toString();
const apiClientPath = new URL('/api/carrier', withTrailingSlash(workerUrl)).toString();
const report = {
  schema: 'narada.cloudflare_operator_check.v1',
  status: 'ok',
  generated_at: new Date().toISOString(),
  site_id: siteId,
  worker_url: workerUrl,
  console_url: workerUrl,
  microsoft_login_url: microsoftLoginUrl,
  api_client_path: apiClientPath,
  credential_posture: {
    env_file_loaded: existsSync(envPath),
    url_source: option('--url') ? 'flag:--url' : 'env:CLOUDFLARE_CARRIER_URL',
    token_source: option('--token-file') ? 'flag:--token-file' : 'env:CLOUDFLARE_CARRIER_TOKEN_FILE',
    token_file_readable: true,
  },
  checks: {
    console_surface: 'ok',
    microsoft_login_surface: 'ok',
    live_carrier_smoke: 'ok',
    site_read: 'ok',
    membership_visibility: 'ok',
    continuity_loop: 'ok',
    continuity_idempotence: 'ok',
  },
  principal: {
    smoke_principal_id: smoke.principal_id,
    site_read_principal_id: siteRead.body.principal?.principal_id ?? siteRead.body.reader_principal?.principal_id ?? null,
  },
  membership: {
    count: memberships.length,
    current_role: currentMembership?.role ?? null,
  },
  carrier: {
    session_id: smoke.carrier_session_id,
    provider_adapter_posture: smoke.provider_adapter_posture,
    tool_effect_posture: smoke.tool_effect_posture,
    task_create_status: smoke.task_create_status,
    task_update_status: smoke.task_update_status,
    persisted_task_count: smoke.persisted_tasks?.length ?? 0,
  },
  continuity: {
    registry_path: registryPath,
    cloudflare_push_status: continuitySecond.cloudflare_push?.status ?? null,
    windows_packet_count: continuitySecond.windows_packet_count,
    windows_packet_ids: continuitySecond.windows_packets?.map((packet) => packet.packet_id) ?? [],
    authority_boundary: continuitySecond.authority_boundary,
  },
  enter: {
    console_url: workerUrl,
    microsoft_login_url: microsoftLoginUrl,
    site_id: siteId,
  },
};

stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function continuityCommand() {
  return [
    'node',
    'scripts/site-continuity-loop.mjs',
    'sync-cloudflare',
    '--site',
    siteId,
    '--url',
    workerUrl,
    '--token-file',
    tokenFile,
    '--registry',
    registryPath,
  ];
}

function loadLocalEnv(pathUrl) {
  if (!existsSync(pathUrl)) return;
  const text = require('node:fs').readFileSync(pathUrl, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = unquoteEnvValue(value);
  }
}

async function writeLocalEnv({ workerUrl, tokenFile }) {
  if (!workerUrl) fail('cloudflare_operator_write_env_requires_url');
  if (!tokenFile) fail('cloudflare_operator_write_env_requires_token_file');
  const content = [
    `CLOUDFLARE_CARRIER_URL=${workerUrl}`,
    `CLOUDFLARE_CARRIER_TOKEN_FILE=${tokenFile}`,
    '',
  ].join('\n');
  await writeFile(envPath, content, 'utf8');
}

async function readableFileStat(path) {
  try {
    const info = await stat(path);
    return { ok: info.isFile(), size: info.size };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function readConsole(baseUrl) {
  const response = await fetch(baseUrl);
  return {
    http_status: response.status,
    body: await response.text(),
  };
}

async function postCarrier(baseUrl, token, body) {
  const response = await fetch(new URL('/api/carrier', withTrailingSlash(baseUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { http_status: response.status, body: parsed };
}

async function runJsonCommand(label, command) {
  stderr.write(`[cloudflare:operator:check] ${label}\n`);
  const result = await spawnCapture(command[0], command.slice(1));
  if (result.code !== 0) {
    fail('cloudflare_operator_check_command_failed', {
      label,
      exit_code: result.code,
      stderr: tail(result.stderr),
      stdout: tail(result.stdout),
    });
  }
  try {
    return parseJsonObject(result.stdout);
  } catch (error) {
    fail('cloudflare_operator_check_command_json_parse_failed', {
      label,
      error: error.message,
      stdout: tail(result.stdout),
    });
  }
}

function spawnCapture(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: fileURLToPath(repoRoot),
      shell: process.platform === 'win32',
      env: process.env,
      windowsHide: true,
    });
    let childStdout = '';
    let childStderr = '';
    child.stdout.on('data', (chunk) => {
      childStdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      childStderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: childStdout, stderr: childStderr }));
  });
}

function parseJsonObject(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('json_object_not_found');
  return JSON.parse(output.slice(start, end + 1));
}

function tail(value, length = 1200) {
  return String(value ?? '').slice(-length);
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function flag(name) {
  return args.includes(name);
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function fail(code, detail = {}) {
  stderr.write(`${JSON.stringify({ ok: false, code, ...detail }, null, 2)}\n`);
  process.exit(1);
}

function printHelp() {
  stdout.write(`Narada Cloudflare operator check\n\nCommand:\n  pnpm cloudflare:operator:check [--site <site_id>]\n\nConfiguration:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --registry <registry.db> or NARADA_SITE_CONTINUITY_REGISTRY\n  --write-env writes --url and --token-file into the ignored root .env file\n\nEffect:\n  Loads the ignored root .env file.\n  Verifies the console and Microsoft login surface.\n  Runs the live carrier smoke through Workers AI and Cloudflare task effects.\n  Reads site membership/product state from the live Worker.\n  Runs the Windows/Cloudflare continuity loop twice to prove idempotent packet exchange.\n  Emits one JSON readiness report with console and login URLs, without printing token material.\n`);
}
