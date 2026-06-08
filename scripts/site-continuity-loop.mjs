#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, win32, posix } from 'node:path';
import { homedir } from 'node:os';
import { stdout, stderr } from 'node:process';
import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  classifySiteContinuityExchange,
  classifySiteContinuityExchangePacket,
  createSiteContinuityBinding,
  createSiteContinuityExchangePacket,
} from '../packages/site-continuity/src/site-continuity.mjs';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

async function writeLoopPacketFile(registryPathValue, packetSiteId, packet) {
  const safeSiteId = String(packetSiteId).replace(/[^A-Za-z0-9_.-]/g, '_');
  const path = `${dirname(registryPathValue)}${process.platform === 'win32' ? '\\' : '/'}site-continuity-loop-${safeSiteId}-${process.pid}.cloudflare-packet.json`;
  await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  return path;
}

function runWindowsContinuityCommand(commandArgs) {
  const result = spawnSync('pnpm', ['--filter', '@narada2/windows-site', 'continuity:windows', ...commandArgs], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    failJson('site_continuity_loop_windows_transport_failed', {
      command: commandArgs[0] ?? null,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return parsePnpmJsonOutput(result.stdout, commandArgs[0] ?? 'windows-command');
}

function parsePnpmJsonOutput(text, commandName) {
  const trimmed = String(text ?? '').trim();
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart < 0) failJson('site_continuity_loop_windows_transport_missing_json', { command: commandName, stdout: text });
  try {
    return JSON.parse(trimmed.slice(jsonStart));
  } catch (error) {
    failJson('site_continuity_loop_windows_transport_json_invalid', { command: commandName, error: error.message, stdout: text });
  }
}

if (command !== 'sync-cloudflare') fail(`unsupported_site_continuity_loop_command:${command}`);

const siteId = requiredOption('--site');
const generatedAt = option('--generated-at') ?? new Date().toISOString();
const registryPath = option('--registry') ?? resolveRegistryDbPath();
const workerUrl = option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? null;
const bearerToken = await resolveBearerToken();
const cloudflarePacketPath = option('--cloudflare-packet');
const skipCloudflarePush = flag('--skip-cloudflare-push');

if (!cloudflarePacketPath && (!workerUrl || !bearerToken)) {
  fail('site_continuity_loop_requires_cloudflare_packet_or_url_and_token');
}
if (!skipCloudflarePush && (!workerUrl || !bearerToken)) {
  fail('site_continuity_loop_push_requires_url_and_token_or_--skip-cloudflare-push');
}

const windowsPacket = createWindowsContinuityPacket({
  site_id: siteId,
  local_windows_site_ref: option('--local-site-ref') ?? `windows://site/${siteId}`,
  cloudflare_site_ref: option('--cloudflare-site-ref') ?? 'cloudflare-site',
  local_windows_authority_locus: option('--local-authority-locus') ?? 'local-windows-site-authority',
  cloudflare_authority_locus: option('--cloudflare-authority-locus') ?? 'cloudflare-carrier',
  authority_map_ref: option('--authority-map-ref') ?? 'site-authority-map:v1',
  generated_at: generatedAt,
});
const windowsPacketAdmission = classifySiteContinuityExchangePacket(windowsPacket);
if (windowsPacketAdmission.action === 'refuse') {
  failJson('site_continuity_loop_windows_packet_refused', { windows_packet_admission: windowsPacketAdmission });
}

const cloudflareRead = cloudflarePacketPath
  ? { source: 'file', body: await readJson(cloudflarePacketPath) }
  : { source: 'cloudflare.site.read', body: await readCloudflareSite(siteId) };
const cloudflarePacket = cloudflareRead.body?.packet ?? cloudflareRead.body?.site_continuity?.exchange_packet ?? cloudflareRead.body;
if (!cloudflarePacket || typeof cloudflarePacket !== 'object') fail('site_continuity_loop_missing_cloudflare_packet');
const cloudflarePacketAdmission = classifySiteContinuityExchangePacket(cloudflarePacket);
if (cloudflarePacketAdmission.action === 'refuse') {
  failJson('site_continuity_loop_cloudflare_packet_refused', { cloudflare_packet_admission: cloudflarePacketAdmission });
}
if (cloudflarePacket.target_embodiment_kind !== SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS) {
  failJson('site_continuity_loop_cloudflare_packet_target_mismatch', {
    expected_target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    actual_target_embodiment_kind: cloudflarePacket.target_embodiment_kind ?? null,
  });
}

const cloudflarePush = skipCloudflarePush
  ? { status: 'skipped', reason: 'skip_cloudflare_push_requested' }
  : await pushCloudflarePacket(siteId, windowsPacket);

await mkdir(dirname(registryPath), { recursive: true });
const cloudflareImportPacketPath = cloudflarePacketPath ?? await writeLoopPacketFile(registryPath, siteId, cloudflarePacket);
const windowsImport = runWindowsContinuityCommand([
  'import-windows',
  '--packet', cloudflareImportPacketPath,
  '--registry', registryPath,
  '--imported-at', option('--imported-at') ?? new Date().toISOString(),
]);
const windowsList = runWindowsContinuityCommand([
  'list-windows',
  '--site', siteId,
  '--registry', registryPath,
  '--limit', String(boundedLimit(option('--limit') ?? 100)),
]);
const windowsPackets = windowsList.site_continuity_packets ?? [];

const report = {
  schema: 'narada.site_continuity_productized_loop.v1',
  status: 'ok',
  site_id: siteId,
  generated_at: generatedAt,
  registry_path: registryPath,
  cloudflare_source: cloudflareRead.source,
  cloudflare_worker_url: workerUrl,
  cloudflare_credential_source: bearerToken?.source ?? null,
  windows_packet_admission: windowsPacketAdmission,
  cloudflare_packet_admission: cloudflarePacketAdmission,
  cloudflare_push: summarizeCloudflarePush(cloudflarePush),
  windows_import: windowsImport,
  windows_packet_count: windowsPackets.length,
  windows_packets: windowsPackets,
  authority_boundary: {
    executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
    durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
  },
};

report.cloudflare_report_push = (!skipCloudflarePush && workerUrl && bearerToken)
  ? summarizeCloudflareReportPush(await pushCloudflareLoopReport(siteId, report))
  : { status: 'skipped', reason: skipCloudflarePush ? 'skip_cloudflare_push_requested' : 'missing_cloudflare_url_or_token' };

await writeJson(option('--out'), report);

function createWindowsContinuityPacket(input) {
  const binding = createSiteContinuityBinding({
    site_id: input.site_id,
    local_windows_site_ref: input.local_windows_site_ref,
    cloudflare_site_ref: input.cloudflare_site_ref,
    local_windows_authority_locus: input.local_windows_authority_locus,
    cloudflare_authority_locus: input.cloudflare_authority_locus,
    authority_map_ref: input.authority_map_ref,
    generated_at: input.generated_at,
  });
  const fromWindowsToCloudflare = {
    site_id: input.site_id,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
  };
  const fromCloudflareToWindows = {
    site_id: input.site_id,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
  };
  const decisions = [
    classifySiteContinuityExchange(binding, {
      ...fromWindowsToCloudflare,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.SITE_IDENTITY_BINDING,
    }),
    classifySiteContinuityExchange(binding, {
      ...fromWindowsToCloudflare,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.AUTHORITY_MAP_PROJECTION,
    }),
    classifySiteContinuityExchange(binding, {
      ...fromWindowsToCloudflare,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
    }),
    classifySiteContinuityExchange(binding, {
      ...fromWindowsToCloudflare,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.MUTATION_EVIDENCE_REFERENCE,
    }),
    classifySiteContinuityExchange(binding, {
      ...fromCloudflareToWindows,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.CROSS_EMBODIMENT_MUTATION_EXECUTION,
    }),
  ];
  return createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    decisions,
    projections: [{
      projection_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
      source_cursor: input.generated_at,
      summary: 'Windows Site continuity read-model projection',
    }],
    evidence_refs: [],
    generated_at: input.generated_at,
  });
}

async function readCloudflareSite(readSiteId) {
  const response = await postCloudflare({ operation: 'site.read', params: { site_id: readSiteId } });
  if (response.http_status !== 200 || response.body?.ok === false) {
    failJson('site_continuity_loop_cloudflare_site_read_failed', response);
  }
  return response.body;
}

async function pushCloudflareLoopReport(pushSiteId, report) {
  const response = await postCloudflare({ operation: 'site.continuity.loop.report.put', params: { site_id: pushSiteId, report } });
  if (response.http_status !== 200 || response.body?.ok === false) {
    failJson('site_continuity_loop_cloudflare_report_push_failed', response);
  }
  return response.body;
}

async function pushCloudflarePacket(pushSiteId, packet) {
  const response = await postCloudflare({ operation: 'site.continuity.packet.put', params: { site_id: pushSiteId, packet } });
  if (response.http_status !== 200 || response.body?.ok === false) {
    failJson('site_continuity_loop_cloudflare_packet_push_failed', response);
  }
  return response.body;
}

async function postCloudflare(body) {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearerToken.value}`,
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

function apiUrl() {
  return new URL('/api/carrier', withTrailingSlash(workerUrl));
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function summarizeCloudflarePush(push) {
  if (push.status === 'skipped') return push;
  return {
    status: push.status ?? 'ok',
    site_continuity_packet_admission: push.site_continuity_packet_admission ?? null,
    packet_record: push.packet_record ?? null,
  };
}

function summarizeCloudflareReportPush(push) {
  return {
    status: push.status ?? 'ok',
    report_record: push.report_record ?? null,
  };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    failJson('site_continuity_loop_json_read_failed', { path, error: error.message });
  }
}

async function resolveBearerToken() {
  const flagToken = option('--token');
  if (flagToken) return { value: flagToken, source: 'flag:--token' };
  const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { value: (await readFile(tokenFile, 'utf8')).trim(), source: tokenFileSource(tokenFile) };
  if (process.env.CLOUDFLARE_CARRIER_TOKEN) return { value: process.env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function tokenFileSource(path) {
  return path === process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ? 'env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'flag:--token-file';
}

async function writeJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (path) {
    await writeFile(path, text, 'utf8');
    return;
  }
  stdout.write(text);
}

function resolveRegistryDbPath() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? (process.env.USERPROFILE ? win32.join(process.env.USERPROFILE, 'AppData', 'Local') : null);
    if (!localAppData) fail('cannot_resolve_windows_registry_path');
    return win32.join(localAppData, 'Narada', '.registry', 'registry.db');
  }
  return posix.join(homedir(), '.narada', 'registry.db');
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function flag(name) {
  return args.includes(name);
}

function requiredOption(name) {
  const value = option(name);
  if (!value) fail(`missing_required_option:${name}`);
  return value;
}

function boundedLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(1, Math.min(500, Math.trunc(numeric)));
}

function failJson(code, detail = {}) {
  stderr.write(`${JSON.stringify({ ok: false, code, ...detail }, null, 2)}\n`);
  process.exit(1);
}

function fail(code) {
  failJson(code);
}

function printHelp() {
  stdout.write(`Narada site-continuity product loop\n\nCommand:\n  sync-cloudflare --site <site_id> --url <worker-url> --token-file <path> [--registry <registry.db>]\n\nOffline verification:\n  sync-cloudflare --site <site_id> --cloudflare-packet <packet.json> --skip-cloudflare-push [--registry <registry.db>]\n\nOptions:\n  --token <bearer-token>\n  --token-file <path>\n  --out <report.json>\n  --generated-at <iso8601>\n  --imported-at <iso8601>\n  --local-site-ref <ref>\n  --cloudflare-site-ref <ref>\n  --local-authority-locus <locus>\n  --cloudflare-authority-locus <locus>\n  --authority-map-ref <ref>\n\nEffect:\n  Creates a Windows-to-Cloudflare packet.\n  Reads the Cloudflare-to-Windows packet from site.read, unless --cloudflare-packet is supplied.\n  Pushes the Windows packet through site.continuity.packet.put, unless --skip-cloudflare-push is supplied.\n  Imports the Cloudflare packet into the Windows continuity ledger.\n  Emits one operator evidence report without printing secret token material.\n`);
}
