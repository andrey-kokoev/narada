import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';

export interface CarrierActionDecisionEntry {
  status: 'ok' | 'unreadable';
  path: string;
  record?: Record<string, unknown>;
  error?: string;
}

export function siteEvidenceRoot(siteRoot: string): string {
  const normalized = normalize(siteRoot);
  return basename(normalized).toLowerCase() === '.narada'
    ? normalized
    : join(normalized, '.narada');
}

export function actionAdmissionDir(siteRoot: string): string {
  return join(siteEvidenceRoot(siteRoot), 'crew', 'action-admission');
}

export function assertSafeCarrierActionRequestId(requestId: string): string {
  const trimmed = requestId.trim();
  if (!trimmed) throw new Error('<request-id> is required');
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    throw new Error('<request-id> may only contain letters, numbers, underscore, dash, and dot');
  }
  return trimmed;
}

export function readCarrierActionDecisionFile(path: string): CarrierActionDecisionEntry {
  try {
    return {
      status: 'ok',
      path,
      record: JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>,
    };
  } catch (error) {
    return {
      status: 'unreadable',
      path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function listCarrierActionDecisions(siteRoot: string, options: { decision?: string; limit?: number } = {}): {
  status: 'success';
  evidence_dir: string;
  count: number;
  limit: number;
  decisions: Array<Record<string, unknown>>;
} {
  const evidenceDir = actionAdmissionDir(siteRoot);
  const limit = options.limit ?? 50;
  if (!existsSync(evidenceDir)) {
    return { status: 'success', evidence_dir: evidenceDir, count: 0, limit, decisions: [] };
  }
  const decisions = readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readCarrierActionDecisionFile(join(evidenceDir, name)))
    .filter((entry) => !options.decision || entry.record?.decision === options.decision)
    .sort((a, b) => entryMtimeMs(b) - entryMtimeMs(a))
    .slice(0, limit)
    .map(summarizeCarrierActionDecision);
  return { status: 'success', evidence_dir: evidenceDir, count: decisions.length, limit, decisions };
}

export function showCarrierActionDecision(siteRoot: string, requestId: string): {
  status: 'ok' | 'not_found' | 'unreadable';
  request_id: string;
  evidence_path: string;
  record?: Record<string, unknown>;
  error?: string;
} {
  const safeRequestId = assertSafeCarrierActionRequestId(requestId);
  const evidencePath = join(actionAdmissionDir(siteRoot), `${safeRequestId}.json`);
  if (!existsSync(evidencePath)) {
    return { status: 'not_found', request_id: safeRequestId, evidence_path: evidencePath };
  }
  const entry = readCarrierActionDecisionFile(evidencePath);
  if (entry.status !== 'ok') {
    return {
      status: 'unreadable',
      request_id: safeRequestId,
      evidence_path: evidencePath,
      error: entry.error,
    };
  }
  return { status: 'ok', request_id: safeRequestId, evidence_path: evidencePath, record: entry.record };
}

function entryMtimeMs(entry: CarrierActionDecisionEntry): number {
  try {
    return statSync(entry.path).mtimeMs;
  } catch {
    return 0;
  }
}

function summarizeCarrierActionDecision(entry: CarrierActionDecisionEntry): Record<string, unknown> {
  if (entry.status !== 'ok') {
    return { status: entry.status, path: entry.path, error: entry.error };
  }
  const record = entry.record;
  return {
    status: 'ok',
    path: entry.path,
    request_id: nestedString(record, ['request_id']),
    schema: nestedString(record, ['schema']),
    created_at: nestedString(record, ['created_at']),
    decision: nestedString(record, ['decision']),
    reason: nestedString(record, ['reason']),
    authority_owner: nestedString(record, ['authority_owner']),
    carrier_mutation_admitted: nestedBoolean(record, ['carrier_mutation_admitted']) ?? false,
    candidate_ref: nestedString(record, ['candidate_ref']),
    tool: nestedString(record, ['request', 'requested_action', 'tool']),
    family: nestedString(record, ['request', 'requested_action', 'declared_family']),
    classifier_source: nestedString(record, ['request', 'requested_action', 'classifier_source']),
  };
}

function nestedString(record: Record<string, unknown> | undefined, path: string[]): string | null {
  let cursor: unknown = record;
  for (const part of path) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'string' ? cursor : null;
}

function nestedBoolean(record: Record<string, unknown> | undefined, path: string[]): boolean | null {
  let cursor: unknown = record;
  for (const part of path) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'boolean' ? cursor : null;
}
