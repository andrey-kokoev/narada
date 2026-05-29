import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export const ORIENTATION_SNAPSHOT_SCHEMA = 'narada.site_evolution.orientation_snapshot.v0';
export const ONBOARDING_CARD_SCHEMA = 'narada.site_evolution.rehydration_onboarding_card.v0';
export const ORIENTATION_GENERATOR_VERSION = '0.1.0';

export const ORIENTATION_DDL = `
CREATE TABLE IF NOT EXISTS site_evolution_orientation_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  primitives_hash TEXT,
  genesis_hash TEXT,
  source_refs_json TEXT NOT NULL,
  source_hashes_json TEXT NOT NULL,
  claim_index_json TEXT NOT NULL,
  orientation_card_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  degraded_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_site_evolution_orientation_site
  ON site_evolution_orientation_snapshots(site_id, created_at DESC);
`;

const PRIMITIVES_REL = 'docs/site-evolution/orientation-primitives.json';
const GENESIS_REL = 'docs/site-evolution/genesis-arc.md';

export function loadRehydrationOnboardingCard({ siteRoot, db }) {
  const latest = readLatestOrientationSnapshot(db);
  if (!latest) {
    return buildMissingOrFallbackCard({ siteRoot, statusReason: 'no orientation snapshot exists' });
  }

  const card = parseJson(latest.orientation_card_json, null);
  if (!card) {
    return buildMissingOrFallbackCard({ siteRoot, statusReason: 'latest orientation snapshot card is unreadable' });
  }

  const currentSources = readCanonicalSources(siteRoot);
  const staleReasons = [];
  if (latest.schema_id !== ORIENTATION_SNAPSHOT_SCHEMA) staleReasons.push('schema changed');
  if (latest.generator_version !== ORIENTATION_GENERATOR_VERSION) staleReasons.push('generator version changed');
  if (latest.primitives_hash !== currentSources.primitives.hash) staleReasons.push('orientation primitives hash changed');
  if (latest.genesis_hash !== currentSources.genesis.hash) staleReasons.push('genesis source hash changed');

  if (staleReasons.length === 0) {
    return {
      ...card,
      status: latest.degraded_reason ? 'degraded' : 'loaded',
      status_reason: latest.degraded_reason ?? card.status_reason ?? 'latest orientation snapshot loaded',
      routine_action_posture: latest.degraded_reason ? 'proceed_with_caution' : 'proceed',
      structural_action_posture: latest.degraded_reason ? 'inspect_before_structural_change' : 'inspect_before_structural_change',
    };
  }

  return {
    ...card,
    status: 'stale',
    status_reason: staleReasons.join('; '),
    routine_action_posture: 'proceed_with_caution',
    structural_action_posture: 'refresh_required',
  };
}

export function createSiteEvolutionOrientationSnapshot({ siteRoot, db, reason = 'explicit_create' }) {
  if (!db) throw new Error('agent_context_db_not_available');
  const createdAt = new Date().toISOString();
  const snapshotId = `seo_${randomUUID().replace(/-/g, '')}`;
  const sources = readCanonicalSources(siteRoot);
  const sourceRefs = buildSourceRefs(sources);
  const sourceHashes = buildSourceHashes(sources);
  const degradedReasons = [];

  if (!sources.primitives.available) degradedReasons.push('orientation primitives source missing');
  if (!sources.genesis.available) degradedReasons.push('genesis source missing');
  if (!sources.agents.available) degradedReasons.push('AGENTS.md missing');

  const primitives = sources.primitives.value;
  const card = primitives
    ? buildCardFromPrimitives({ primitives, snapshotId, status: degradedReasons.length ? 'degraded' : 'loaded', statusReason: degradedReasons.join('; ') || 'orientation snapshot loaded' })
    : buildMinimalCard({ status: 'missing', statusReason: 'orientation primitives source missing', snapshotId });

  const claimIndex = primitives ? buildClaimIndex(primitives, sourceRefs) : [];
  const latestGrounding = readLatestGroundingEvent(db);
  const payload = {
    schema: ORIENTATION_SNAPSHOT_SCHEMA,
    snapshot_id: snapshotId,
    generated_at: createdAt,
    site_id: primitives?.site_id ?? 'narada-andrey',
    generator: {
      name: 'site-evolution-orientation',
      version: ORIENTATION_GENERATOR_VERSION,
    },
    reason,
    source_refs: sourceRefs,
    source_hashes: sourceHashes,
    claim_index: claimIndex,
    place_story: primitives?.place_story ?? null,
    authority_brief: primitives?.authority_brief ?? [],
    what_usually_goes_wrong: primitives?.what_usually_goes_wrong ?? [],
    must_preserve: primitives?.must_preserve ?? [],
    first_questions: primitives?.first_questions ?? [],
    navigation_protocol: primitives?.navigation_protocol ?? null,
    pause_triggers: primitives?.pause_triggers ?? [],
    latest_grounding_event: latestGrounding,
    candidate_primitives: [],
    degraded_reason: degradedReasons.join('; ') || null,
    orientation_card: card,
  };

  db.prepare(`
    INSERT INTO site_evolution_orientation_snapshots (
      snapshot_id, created_at, schema_id, site_id, generator_version,
      primitives_hash, genesis_hash, source_refs_json, source_hashes_json,
      claim_index_json, orientation_card_json, payload_json, degraded_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshotId,
    createdAt,
    ORIENTATION_SNAPSHOT_SCHEMA,
    payload.site_id,
    ORIENTATION_GENERATOR_VERSION,
    sources.primitives.hash,
    sources.genesis.hash,
    JSON.stringify(sourceRefs),
    JSON.stringify(sourceHashes),
    JSON.stringify(claimIndex),
    JSON.stringify(card),
    JSON.stringify(payload),
    payload.degraded_reason
  );

  return {
    status: payload.degraded_reason ? 'degraded' : 'created',
    snapshot_id: snapshotId,
    created_at: createdAt,
    degraded_reason: payload.degraded_reason,
    card,
  };
}

export function latestSiteEvolutionOrientation({ db }) {
  const row = readLatestOrientationSnapshot(db);
  if (!row) return { status: 'missing', not_action_authority: true };
  return {
    status: 'ok',
    not_action_authority: true,
    snapshot: parseOrientationRow(row, { includePayload: false }),
  };
}

export function historySiteEvolutionOrientation({ db, limit = 10 }) {
  if (!db) throw new Error('agent_context_db_not_available');
  const bounded = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const rows = db.prepare('SELECT * FROM site_evolution_orientation_snapshots ORDER BY created_at DESC LIMIT ?').all(bounded);
  return {
    status: rows.length ? 'ok' : 'missing',
    not_action_authority: true,
    count: rows.length,
    snapshots: rows.map((row) => parseOrientationRow(row, { includePayload: false })),
  };
}

export function showSiteEvolutionOrientation({ db, snapshotId }) {
  if (!db) throw new Error('agent_context_db_not_available');
  if (!snapshotId) throw new Error('snapshot_id is required');
  const row = db.prepare('SELECT * FROM site_evolution_orientation_snapshots WHERE snapshot_id = ?').get(snapshotId);
  if (!row) return { status: 'not_found', not_action_authority: true, snapshot_id: snapshotId };
  return {
    status: 'ok',
    not_action_authority: true,
    snapshot: parseOrientationRow(row, { includePayload: true }),
  };
}

export function buildIdentityUnverifiedOrientationHint() {
  return {
    schema: 'narada.site_evolution.identity_unverified_orientation_hint.v0',
    message: 'You are in a Narada Site. Identity must be verified before action.',
    required_next_action: 'restart_through_agent_start',
    pause_triggers: [
      { id: 'identity_warning_or_mismatch', label: 'Identity is missing, low-confidence, or mismatched.' },
      { id: 'missing_mcp_capability', label: 'Needed MCP capability is unavailable.' },
    ],
  };
}

function buildMissingOrFallbackCard({ siteRoot, statusReason }) {
  const sources = readCanonicalSources(siteRoot);
  if (sources.primitives.value) {
    return buildCardFromPrimitives({
      primitives: sources.primitives.value,
      snapshotId: null,
      status: 'primitive_fallback',
      statusReason,
    });
  }
  return buildMinimalCard({ status: 'missing', statusReason, snapshotId: null });
}

function buildCardFromPrimitives({ primitives, snapshotId, status, statusReason }) {
  return {
    schema: ONBOARDING_CARD_SCHEMA,
    snapshot_id: snapshotId,
    status,
    status_reason: statusReason,
    badge_guidance: {
      rule: 'Use verified_badge from live hydrate_current output. Do not infer identity from this card or chat residue.',
    },
    place_story: primitives.place_story ?? { one_sentence: null, genesis_stages: [] },
    authority_brief: primitives.authority_brief ?? [],
    what_usually_goes_wrong: primitives.what_usually_goes_wrong ?? [],
    must_preserve: primitives.must_preserve ?? [],
    first_questions: primitives.first_questions ?? [],
    navigation_protocol: primitives.navigation_protocol ?? null,
    pause_triggers: primitives.pause_triggers ?? [],
    routine_action_posture: status === 'loaded' ? 'proceed' : 'proceed_with_caution',
    structural_action_posture: status === 'loaded' ? 'inspect_before_structural_change' : 'refresh_required',
    authority_note: 'This card is an orientation projection, not authority. Inspect snapshot/source refs for structural decisions.',
    inspect_tool: 'agent_context_site_evolution_orientation_show',
  };
}

function buildMinimalCard({ status, statusReason, snapshotId }) {
  return {
    schema: ONBOARDING_CARD_SCHEMA,
    snapshot_id: snapshotId,
    status,
    status_reason: statusReason,
    badge_guidance: {
      rule: 'Use verified_badge from live hydrate_current output. Do not infer identity from this card or chat residue.',
    },
    place_story: { one_sentence: null, genesis_stages: [] },
    authority_brief: [],
    what_usually_goes_wrong: [],
    must_preserve: [],
    first_questions: [],
    navigation_protocol: null,
    pause_triggers: [
      { id: 'identity_warning_or_mismatch', label: 'Identity is missing, low-confidence, or mismatched.' },
      { id: 'missing_mcp_capability', label: 'Needed MCP capability is unavailable.' },
    ],
    routine_action_posture: 'proceed_with_caution',
    structural_action_posture: 'refresh_required',
    authority_note: 'This card is an orientation projection, not authority. Inspect snapshot/source refs for structural decisions.',
    inspect_tool: 'agent_context_site_evolution_orientation_show',
  };
}

function readCanonicalSources(siteRoot) {
  return {
    primitives: readJsonSource(siteRoot, PRIMITIVES_REL),
    genesis: readTextSource(siteRoot, GENESIS_REL),
    agents: readTextSource(siteRoot, 'AGENTS.md'),
  };
}

function readTextSource(siteRoot, relPath) {
  const absolutePath = resolve(siteRoot, relPath);
  if (!existsSync(absolutePath)) {
    return { relPath, absolutePath, available: false, hash: null, content: null };
  }
  try {
    const content = readFileSync(absolutePath, 'utf8');
    return { relPath, absolutePath, available: true, hash: hashContent(content), content };
  } catch (error) {
    return { relPath, absolutePath, available: false, hash: null, content: null, error: error.message };
  }
}

function readJsonSource(siteRoot, relPath) {
  const source = readTextSource(siteRoot, relPath);
  if (!source.available) return { ...source, value: null };
  try {
    return { ...source, value: JSON.parse(source.content) };
  } catch (error) {
    return { ...source, value: null, error: error.message };
  }
}

function buildSourceRefs(sources) {
  return Object.entries(sources).map(([key, source]) => ({
    kind: key === 'primitives' ? 'orientation_primitives' : key === 'genesis' ? 'genesis_source' : 'local_source',
    label: key,
    path: source.relPath,
    absolute_path: source.absolutePath,
    available: source.available,
    error: source.error ?? null,
  }));
}

function buildSourceHashes(sources) {
  return Object.fromEntries(Object.values(sources).map((source) => [source.relPath, source.hash]));
}

function buildClaimIndex(primitives, sourceRefs) {
  const sourceRefPaths = sourceRefs.filter((ref) => ref.available).map((ref) => ref.path);
  const claims = [];
  const addClaim = (section, item, statementKey = 'label') => {
    if (!item?.id) return;
    claims.push({
      claim_id: `${section}:${item.id}`,
      section,
      primitive_id: item.id,
      claim_type: item.claim_type ?? 'synthesis',
      confidence: item.confidence ?? 'medium',
      statement: item[statementKey] ?? item.label ?? item.question ?? item.id,
      source_refs: sourceRefPaths,
    });
  };

  for (const item of primitives.place_story?.genesis_stages ?? []) addClaim('genesis_stages', item);
  for (const item of primitives.authority_brief ?? []) addClaim('authority_brief', item);
  for (const item of primitives.what_usually_goes_wrong ?? []) addClaim('what_usually_goes_wrong', item);
  for (const item of primitives.must_preserve ?? []) addClaim('must_preserve', item);
  for (const item of primitives.first_questions ?? []) addClaim('first_questions', item, 'question');
  for (const item of primitives.pause_triggers ?? []) addClaim('pause_triggers', item);
  return claims;
}

function readLatestOrientationSnapshot(db) {
  if (!db) return null;
  try {
    return db.prepare('SELECT * FROM site_evolution_orientation_snapshots ORDER BY created_at DESC LIMIT 1').get();
  } catch {
    return null;
  }
}

function readLatestGroundingEvent(db) {
  if (!db) return null;
  try {
    const row = db.prepare('SELECT event_id, agent_id, trigger, created_at, grounding_status, degraded_reason FROM agent_grounding_events ORDER BY created_at DESC LIMIT 1').get();
    return row ?? null;
  } catch {
    return null;
  }
}

function parseOrientationRow(row, { includePayload }) {
  const parsed = {
    snapshot_id: row.snapshot_id,
    created_at: row.created_at,
    schema_id: row.schema_id,
    site_id: row.site_id,
    generator_version: row.generator_version,
    primitives_hash: row.primitives_hash,
    genesis_hash: row.genesis_hash,
    source_refs: parseJson(row.source_refs_json, []),
    source_hashes: parseJson(row.source_hashes_json, {}),
    claim_index: parseJson(row.claim_index_json, []),
    orientation_card: parseJson(row.orientation_card_json, null),
    degraded_reason: row.degraded_reason,
  };
  if (includePayload) parsed.payload = parseJson(row.payload_json, null);
  return parsed;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function hashContent(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
