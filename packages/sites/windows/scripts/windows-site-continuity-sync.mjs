#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, win32, posix } from 'node:path';
import { homedir } from 'node:os';
import { stdin, stdout, stderr } from 'node:process';
import Database from '@narada2/sqlite';
import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  classifySiteContinuityExchange,
  classifySiteContinuityExchangePacket,
  createSiteContinuityBinding,
  createSiteContinuityExchangePacket,
  createSiteContinuityPacketId,
} from '../../../site-continuity/src/site-continuity.mjs';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'export-windows') {
  const siteId = requiredOption('--site');
  const packet = createWindowsContinuityPacket({
    site_id: siteId,
    local_windows_site_ref: option('--local-site-ref') ?? `windows://site/${siteId}`,
    cloudflare_site_ref: option('--cloudflare-site-ref') ?? 'cloudflare-site',
    local_windows_authority_locus: option('--local-authority-locus') ?? 'local-windows-site-authority',
    cloudflare_authority_locus: option('--cloudflare-authority-locus') ?? 'cloudflare-carrier',
    authority_map_ref: option('--authority-map-ref') ?? 'site-authority-map:v1',
    generated_at: option('--generated-at') ?? new Date().toISOString(),
  });
  const admission = classifySiteContinuityExchangePacket(packet);
  if (admission.action === 'refuse') failJson('windows_site_continuity_packet_refused_before_export', { admission });
  await writeJson(option('--out'), {
    schema: 'narada.site_continuity_windows_export.v1',
    status: 'ok',
    site_id: siteId,
    site_continuity_packet_admission: admission,
    packet,
  });
  process.exit(0);
}

if (command === 'import-windows') {
  const packetEnvelope = await readPacketEnvelope();
  const packet = packetEnvelope?.packet ?? packetEnvelope;
  if (!packet || typeof packet !== 'object') fail('windows_site_continuity_import_requires_packet_json');
  const admission = classifySiteContinuityExchangePacket(packet);
  if (admission.action === 'refuse') failJson('windows_site_continuity_packet_refused_before_import', { admission });
  if (packet.target_embodiment_kind !== SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS) {
    failJson('windows_site_continuity_packet_target_mismatch', {
      expected_target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
      actual_target_embodiment_kind: packet.target_embodiment_kind ?? null,
    });
  }
  if (!packet.site_id) fail('windows_site_continuity_packet_site_id_missing');
  const dbPath = option('--registry') ?? resolveRegistryDbPath();
  await mkdir(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    ensureContinuityPacketSchema(db);
    const record = importContinuityPacket(db, packet, admission, option('--imported-at') ?? new Date().toISOString());
    await writeJson(option('--out'), {
      schema: 'narada.site_continuity_windows_import.v1',
      status: 'ok',
      registry_path: dbPath,
      site_id: packet.site_id,
      site_continuity_packet_admission: admission,
      packet_record: record,
    });
  } finally {
    db.close();
  }
  process.exit(0);
}

if (command === 'list-windows') {
  const siteId = requiredOption('--site');
  const dbPath = option('--registry') ?? resolveRegistryDbPath();
  const db = new Database(dbPath);
  try {
    ensureContinuityPacketSchema(db);
    await writeJson(option('--out'), {
      schema: 'narada.site_continuity_windows_list.v1',
      status: 'ok',
      registry_path: dbPath,
      site_id: siteId,
      site_continuity_packets: listContinuityPackets(db, siteId, boundedLimit(option('--limit') ?? 100)),
    });
  } finally {
    db.close();
  }
  process.exit(0);
}

fail(`unsupported_windows_site_continuity_sync_command:${command}`);

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

function ensureContinuityPacketSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_continuity_packets (
      packet_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      relation_id TEXT,
      source_embodiment_kind TEXT NOT NULL,
      target_embodiment_kind TEXT NOT NULL,
      admission_action TEXT NOT NULL,
      admission_reason TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_site_continuity_packets_site_id ON site_continuity_packets(site_id, imported_at);
  `);
}

function importContinuityPacket(db, packet, admission, importedAt) {
  const packetId = packet.packet_id ?? createSiteContinuityPacketId(packet);
  const packetJson = JSON.stringify(packet);
  db.prepare(`INSERT INTO site_continuity_packets (
    packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
    admission_action, admission_reason, packet_json, imported_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(packet_id) DO UPDATE SET
    admission_action = excluded.admission_action,
    admission_reason = excluded.admission_reason,
    packet_json = excluded.packet_json,
    imported_at = excluded.imported_at`).run(
    packetId,
    packet.site_id,
    packet.relation_id ?? null,
    packet.source_embodiment_kind,
    packet.target_embodiment_kind,
    admission.action,
    admission.reason,
    packetJson,
    importedAt,
  );
  return {
    packet_id: packetId,
    site_id: packet.site_id,
    relation_id: packet.relation_id ?? null,
    source_embodiment_kind: packet.source_embodiment_kind,
    target_embodiment_kind: packet.target_embodiment_kind,
    admission_action: admission.action,
    admission_reason: admission.reason,
    imported_at: importedAt,
  };
}

function listContinuityPackets(db, siteId, limit) {
  return db.prepare(`SELECT packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
    admission_action, admission_reason, imported_at
    FROM site_continuity_packets WHERE site_id = ? ORDER BY imported_at DESC LIMIT ?`).all(siteId, limit);
}

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
    failJson('windows_site_continuity_packet_json_invalid', { error: error.message });
  }
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

function resolveRegistryDbPath() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? (process.env.USERPROFILE ? win32.join(process.env.USERPROFILE, 'AppData', 'Local') : null);
    if (!localAppData) fail('cannot_resolve_windows_registry_path');
    return win32.join(localAppData, 'Narada', '.registry', 'registry.db');
  }
  return posix.join(homedir(), '.narada', 'registry.db');
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
  stdout.write(`Narada Windows site-continuity transport\n\nCommands:\n  export-windows --site <site_id> [--out <packet.json>]\n  import-windows --packet <packet.json> [--registry <registry.db>] [--out <result.json>]\n  list-windows --site <site_id> [--registry <registry.db>] [--out <result.json>]\n\nOptions:\n  --local-site-ref <ref>\n  --cloudflare-site-ref <ref>\n  --local-authority-locus <locus>\n  --cloudflare-authority-locus <locus>\n  --authority-map-ref <ref>\n\nNotes:\n  export-windows emits a local_windows to cloudflare_carrier continuity packet.\n  import-windows only admits packets targeted at local_windows.\n  The script refuses invalid/executable-mutation packets before writing the registry ledger.\n`);
}
