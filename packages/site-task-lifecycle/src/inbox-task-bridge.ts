import { createHash } from 'node:crypto';
import { assertNeutralIdentities, findDeniedSourceImports } from './import-refusal.js';
import type { ExternalInboxEnvelope, NeutralIdentity, TaskCandidate } from './types.js';

export class SourceInboxHistoryImportError extends Error {
  constructor(sourceRef: string) {
    super(`Inbox bridge accepts one envelope at a time, not source inbox history: ${sourceRef}`);
    this.name = 'SourceInboxHistoryImportError';
  }
}

export function deriveTaskCandidateId(envelope: Pick<ExternalInboxEnvelope, 'sourceSite' | 'sourceRef' | 'envelopeId'>): string {
  const digest = createHash('sha256')
    .update(`${envelope.sourceSite}\n${envelope.sourceRef}\n${envelope.envelopeId}`)
    .digest('hex')
    .slice(0, 16);
  return `task-candidate-${digest}`;
}

export function projectInboxEnvelopeToTaskCandidate(
  envelope: ExternalInboxEnvelope,
  requestedBy?: NeutralIdentity,
): TaskCandidate {
  const sourceRefs = [envelope.sourceRef, ...(envelope.evidencePaths ?? [])];
  const findings = findDeniedSourceImports(sourceRefs);
  const historyImport = findings.find((finding) => finding.reason.includes('inbox'));
  if (historyImport) {
    throw new SourceInboxHistoryImportError(historyImport.path);
  }

  if (requestedBy) {
    assertNeutralIdentities([requestedBy]);
  }

  return {
    schema: 'narada.site_task_lifecycle.task_candidate.v0',
    taskId: deriveTaskCandidateId(envelope),
    title: envelope.summary,
    sourceSite: envelope.sourceSite,
    sourceRef: envelope.sourceRef,
    receivedAt: envelope.receivedAt,
    summary: envelope.bodyText ?? envelope.summary,
    status: 'pending_admission',
    evidenceRefs: sourceRefs,
    requestedBy: requestedBy?.identityId ?? envelope.requestedBy,
    rejectedSourceFindings: findings,
  };
}
