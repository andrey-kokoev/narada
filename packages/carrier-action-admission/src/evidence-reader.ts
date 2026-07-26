import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';

type JsonRecord = Record<string, any>;

interface ReadableDecisionRecord extends JsonRecord {
  request_id?: string;
  schema?: string;
  created_at?: string | null;
  decision?: string | null;
  reason?: string | null;
  authority_owner?: string | null;
  carrier_mutation_admitted?: boolean;
  candidate_ref?: string | null;
  request?: JsonRecord;
}

type DecisionFileResult =
  | { status: 'ok'; path: string; record: ReadableDecisionRecord }
  | { status: 'unreadable'; path: string; error: string };

interface DecisionSummary {
  status: 'ok' | 'unreadable';
  path: string;
  request_id?: string;
  schema?: string;
  created_at?: string | null;
  decision?: string | null;
  reason?: string | null;
  authority_owner?: string | null;
  carrier_mutation_admitted?: boolean;
  candidate_ref?: string | null;
  tool?: string | null;
  family?: string | null;
  classifier_source?: string | null;
  error?: string;
}

interface DecisionListOptions {
  limit?: number;
  decision?: string;
}

interface DecisionListResult {
  status: 'success';
  evidence_dir: string;
  count: number;
  limit?: number;
  decisions: DecisionSummary[];
}

type ShowDecisionResult =
  | DecisionFileResult
  | { status: 'not_found'; evidence_path: string; request_id: string }
  | { status: 'invalid_request_id'; request_id: string; error: string };

function siteEvidenceRoot(siteRoot: string): string {
  const normalized = normalize(siteRoot);
  return basename(normalized).toLowerCase() === '.narada'
    ? normalized
    : join(normalized, '.narada');
}

function actionAdmissionDir(siteRoot: string): string {
  return join(siteEvidenceRoot(siteRoot), 'crew', 'action-admission');
}

function readCarrierActionDecisionFile(path: string): DecisionFileResult {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as ReadableDecisionRecord;
    return {
      status: 'ok',
      path,
      record,
    };
  } catch (error) {
    return {
      status: 'unreadable',
      path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function listCarrierActionDecisions(siteRoot: string, options: DecisionListOptions = {}): DecisionListResult {
  const dir = actionAdmissionDir(siteRoot);
  if (!existsSync(dir)) {
    return {
      status: 'success',
      evidence_dir: dir,
      count: 0,
      decisions: [],
    };
  }
  const limit = options.limit ?? 50;
  const decisions = readdirSync(dir)
    .filter((name: string) => name.endsWith('.json'))
    .map((name: string) => readCarrierActionDecisionFile(join(dir, name)))
    .filter((entry: DecisionFileResult) => !options.decision || entry.status !== 'ok' || entry.record.decision === options.decision)
    .sort((a: DecisionFileResult, b: DecisionFileResult) => entryMtimeMs(b) - entryMtimeMs(a))
    .slice(0, limit)
    .map((entry: DecisionFileResult) => summarizeDecisionEntry(entry));
  return {
    status: 'success',
    evidence_dir: dir,
    count: decisions.length,
    limit,
    decisions,
  };
}

function showCarrierActionDecision(siteRoot: string, requestId: string): ShowDecisionResult {
  if (!isSafeRequestId(requestId)) {
    return {
      status: 'invalid_request_id',
      request_id: requestId,
      error: 'Request id may only contain letters, numbers, underscore, dash, and dot.',
    };
  }
  const path = join(actionAdmissionDir(siteRoot), `${requestId}.json`);
  if (!existsSync(path)) {
    return {
      status: 'not_found',
      evidence_path: path,
      request_id: requestId,
    };
  }
  return readCarrierActionDecisionFile(path);
}

function isSafeRequestId(requestId: unknown): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(String(requestId ?? ''));
}

function entryMtimeMs(entry: DecisionFileResult): number {
  try {
    return statSync(entry.path).mtimeMs;
  } catch {
    return 0;
  }
}

function summarizeDecisionEntry(entry: DecisionFileResult): DecisionSummary {
  if (entry.status !== 'ok') return entry;
  const record = entry.record;
  return {
    status: 'ok',
    path: entry.path,
    request_id: record.request_id,
    schema: record.schema,
    created_at: record.created_at ?? null,
    decision: record.decision ?? null,
    reason: record.reason ?? null,
    authority_owner: record.authority_owner ?? null,
    carrier_mutation_admitted: record.carrier_mutation_admitted ?? false,
    candidate_ref: record.candidate_ref ?? null,
    tool: record.request?.requested_action?.tool ?? null,
    family: record.request?.requested_action?.declared_family ?? null,
    classifier_source: record.request?.requested_action?.classifier_source ?? null,
  };
}

export {
  actionAdmissionDir,
  listCarrierActionDecisions,
  readCarrierActionDecisionFile,
  showCarrierActionDecision,
  siteEvidenceRoot,
};

export type {
  DecisionFileResult,
  DecisionListOptions,
  DecisionListResult,
  DecisionSummary,
  ReadableDecisionRecord,
  ShowDecisionResult,
};
