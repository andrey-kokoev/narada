#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from '@narada2/sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..', '..');

const dbDir = resolve(siteRoot, '.ai', 'db');
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const dbPath = resolve(dbDir, 'operator-surface.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───

db.exec(`
  CREATE TABLE IF NOT EXISTS operator_surface_sites (
    site_id TEXT PRIMARY KEY,
    affinity_color TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS operator_surface_roles (
    role TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    affinity_color TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS operator_surface_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id TEXT NOT NULL UNIQUE,
    identity_name TEXT NOT NULL UNIQUE,
    agent_name TEXT NOT NULL,
    role TEXT NOT NULL,
    agent_kind TEXT NOT NULL,
    site_id TEXT NOT NULL,
    label TEXT,
    display_name TEXT,
    deprecated INTEGER NOT NULL DEFAULT 0,
    superseded_by TEXT,
    previous_identity_ids_json TEXT,
    migration_history_json TEXT,
    narada_site_relation_json TEXT NOT NULL,
    role_metadata_json TEXT NOT NULL,
    projection_intent_json TEXT,
    distinct_from_json TEXT,
    carrier_projections_json TEXT,
    label_projection_json TEXT,
    input_capabilities_json TEXT,
    submit_strategy TEXT,
    authority_limits_json TEXT,
    admitted_by TEXT NOT NULL,
    admitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revoked_at TEXT,
    revoked_by TEXT,
    FOREIGN KEY (site_id) REFERENCES operator_surface_sites(site_id),
    FOREIGN KEY (role) REFERENCES operator_surface_roles(role)
  );

  CREATE INDEX IF NOT EXISTS idx_identities_site_id ON operator_surface_identities(site_id);
  CREATE INDEX IF NOT EXISTS idx_identities_role ON operator_surface_identities(role);
  CREATE INDEX IF NOT EXISTS idx_identities_deprecated ON operator_surface_identities(deprecated);
  CREATE INDEX IF NOT EXISTS idx_identities_revoked ON operator_surface_identities(revoked_at);

  CREATE TABLE IF NOT EXISTS operator_surface_identity_admission_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identity_id TEXT NOT NULL,
    event_kind TEXT NOT NULL CHECK(event_kind IN ('admitted','updated','deprecated','revoked','migrated','generated')),
    event_at TEXT NOT NULL,
    event_by TEXT NOT NULL,
    payload_json TEXT,
    source TEXT NOT NULL DEFAULT 'migration',
    FOREIGN KEY (identity_id) REFERENCES operator_surface_identities(identity_id)
  );

  CREATE INDEX IF NOT EXISTS idx_admission_log_identity ON operator_surface_identity_admission_log(identity_id);
  CREATE INDEX IF NOT EXISTS idx_admission_log_event_at ON operator_surface_identity_admission_log(event_at);
`);

console.log('Schema created at:', dbPath);

// ─── Migrate from identities.json ───

const identitiesPath = resolve(siteRoot, 'operator-surfaces', 'identities.json');
if (!existsSync(identitiesPath)) {
  console.log('No identities.json found at', identitiesPath);
  db.close();
  process.exit(0);
}

const data = JSON.parse(readFileSync(identitiesPath, 'utf8'));
const now = new Date().toISOString();

const insertSite = db.prepare(`
  INSERT OR REPLACE INTO operator_surface_sites (site_id, affinity_color, updated_at)
  VALUES (?, ?, ?)
`);

const insertRole = db.prepare(`
  INSERT OR REPLACE INTO operator_surface_roles (role, label, affinity_color, updated_at)
  VALUES (?, ?, ?, ?)
`);

const insertIdentity = db.prepare(`
  INSERT INTO operator_surface_identities (
    identity_id, identity_name, agent_name, role, agent_kind, site_id,
    label, display_name, deprecated, superseded_by,
    previous_identity_ids_json, migration_history_json,
    narada_site_relation_json, role_metadata_json,
    projection_intent_json, distinct_from_json,
    carrier_projections_json, label_projection_json,
    input_capabilities_json, submit_strategy, authority_limits_json,
    admitted_by, admitted_at, updated_at, revoked_at, revoked_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(identity_id) DO UPDATE SET
    identity_name = excluded.identity_name,
    agent_name = excluded.agent_name,
    role = excluded.role,
    agent_kind = excluded.agent_kind,
    site_id = excluded.site_id,
    label = excluded.label,
    display_name = excluded.display_name,
    deprecated = excluded.deprecated,
    superseded_by = excluded.superseded_by,
    previous_identity_ids_json = excluded.previous_identity_ids_json,
    migration_history_json = excluded.migration_history_json,
    narada_site_relation_json = excluded.narada_site_relation_json,
    role_metadata_json = excluded.role_metadata_json,
    projection_intent_json = excluded.projection_intent_json,
    distinct_from_json = excluded.distinct_from_json,
    carrier_projections_json = excluded.carrier_projections_json,
    label_projection_json = excluded.label_projection_json,
    input_capabilities_json = excluded.input_capabilities_json,
    submit_strategy = excluded.submit_strategy,
    authority_limits_json = excluded.authority_limits_json,
    admitted_by = excluded.admitted_by,
    admitted_at = excluded.admitted_at,
    updated_at = excluded.updated_at,
    revoked_at = excluded.revoked_at,
    revoked_by = excluded.revoked_by
`);

const insertLog = db.prepare(`
  INSERT INTO operator_surface_identity_admission_log
    (identity_id, event_kind, event_at, event_by, payload_json, source)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const sites = data.sites || {};
for (const [siteId, siteData] of Object.entries(sites)) {
  insertSite.run(siteId, siteData.affinity_color || '000000', now);
}

const roles = data.roles || {};
for (const [role, roleData] of Object.entries(roles)) {
  insertRole.run(role, roleData.label || role, roleData.affinity_color || '000000', now);
}

const identities = data.identities || [];

for (const id of identities) {
  if (id.site_id && !sites[id.site_id]) {
    insertSite.run(id.site_id, id.label_projection?.style?.site_text_hex || '000000', now);
  }
  if (id.role && !roles[id.role]) {
    insertRole.run(id.role, id.role, id.label_projection?.style?.role_text_hex || '000000', now);
  }
}

for (const id of identities) {
  const admittedAt = id.admitted_at || data.updated_at || now;
  const updatedAt = id.updated_at || admittedAt;
  const admittedBy = id.admitted_by || 'operator';

  insertIdentity.run(
    id.identity_id,
    id.identity_name,
    id.agent_name || id.identity_name.split('.').pop() || '',
    id.role,
    id.agent_kind || 'cli-coding-agent',
    id.site_id,
    id.label || null,
    id.display_name || null,
    id.deprecated ? 1 : 0,
    id.superseded_by || null,
    JSON.stringify(id.previous_identity_ids || []),
    JSON.stringify(id.migration_history || []),
    JSON.stringify(id.narada_site_relation || {}),
    JSON.stringify(id.role_metadata || {}),
    JSON.stringify(id.projection_intent || []),
    JSON.stringify(id.distinct_from || []),
    JSON.stringify(id.carrier_projections || {}),
    JSON.stringify(id.label_projection || {}),
    JSON.stringify(id.input_capabilities || []),
    id.submit_strategy || null,
    JSON.stringify(id.authority_limits || []),
    admittedBy,
    admittedAt,
    updatedAt,
    null, // revoked_at
    null  // revoked_by
  );

  insertLog.run(
    id.identity_id,
    'generated',
    now,
    'migration-script',
    JSON.stringify({ source: 'identities.json', migrated_at: now }),
    'migration'
  );
}

console.log('Migrated', identities.length, 'identities');
console.log('Migrated', Object.keys(sites).length, 'sites');
console.log('Migrated', Object.keys(roles).length, 'roles');

// Verify
const count = db.prepare('SELECT COUNT(*) as c FROM operator_surface_identities').get();
console.log('Total identities in SQLite:', count.c);

db.close();
console.log('Done.');
