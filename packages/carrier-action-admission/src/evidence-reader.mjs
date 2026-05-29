import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';

function siteEvidenceRoot(siteRoot) {
  const normalized = normalize(siteRoot);
  return basename(normalized).toLowerCase() === '.narada'
    ? normalized
    : join(normalized, '.narada');
}

function actionAdmissionDir(siteRoot) {
  return join(siteEvidenceRoot(siteRoot), 'crew', 'action-admission');
}

function readCarrierActionDecisionFile(path) {
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
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

function listCarrierActionDecisions(siteRoot, options = {}) {
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
    .filter((name) => name.endsWith('.json'))
    .map((name) => readCarrierActionDecisionFile(join(dir, name)))
    .filter((entry) => !options.decision || entry.record?.decision === options.decision)
    .sort((a, b) => entryMtimeMs(b) - entryMtimeMs(a))
    .slice(0, limit)
    .map(summarizeDecisionEntry);
  return {
    status: 'success',
    evidence_dir: dir,
    count: decisions.length,
    limit,
    decisions,
  };
}

function showCarrierActionDecision(siteRoot, requestId) {
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

function isSafeRequestId(requestId) {
  return /^[A-Za-z0-9_.-]+$/.test(String(requestId ?? ''));
}

function entryMtimeMs(entry) {
  try {
    return statSync(entry.path).mtimeMs;
  } catch {
    return 0;
  }
}

function summarizeDecisionEntry(entry) {
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
