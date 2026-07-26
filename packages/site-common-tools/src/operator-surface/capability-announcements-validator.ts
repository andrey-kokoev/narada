import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VALID_STATUS: any = new Set(['locally_admitted', 'pending', 'retired', 'deprecated']);
const VALID_REVIEW_STATUS: any = new Set(['pending', 'completed', 'overdue']);
const VALID_REVIEW_VERDICTS: any = new Set(['accepted', 'accepted_with_notes', 'needs_work', 'rejected', 'superseded']);

export function validateCapabilityAnnouncements(doc: any) : any{
  const errors: any = [];
  const warnings: any = [];
  const root: any = asObject(doc);

  requireString(root, 'schema', errors, 'root');
  if (root.schema && root.schema !== 'narada.local_capability_announcements.v0') {
    errors.push(`root.schema must be narada.local_capability_announcements.v0`);
  }
  requireString(root, 'owner_site_id', errors, 'root');
  requireObject(root, 'export_posture', errors, 'root');
  requireObject(root, 'capability_review_authority', errors, 'root');

  if (!Array.isArray(root.capabilities) || root.capabilities.length === 0) {
    errors.push('root.capabilities must be a non-empty array');
  } else {
    const seen: any = new Set();
    for (let i = 0; i < root.capabilities.length; i++) {
      validateCapability(root.capabilities[i], i, root.owner_site_id, seen, errors, warnings);
    }
  }

  const authority: any = asObject(root.capability_review_authority);
  if (authority.store !== 'operator-surfaces/capability-announcements.json') {
    errors.push('capability_review_authority.store must be operator-surfaces/capability-announcements.json');
  }
  requireString(authority, 'posture', errors, 'capability_review_authority');
  requireString(authority, 'projection_boundary', errors, 'capability_review_authority');
  requireIsoString(authority, 'updated_at', errors, 'capability_review_authority');

  return {
    status: errors.length === 0 ? 'valid' : 'invalid',
    schema: 'narada.local_capability_announcements.validation.v0',
    checked_schema: root.schema ?? null,
    capability_count: Array.isArray(root.capabilities) ? root.capabilities.length : 0,
    errors,
    warnings,
    semantic_acceptance: 'not_evaluated_by_schema_validator',
  };
}

function validateCapability(value: any, index: any, ownerSiteId: any, seen: any, errors: any, warnings: any) : any{
  const path: any = `capabilities[${index}]`;
  const cap: any = asObject(value);
  const capabilityId: any = requireString(cap, 'capability_id', errors, path);
  if (capabilityId && !/^[a-z][a-z0-9_]*$/.test(capabilityId)) {
    errors.push(`${path}.capability_id must be a stable snake_case id`);
  }
  if (capabilityId) {
    if (seen.has(capabilityId)) errors.push(`${path}.capability_id duplicates ${capabilityId}`);
    seen.add(capabilityId);
  }

  requireEnum(cap, 'status', VALID_STATUS, errors, path);
  requireIsoString(cap, 'admitted_at', errors, path);
  requireIsoString(cap, 'review_due', errors, path);
  requireString(cap, 'responsible_agent_id', errors, path);
  requireEnum(cap, 'review_status', VALID_REVIEW_STATUS, errors, path);

  const scope: any = requireObject(cap, 'scope', errors, path);
  if (scope) {
    requireString(scope, 'site_id', errors, `${path}.scope`);
    requireString(scope, 'locus', errors, `${path}.scope`);
    if (ownerSiteId && scope.site_id && scope.site_id !== ownerSiteId) {
      errors.push(`${path}.scope.site_id must match owner_site_id ${ownerSiteId}`);
    }
    if (!scope.targets && !scope.effect_class) {
      errors.push(`${path}.scope must declare targets or effect_class`);
    }
  }

  validateEntrypoints(cap.entrypoints, `${path}.entrypoints`, errors);
  validateEvidence(cap.evidence, `${path}.evidence`, errors);
  validateStringArray(cap.constraints, `${path}.constraints`, errors);

  const doctrine: any = requireObject(cap, 'local_not_upstream_doctrine', errors, path);
  if (doctrine) {
    requireString(doctrine, 'statement', errors, `${path}.local_not_upstream_doctrine`);
    requireString(doctrine, 'upstream_dependency', errors, `${path}.local_not_upstream_doctrine`);
  }

  const propagation: any = requireObject(cap, 'propagation', errors, path);
  if (propagation) {
    requireString(propagation, 'canonical_inbox_payload_kind', errors, `${path}.propagation`);
    requireString(propagation, 'portable_artifact_path', errors, `${path}.propagation`);
    requireString(propagation, 'human_summary', errors, `${path}.propagation`);
  }

  if (cap.review_status === 'completed') {
    requireIsoString(cap, 'reviewed_at', errors, path);
    requireString(cap, 'reviewed_by', errors, path);
    requireEnum(cap, 'review_verdict', VALID_REVIEW_VERDICTS, errors, path);
    requireString(cap, 'review_notes', errors, path);
    requireString(cap, 'review_evidence_ref', errors, path);
    validateReviewLog(cap.review_log, `${path}.review_log`, errors);
  } else if (cap.reviewed_at || cap.reviewed_by || cap.review_verdict) {
    warnings.push(`${path} has review completion metadata while review_status is ${cap.review_status}`);
  }
}

function validateEntrypoints(value: any, path: any, errors: any) : any{
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const entry: any = asObject(value[i]);
    requireString(entry, 'kind', errors, `${path}[${i}]`);
    requireString(entry, 'path', errors, `${path}[${i}]`);
  }
}

function validateEvidence(value: any, path: any, errors: any) : any{
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const evidence: any = asObject(value[i]);
    if (evidence !== value[i]) {
      errors.push(`${path}[${i}] must be an object`);
      continue;
    }
    requireString(evidence, 'kind', errors, `${path}[${i}]`);
    if (!evidence.path && !evidence.ref && !evidence.uri) {
      errors.push(`${path}[${i}] must declare path, ref, or uri`);
    }
  }
}

function validateReviewLog(value: any, path: any, errors: any) : any{
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty array when review_status is completed`);
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const item: any = asObject(value[i]);
    requireString(item, 'review_id', errors, `${path}[${i}]`);
    requireString(item, 'capability_id', errors, `${path}[${i}]`);
    requireString(item, 'reviewer_agent_id', errors, `${path}[${i}]`);
    requireIsoString(item, 'reviewed_at', errors, `${path}[${i}]`);
    requireEnum(item, 'verdict', VALID_REVIEW_VERDICTS, errors, `${path}[${i}]`);
    requireEnum(item, 'review_status', VALID_REVIEW_STATUS, errors, `${path}[${i}]`);
    requireString(item, 'notes', errors, `${path}[${i}]`);
    requireString(item, 'evidence_ref', errors, `${path}[${i}]`);
  }
}

function validateStringArray(value: any, path: any, errors: any) : any{
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty string array`);
    return;
  }
  value.forEach((item: any, index: any) => {
    if (typeof item !== 'string' || item.trim() === '') errors.push(`${path}[${index}] must be a non-empty string`);
  });
}

function requireObject(record: any, key: any, errors: any, path: any) : any{
  const value: any = record[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path}.${key} must be an object`);
    return null;
  }
  return value;
}

function requireString(record: any, key: any, errors: any, path: any) : any{
  const value: any = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path}.${key} must be a non-empty string`);
    return null;
  }
  return value;
}

function requireIsoString(record: any, key: any, errors: any, path: any) : any{
  const value: any = requireString(record, key, errors, path);
  if (value && Number.isNaN(Date.parse(value))) errors.push(`${path}.${key} must be parseable ISO date/time`);
  return value;
}

function requireEnum(record: any, key: any, allowed: any, errors: any, path: any) : any{
  const value: any = requireString(record, key, errors, path);
  if (value && !allowed.has(value)) errors.push(`${path}.${key} must be one of ${[...allowed].join(', ')}`);
  return value;
}

function asObject(value: any) : any{
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function validateCapabilityAnnouncementsFile(path: any = 'operator-surfaces/capability-announcements.json') : any{
  const absolute: any = resolve(path);
  const doc: any = JSON.parse(readFileSync(absolute, 'utf8'));
  return validateCapabilityAnnouncements(doc);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const target: any = process.argv[2] ?? 'operator-surfaces/capability-announcements.json';
  const result: any = validateCapabilityAnnouncementsFile(target);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === 'valid' ? 0 : 1);
}
