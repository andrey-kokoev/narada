import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EVIDENCE_REF_PROJECTION_SCHEMA = 'narada.narada_native_carrier.evidence_ref_projection.v0';
const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;

function projectEvidenceRefs(siteRoot, carrierSessionId, { now = new Date().toISOString() } = {}) {
  const dir = join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  const refs = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => {
        const path = join(dir, name);
        const record = readJsonSafe(path);
        const stats = statSync(path);
        return {
          family: evidenceFamily(name, record),
          status: boundedText(typeof record?.status === 'string' ? record.status : (typeof record?.state === 'string' ? record.state : null)),
          path: boundedPath(path),
          recency: recencyBucket(record?.recorded_at ?? stats.mtime.toISOString(), now),
          recorded_at: record?.recorded_at ?? null,
          raw_transcript_recorded: false,
          raw_prompt_recorded: false,
          raw_provider_output_recorded: false,
          raw_secret_values_recorded: false,
          values_omitted: true,
        };
      }).sort((a, b) => a.path.localeCompare(b.path))
    : [];
  return {
    schema: EVIDENCE_REF_PROJECTION_SCHEMA,
    carrier_session_id: carrierSessionId,
    refs,
    raw_transcript_recorded: false,
    raw_prompt_recorded: false,
    raw_provider_output_recorded: false,
    raw_secret_values_recorded: false,
    values_omitted: true,
    projected_at: now,
  };
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function evidenceFamily(name, record) {
  if (name.startsWith('supervisor-')) return 'supervisor';
  if (name.includes('handoff-payload')) return 'handoff';
  if (name.includes('adapter')) return 'adapter';
  if (name.includes('work-loop')) return 'work_loop';
  if (record?.phase) return record.phase;
  return 'session';
}

function recencyBucket(recordedAt, now) {
  const thenMs = Date.parse(recordedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return 'unknown';
  const delta = Math.max(0, nowMs - thenMs);
  if (delta <= 60_000) return 'fresh';
  if (delta <= 3_600_000) return 'recent';
  if (delta <= 86_400_000) return 'stale';
  return 'old';
}

function boundedPath(path) {
  if (typeof path !== 'string' || path.length === 0) return null;
  if (SECRET_VALUE_PATTERN.test(path)) return 'omitted_sensitive_path';
  return path.slice(0, 500);
}

function boundedText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (SECRET_VALUE_PATTERN.test(value)) return 'omitted_sensitive_value';
  return value.slice(0, 200);
}

export {
  EVIDENCE_REF_PROJECTION_SCHEMA,
  projectEvidenceRefs,
};
