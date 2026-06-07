#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { stdin, stdout, stderr } from 'node:process';
import { classifySiteContinuityExchangePacket } from '../../site-continuity/src/site-continuity.mjs';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

const workerUrl = option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL;
const bearerToken = await resolveBearerToken();

if (!workerUrl) fail('site_continuity_sync_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) fail('site_continuity_sync_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');

if (command === 'pull-cloudflare') {
  const siteId = requiredOption('--site');
  const read = await post({ operation: 'site.read', params: { site_id: siteId } });
  if (read.http_status !== 200 || read.body?.ok === false) failApi('cloudflare_site_read_failed', read);
  const packet = read.body?.site_continuity?.exchange_packet;
  if (!packet) fail('cloudflare_site_read_missing_site_continuity_exchange_packet');
  const admission = classifySiteContinuityExchangePacket(packet);
  if (admission.action === 'refuse') {
    failJson('cloudflare_site_continuity_packet_refused_before_export', { admission });
  }
  await writeJson(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_pull.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    site_continuity_packet_admission: admission,
    packet,
  });
  process.exit(0);
}

if (command === 'push-cloudflare') {
  const packetEnvelope = await readPacketEnvelope();
  const packet = packetEnvelope?.packet ?? packetEnvelope;
  if (!packet || typeof packet !== 'object') fail('site_continuity_push_requires_packet_json');
  const admission = classifySiteContinuityExchangePacket(packet);
  if (admission.action === 'refuse') {
    failJson('site_continuity_packet_refused_before_push', { admission });
  }
  const siteId = option('--site') ?? packet.site_id;
  if (!siteId) fail('site_continuity_push_requires_--site_or_packet_site_id');
  const pushed = await post({ operation: 'site.continuity.packet.put', params: { site_id: siteId, packet } });
  if (pushed.http_status !== 200 || pushed.body?.ok === false) failApi('cloudflare_site_continuity_packet_push_failed', pushed);
  await writeJson(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_push.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    local_packet_admission: admission,
    cloudflare_response: pushed.body,
  });
  process.exit(0);
}

if (command === 'read-cloudflare') {
  const siteId = requiredOption('--site');
  const read = await post({ operation: 'site.read', params: { site_id: siteId } });
  if (read.http_status !== 200 || read.body?.ok === false) failApi('cloudflare_site_read_failed', read);
  await writeJson(option('--out'), {
    schema: 'narada.site_continuity_cloudflare_read.v1',
    status: 'ok',
    site_id: siteId,
    worker_url: workerUrl,
    site_continuity: read.body.site_continuity ?? null,
    site_continuity_packets: read.body.site_continuity_packets ?? [],
  });
  process.exit(0);
}

fail(`unsupported_site_continuity_sync_command:${command}`);

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function requiredOption(name) {
  const value = option(name);
  if (!value) fail(`missing_required_option:${name}`);
  return value;
}

async function readPacketEnvelope() {
  const packetPath = option('--packet');
  const text = packetPath ? await readFile(packetPath, 'utf8') : await readAllStdin();
  try {
    return JSON.parse(text);
  } catch (error) {
    failJson('site_continuity_packet_json_invalid', { error: error.message });
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

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function writeJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (path) {
    await writeFile(path, text, 'utf8');
    return;
  }
  stdout.write(text);
}

async function post(body) {
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

function failApi(code, response) {
  failJson(code, {
    http_status: response.http_status,
    body: response.body,
  });
}

function failJson(code, detail = {}) {
  stderr.write(`${JSON.stringify({ ok: false, code, ...detail }, null, 2)}\n`);
  process.exit(1);
}

function fail(code) {
  failJson(code);
}

function printHelp() {
  stdout.write(`Narada Cloudflare site-continuity transport\n\nCommands:\n  pull-cloudflare --site <site_id> [--out <packet.json>]\n  push-cloudflare --packet <packet.json> [--site <site_id>] [--out <result.json>]\n  read-cloudflare --site <site_id> [--out <result.json>]\n\nAuth:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --token-file <path> or CLOUDFLARE_CARRIER_TOKEN_FILE\n  --token <bearer-token> or CLOUDFLARE_CARRIER_TOKEN\n\nNotes:\n  pull-cloudflare exports the packet emitted by site.read.\n  push-cloudflare imports a packet through site.continuity.packet.put.\n  The script refuses locally invalid/executable-mutation packets before sending them.\n`);
}
