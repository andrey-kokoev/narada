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
const CANONICAL_CLOUDFLARE_SITE_ID = 'site_narada_cloudflare';
const CANONICAL_CLOUDFLARE_SITE_REF = 'cloudflare://narada-cloudflare-carrier';
const CANONICAL_CLOUDFLARE_OPERATION_ID = 'operation_narada_cloudflare_control';

loadLocalEnv(envPath);

if (flag('--help') || flag('-h')) {
  printHelp();
  process.exit(0);
}

const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? CANONICAL_CLOUDFLARE_SITE_ID;
const siteRef = option('--site-ref') ?? process.env.CLOUDFLARE_CARRIER_SITE_REF ?? CANONICAL_CLOUDFLARE_SITE_REF;
const operationId = option('--operation') ?? process.env.CLOUDFLARE_CARRIER_OPERATION_ID ?? CANONICAL_CLOUDFLARE_OPERATION_ID;
const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const operatorCookieFile = option('--operator-cookie-file') ?? process.env.CLOUDFLARE_OPERATOR_COOKIE_FILE ?? '';
const registryPath = option('--registry') ?? process.env.NARADA_SITE_CONTINUITY_REGISTRY ?? join(tmpdir(), 'narada-cloudflare-operator-continuity.db');
const expectToolEffectPosture = option('--expect-tool-effect-posture') ?? process.env.CLOUDFLARE_CARRIER_EXPECT_TOOL_EFFECT_POSTURE ?? 'configured';
const requireOperatorSession = flag('--require-operator-session');

if (flag('--write-env')) await writeLocalEnv({ workerUrl, tokenFile });
if (!workerUrl) fail('cloudflare_operator_check_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!tokenFile) fail('cloudflare_operator_check_requires_--token-file_or_CLOUDFLARE_CARRIER_TOKEN_FILE');
if (requireOperatorSession && !operatorCookieFile) fail('cloudflare_operator_check_requires_--operator-cookie-file');

const tokenStat = await readableFileStat(tokenFile);
if (!tokenStat.ok) fail('cloudflare_operator_check_token_file_unreadable', { token_file: tokenFile, error: tokenStat.error });
const bearerToken = (await readFile(tokenFile, 'utf8')).trim();
if (!bearerToken) fail('cloudflare_operator_check_token_file_empty', { token_file: tokenFile });

const consoleCheck = await readConsole(workerUrl);
assert.equal(consoleCheck.http_status, 200);
assert.match(consoleCheck.body, /Narada Cloudflare Carrier/);
assert.match(consoleCheck.body, /naradaCloudflareCarrierClient/);
assert.match(consoleCheck.body, /auth\/microsoft\/login|Microsoft/i);
assert.match(consoleCheck.body, /Operation Surface/);
assert.match(consoleCheck.body, /Operation ID/);
assert.match(consoleCheck.body, /Operation Sessions/);
assert.match(consoleCheck.body, /Active Session/);
assert.match(consoleCheck.body, /Control Room/);
assert.match(consoleCheck.body, /Session Focus/);
assert.match(consoleCheck.body, /Session Navigator/);
assert.match(consoleCheck.body, /sessionNavigator/);
assert.match(consoleCheck.body, /renderSessionNavigator/);
assert.match(consoleCheck.body, /selectOperationSession/);
assert.match(consoleCheck.body, /session-item/);
assert.match(consoleCheck.body, /Authority Locus/);
assert.match(consoleCheck.body, /Authority Focus/);
assert.match(consoleCheck.body, /Authority State/);
assert.match(consoleCheck.body, /controlAuthorityFocus/);
assert.match(consoleCheck.body, /authorityState/);
assert.match(consoleCheck.body, /Task Focus/);
assert.match(consoleCheck.body, /Operation Attention/);
assert.match(consoleCheck.body, /Raise Attention/);
assert.match(consoleCheck.body, /Task From Attention/);
assert.match(consoleCheck.body, /Resolve Attention/);
assert.match(consoleCheck.body, /Evidence Window/);
assert.match(consoleCheck.body, /Evidence Focus/);
assert.match(consoleCheck.body, /evidence-summary/);
assert.match(consoleCheck.body, /evidence-field/);
assert.match(consoleCheck.body, /evidenceMeaning/);
assert.match(consoleCheck.body, /evidenceActionContext/);
assert.match(consoleCheck.body, /compactEvidenceValue/);
assert.match(consoleCheck.body, /controlEvidenceFocus/);
assert.match(consoleCheck.body, /Evidence Filter/);
assert.match(consoleCheck.body, /Session Filter/);
assert.match(consoleCheck.body, /updateControlRoom/);
assert.match(consoleCheck.body, /extractOperationAttention/);
assert.match(consoleCheck.body, /renderAttentionQueue/);
assert.match(consoleCheck.body, /selectedAttention/);
assert.match(consoleCheck.body, /resolved_attention/);
assert.match(consoleCheck.body, /controlAttention/);
assert.match(consoleCheck.body, /directive\.emit/);
assert.match(consoleCheck.body, /operation_attention/);
assert.match(consoleCheck.body, /visibleEvents/);
assert.match(consoleCheck.body, /focusEvidence/);
assert.match(consoleCheck.body, /focusEvidenceFor/);
assert.match(consoleCheck.body, /renderEvidenceFocus/);
assert.match(consoleCheck.body, /eventTitle/);
assert.match(consoleCheck.body, /event selected/);
assert.match(consoleCheck.body, /refreshEventKindFilter/);
assert.match(consoleCheck.body, /Use Session/);
assert.match(consoleCheck.body, /Update Task/);
assert.match(consoleCheck.body, /Auto Refresh/);
assert.match(consoleCheck.body, /narada\.cloudflare\.operationWorkbench\.v1/);
assert.match(consoleCheck.body, /loadWorkbenchState/);
assert.match(consoleCheck.body, /saveWorkbenchState/);
assert.match(consoleCheck.body, /console_action_failed/);
assert.match(consoleCheck.body, /appendConsoleEvidence/);
assert.match(consoleCheck.body, /operation\.read/);
assert.match(consoleCheck.body, /operation_product_surface/);
assert.match(consoleCheck.body, /Continuity Packets/);
assert.match(consoleCheck.body, /Authority Decisions/);
assert.match(consoleCheck.body, /renderAuthorityState/);
assert.match(consoleCheck.body, /authority-decision/);
assert.match(consoleCheck.body, /credentials: 'same-origin'/);

const smoke = await runJsonCommand('live-carrier-smoke', [
  'node',
  'packages/cloudflare-carrier/scripts/cloudflare-carrier-live-smoke.mjs',
  '--url',
  workerUrl,
  '--token-file',
  tokenFile,
  '--site',
  siteId,
  '--operation',
  operationId,
  '--site-root',
  siteRef,
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
const operations = siteRead.body.product?.operations ?? siteRead.body.operations ?? [];
assert.ok(Array.isArray(memberships));
assert.ok(memberships.length > 0);
assert.ok(Array.isArray(operations));

const operationRead = await postCarrier(workerUrl, bearerToken, {
  operation: 'operation.read',
  request_id: `operator_check_operation_read_${Date.now()}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    carrier_event_limit: 20,
    session_limit: 10,
  },
});
assert.equal(operationRead.http_status, 200);
assert.equal(operationRead.body.ok, true);
assert.equal(operationRead.body.operation?.operation_id, operationId);
assert.equal(operationRead.body.operation?.site_id, siteId);
assert.equal(operationRead.body.operation?.status, 'active');
assert.equal(operationRead.body.sessions?.some((session) => session.carrier_session_id === smoke.carrier_session_id), true);
assert.equal(operationRead.body.tasks?.some((task) => task.carrier_session_id === smoke.carrier_session_id), true);
assert.equal(operationRead.body.carrier_evidence?.some((entry) => entry.carrier_session_id === smoke.carrier_session_id && entry.ok === true), true);
assert.equal(operationRead.body.operation_product_surface?.operation_id, operationId);
assert.ok(operationRead.body.operation_product_surface?.session_count >= 1);
assert.ok(operationRead.body.operation_product_surface?.task_count >= 1);

const humanOperator = await checkHumanOperatorSession({
  workerUrl,
  siteId,
  operatorCookieFile,
  required: requireOperatorSession,
});

const continuityFirst = await runJsonCommand('site-continuity-loop:first', continuityCommand());
assert.equal(continuityFirst.status, 'ok');
assert.equal(continuityFirst.site_id, siteId);
assert.equal(continuityFirst.windows_packet_count, 1);

const continuitySecond = await runJsonCommand('site-continuity-loop:idempotent', continuityCommand());
assert.equal(continuitySecond.status, 'ok');
assert.equal(continuitySecond.windows_packet_count, 1);

const operationReadAfterContinuity = await postCarrier(workerUrl, bearerToken, {
  operation: 'operation.read',
  request_id: `operator_check_operation_continuity_read_${Date.now()}`,
  params: {
    site_id: siteId,
    operation_id: operationId,
    carrier_event_limit: 20,
    session_limit: 10,
  },
});
assert.equal(operationReadAfterContinuity.http_status, 200);
assert.equal(operationReadAfterContinuity.body.ok, true);
const operationSurface = operationReadAfterContinuity.body.operation_product_surface;
const operationContinuityPackets = operationReadAfterContinuity.body.site_continuity_packets ?? [];
assert.equal(operationSurface?.operation_id, operationId);
assert.ok(Array.isArray(operationContinuityPackets));
assert.ok(operationContinuityPackets.length >= 1);
assert.equal(operationSurface?.continuity_packet_count, operationContinuityPackets.length);

const microsoftLoginUrl = new URL('/auth/microsoft/login', withTrailingSlash(workerUrl)).toString();
const apiClientPath = new URL('/api/carrier', withTrailingSlash(workerUrl)).toString();
const report = {
  schema: 'narada.cloudflare_operator_check.v1',
  status: 'ok',
  generated_at: new Date().toISOString(),
  site_id: siteId,
  site_ref: siteRef,
  operation_id: operationId,
  worker_url: workerUrl,
  console_url: workerUrl,
  microsoft_login_url: microsoftLoginUrl,
  api_client_path: apiClientPath,
  credential_posture: {
    env_file_loaded: existsSync(envPath),
    url_source: option('--url') ? 'flag:--url' : 'env:CLOUDFLARE_CARRIER_URL',
    token_source: option('--token-file') ? 'flag:--token-file' : 'env:CLOUDFLARE_CARRIER_TOKEN_FILE',
    token_file_readable: true,
    operator_cookie_source: operatorCookieFile ? (option('--operator-cookie-file') ? 'flag:--operator-cookie-file' : 'env:CLOUDFLARE_OPERATOR_COOKIE_FILE') : null,
  },
  checks: {
    console_surface: 'ok',
    microsoft_login_surface: 'ok',
    live_carrier_smoke: 'ok',
    site_read: 'ok',
    membership_visibility: 'ok',
    operation_read: 'ok',
    canonical_operation_active: 'ok',
    operation_inhabited_by_live_work: 'ok',
    operation_continuity_packets: 'ok',
    human_operator_session: humanOperator.status,
    human_operator_membership: humanOperator.membership_status,
    human_operator_operation_read: humanOperator.operation_status,
    continuity_loop: 'ok',
    continuity_idempotence: 'ok',
  },
  service_principal_ready: true,
  human_operator_login_ready: humanOperator.login_ready,
  human_operator_membership_ready: humanOperator.membership_ready,
  principal: {
    smoke_principal_id: smoke.principal_id,
    site_read_principal_id: siteRead.body.principal?.principal_id ?? siteRead.body.reader_principal?.principal_id ?? null,
    human_operator_principal_id: humanOperator.principal?.principal_id ?? null,
    human_operator_email: humanOperator.principal?.email ?? null,
  },
  membership: {
    count: memberships.length,
    current_role: currentMembership?.role ?? null,
  },
  operation: {
    operation_id: operationRead.body.operation.operation_id,
    display_name: operationRead.body.operation.display_name,
    operation_kind: operationRead.body.operation.operation_kind,
    status: operationRead.body.operation.status,
    listed_on_site_read: operations.some((operation) => operation.operation_id === operationId),
    session_count: operationSurface.session_count,
    task_count: operationSurface.task_count,
    carrier_evidence_count: operationSurface.carrier_evidence_count,
    continuity_packet_count: operationSurface.continuity_packet_count,
    smoke_session_bound: operationRead.body.sessions.some((session) => session.carrier_session_id === smoke.carrier_session_id),
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
    operator_session_check: operatorCookieFile ? 'verified' : 'provide --operator-cookie-file to verify the current browser operator session',
    site_id: siteId,
    operation_id: operationId,
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

async function checkHumanOperatorSession({ workerUrl, siteId, operatorCookieFile, required }) {
  if (!operatorCookieFile) {
    if (required) fail('cloudflare_operator_check_requires_--operator-cookie-file');
    return {
      status: 'not_checked',
      membership_status: 'not_checked',
      operation_status: 'not_checked',
      login_ready: 'surface_only',
      membership_ready: 'not_checked',
      principal: null,
      membership: null,
    };
  }
  const cookieStat = await readableFileStat(operatorCookieFile);
  if (!cookieStat.ok) fail('cloudflare_operator_cookie_file_unreadable', { operator_cookie_file: operatorCookieFile, error: cookieStat.error });
  const cookieHeader = normalizeCookieHeader(await readFile(operatorCookieFile, 'utf8'));
  if (!cookieHeader) fail('cloudflare_operator_cookie_file_empty', { operator_cookie_file: operatorCookieFile });

  const session = await getOperatorSession(workerUrl, cookieHeader);
  assert.equal(session.http_status, 200);
  assert.equal(session.body.ok, true);
  assert.equal(session.body.principal?.auth_type, 'microsoft_oidc');

  const siteReadAsOperator = await postCarrierWithCookie(workerUrl, cookieHeader, {
    operation: 'site.read',
    request_id: `operator_check_human_site_read_${Date.now()}`,
    params: {
      site_id: siteId,
      carrier_event_limit: 10,
      session_limit: 5,
    },
  });
  assert.equal(siteReadAsOperator.http_status, 200);
  assert.equal(siteReadAsOperator.body.ok, true);
  const humanMembership = siteReadAsOperator.body.product?.membership ?? siteReadAsOperator.body.membership ?? null;
  assert.ok(humanMembership);
  assert.equal(humanMembership.status, 'active');

  const operationReadAsOperator = await postCarrierWithCookie(workerUrl, cookieHeader, {
    operation: 'operation.read',
    request_id: `operator_check_human_operation_read_${Date.now()}`,
    params: {
      site_id: siteId,
      operation_id: operationId,
      carrier_event_limit: 10,
      session_limit: 5,
    },
  });
  assert.equal(operationReadAsOperator.http_status, 200);
  assert.equal(operationReadAsOperator.body.ok, true);
  assert.equal(operationReadAsOperator.body.operation?.operation_id, operationId);
  assert.equal(operationReadAsOperator.body.operation?.status, 'active');
  assert.ok(operationReadAsOperator.body.operation_product_surface?.session_count >= 1);
  return {
    status: 'ok',
    membership_status: 'ok',
    operation_status: 'ok',
    login_ready: true,
    membership_ready: true,
    principal: session.body.principal,
    membership: humanMembership,
  };
}

async function getOperatorSession(baseUrl, cookieHeader) {
  const response = await fetch(new URL('/auth/session', withTrailingSlash(baseUrl)), {
    headers: { cookie: cookieHeader },
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

async function postCarrierWithCookie(baseUrl, cookieHeader, body) {
  const response = await fetch(new URL('/api/carrier', withTrailingSlash(baseUrl)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
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

function normalizeCookieHeader(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (/^cookie\s*:/i.test(trimmed)) return trimmed.replace(/^cookie\s*:/i, '').trim();
  if (trimmed.includes('narada_operator_session=')) return trimmed.split(/\r?\n/).find((line) => line.includes('narada_operator_session='))?.trim() ?? '';
  return `narada_operator_session=${trimmed}`;
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
  stdout.write(`Narada Cloudflare operator check\n\nCommand:\n  pnpm cloudflare:operator:check [--site <site_id>]\n\nConfiguration:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --operator-cookie-file <path> or CLOUDFLARE_OPERATOR_COOKIE_FILE\n  --operation <operation_id> or CLOUDFLARE_CARRIER_OPERATION_ID\n  --require-operator-session fails when no operator cookie file is supplied\n  --registry <registry.db> or NARADA_SITE_CONTINUITY_REGISTRY\n  --write-env writes --url and --token-file into the ignored root .env file\n\nEffect:\n  Loads the ignored root .env file.\n  Verifies the console and Microsoft login surface.\n  Optionally verifies the current Microsoft operator session, site membership, and Operation visibility from a browser cookie file.\n  Runs the live carrier smoke through Workers AI and Cloudflare task effects.\n  Reads site membership/product state and the canonical active Operation from the live Worker.\n  Runs the Windows/Cloudflare continuity loop twice to prove idempotent packet exchange.\n  Emits one JSON readiness report with console and login URLs, without printing token material.\n`);
}
