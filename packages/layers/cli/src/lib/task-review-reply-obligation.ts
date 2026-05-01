import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { SqliteInboxStore, type InboxEnvelope } from '@narada2/control-plane';
import { readOperatorSurfaceIdentities } from './operator-surface-registry.js';
import {
  inboxEnvelopeToEvidenceState,
  writeInboxMutationEvidence,
} from './inbox-mutation-evidence-writer.js';

export interface ReviewReplyFinding {
  severity: string;
  description: string;
  location?: string | null;
}

export interface ReviewReplyObligationOptions {
  cwd: string;
  taskNumber?: string;
  taskId?: string;
  reviewer?: string;
  verdict?: string;
  reviewId?: string;
  admissionId?: string;
  newStatus?: string;
  closeAction?: string;
  evidenceBlocked?: boolean;
  evidenceReason?: string;
  closeBlockers?: string[];
  findings?: ReviewReplyFinding[];
}

export interface ReviewReplyObligationResult {
  status: 'not_applicable' | 'queued' | 'inbox' | 'deferred' | 'failed';
  obligation_id?: string;
  requester_identity?: string;
  source_envelope_id?: string;
  delivery_channel?: 'operator_surface' | 'canonical_inbox' | 'none';
  delivery_status?: 'queued' | 'inbox' | 'deferred' | 'failed';
  queue_artifact?: string;
  inbox_envelope_id?: string;
  mutation_evidence_path?: string;
  reason?: string;
  next_expected_action?: string;
}

interface OperatorSurfaceRuntimeBinding {
  binding_id?: string;
  identity_id: string;
  runtime_locus?: string;
  handle?: string;
  transport?: string;
  status?: 'active' | 'stale' | 'revoked';
  stale_after?: string;
}

interface ReviewReplyPayload {
  message_type: 'review_result';
  obligation_id: string;
  source_envelope_id: string;
  task_number: number | null;
  task_id: string | null;
  verdict: string | null;
  review_id: string | null;
  evidence_id: string | null;
  blocking_findings: ReviewReplyFinding[];
  residual_notes: string[];
  next_expected_action: string;
}

export async function routeReviewReplyObligation(
  options: ReviewReplyObligationOptions,
): Promise<ReviewReplyObligationResult> {
  try {
    const taskNumber = Number(options.taskNumber);
    if (!Number.isFinite(taskNumber)) {
      return { status: 'not_applicable', reason: 'missing_task_number' };
    }
    const source = findReviewRequestEnvelope(options.cwd, taskNumber);
    if (!source) {
      return { status: 'not_applicable', reason: 'no_review_request_source' };
    }
    const requester = requesterFromEnvelope(source);
    if (!requester) {
      return {
        status: 'deferred',
        source_envelope_id: source.envelope_id,
        delivery_channel: 'none',
        delivery_status: 'deferred',
        reason: 'review_request_has_no_requester_identity',
      };
    }

    const obligationId = `review_reply_${options.reviewId ?? randomUUID()}`;
    const payload = buildReviewReplyPayload(options, {
      obligationId,
      sourceEnvelopeId: source.envelope_id,
      taskNumber,
    });
    const activeBinding = await activeOperatorSurfaceBindingFor(options.cwd, requester);
    if (activeBinding) {
      const queueArtifact = await writeReviewReplyQueueArtifact(options.cwd, requester, activeBinding, payload);
      return {
        status: 'queued',
        obligation_id: obligationId,
        requester_identity: requester,
        source_envelope_id: source.envelope_id,
        delivery_channel: 'operator_surface',
        delivery_status: 'queued',
        queue_artifact: relative(options.cwd, queueArtifact),
        next_expected_action: payload.next_expected_action,
      };
    }

    const inbox = await writeReviewReplyInboxEnvelope(options.cwd, requester, options.reviewer, payload);
    return {
      status: 'inbox',
      obligation_id: obligationId,
      requester_identity: requester,
      source_envelope_id: source.envelope_id,
      delivery_channel: 'canonical_inbox',
      delivery_status: 'inbox',
      inbox_envelope_id: inbox.envelope.envelope_id,
      mutation_evidence_path: inbox.mutationEvidencePath ? relative(options.cwd, inbox.mutationEvidencePath) : undefined,
      reason: 'operator_surface_not_reachable',
      next_expected_action: payload.next_expected_action,
    };
  } catch (error) {
    return {
      status: 'failed',
      delivery_channel: 'none',
      delivery_status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function findReviewRequestEnvelope(cwd: string, taskNumber: number): InboxEnvelope | null {
  const store = new SqliteInboxStore(join(resolve(cwd), '.ai', 'inbox.db'));
  try {
    const envelopes = store.list({ limit: 200 });
    return envelopes.find((envelope) => (
      envelope.promotion?.target_kind === 'task' &&
      envelope.promotion.target_ref === `task:${taskNumber}` &&
      looksLikeReviewRequest(envelope)
    )) ?? null;
  } finally {
    store.close();
  }
}

function looksLikeReviewRequest(envelope: InboxEnvelope): boolean {
  const payload = objectPayload(envelope.payload);
  const requestedCrossing = stringField(payload, 'requested_crossing')
    ?? stringField(payload, 'requestedCrossing')
    ?? stringField(payload, 'message_kind')
    ?? stringField(payload, 'message_type')
    ?? stringField(payload, 'packet_type');
  if (requestedCrossing?.includes('review_request')) return true;
  if (requestedCrossing === 'task_handoff') return true;
  if (envelope.source.kind === 'agent_report' && envelope.authority.principal) return true;
  return false;
}

function requesterFromEnvelope(envelope: InboxEnvelope): string | null {
  const payload = objectPayload(envelope.payload);
  return stringField(payload, 'requester_identity')
    ?? stringField(payload, 'requester_id')
    ?? stringField(payload, 'from_identity')
    ?? stringField(payload, 'from')
    ?? envelope.authority.principal
    ?? null;
}

function buildReviewReplyPayload(
  options: ReviewReplyObligationOptions,
  args: { obligationId: string; sourceEnvelopeId: string; taskNumber: number },
): ReviewReplyPayload {
  const blockingFindings = (options.findings ?? []).filter((finding) => finding.severity === 'blocking');
  const residualNotes = [
    ...(options.findings ?? [])
      .filter((finding) => finding.severity !== 'blocking')
      .map((finding) => finding.description),
    ...(options.closeBlockers ?? []),
    ...(options.evidenceReason ? [options.evidenceReason] : []),
  ].filter((entry) => entry.trim().length > 0);
  return {
    message_type: 'review_result',
    obligation_id: args.obligationId,
    source_envelope_id: args.sourceEnvelopeId,
    task_number: args.taskNumber,
    task_id: options.taskId ?? null,
    verdict: options.verdict ?? null,
    review_id: options.reviewId ?? null,
    evidence_id: options.admissionId ?? null,
    blocking_findings: blockingFindings,
    residual_notes: residualNotes,
    next_expected_action: nextExpectedAction(options, blockingFindings),
  };
}

function nextExpectedAction(options: ReviewReplyObligationOptions, blockingFindings: ReviewReplyFinding[]): string {
  if (options.verdict === 'rejected' || blockingFindings.length > 0) {
    return 'address blocking findings, report completion, and request review again';
  }
  if (options.evidenceBlocked || options.newStatus === 'needs_continuation') {
    return 'continue evidence repair and resubmit completion evidence';
  }
  if (options.newStatus === 'closed') {
    return 'no further action required for this task';
  }
  return `observe task status ${options.newStatus ?? 'unknown'} and continue through the governed lifecycle`;
}

async function activeOperatorSurfaceBindingFor(
  cwd: string,
  requester: string,
): Promise<OperatorSurfaceRuntimeBinding | null> {
  const registry = await readOperatorSurfaceIdentities(cwd);
  if (!registry.identities.some((identity) => identity.identity_id === requester)) return null;
  const bindings = await readRuntimeBindings(cwd);
  return bindings.find((binding) => binding.identity_id === requester && !isStaleBinding(binding)) ?? null;
}

async function readRuntimeBindings(cwd: string): Promise<OperatorSurfaceRuntimeBinding[]> {
  const path = join(resolve(cwd), 'operator-surfaces', 'runtime-bindings.json');
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { bindings?: OperatorSurfaceRuntimeBinding[] } | OperatorSurfaceRuntimeBinding[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.bindings) ? parsed.bindings : [];
}

function isStaleBinding(binding: OperatorSurfaceRuntimeBinding): boolean {
  if (binding.status === 'stale' || binding.status === 'revoked') return true;
  if (!binding.stale_after) return false;
  const timestamp = Date.parse(binding.stale_after);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function writeReviewReplyQueueArtifact(
  cwd: string,
  requester: string,
  binding: OperatorSurfaceRuntimeBinding,
  payload: ReviewReplyPayload,
): Promise<string> {
  const dir = join(resolve(cwd), '.ai', 'operator-surface-delivery-queue');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `osdq_${payload.obligation_id}.json`);
  await writeFile(path, `${JSON.stringify({
    promise_id: `osdq_${payload.obligation_id}`,
    kind: 'review_result',
    status: 'promised',
    target_identity: requester,
    runtime_locus: binding.runtime_locus ?? null,
    binding_id: binding.binding_id ?? null,
    created_at: new Date().toISOString(),
    payload,
  }, null, 2)}\n`, 'utf8');
  return path;
}

async function writeReviewReplyInboxEnvelope(
  cwd: string,
  requester: string,
  reviewer: string | undefined,
  payload: ReviewReplyPayload,
): Promise<{ envelope: InboxEnvelope; mutationEvidencePath: string | null }> {
  const store = new SqliteInboxStore(join(resolve(cwd), '.ai', 'inbox.db'));
  try {
    const envelope = store.insert({
      envelope_id: `env_review_reply_${randomUUID()}`,
      received_at: new Date().toISOString(),
      source: { kind: 'system_observation', ref: `task-review:${payload.review_id ?? payload.obligation_id}` },
      target_locus: requester,
      kind: 'observation',
      authority: { level: 'system_observed', principal: reviewer ?? 'task-review' },
      payload: {
        title: `Review result for task ${payload.task_number ?? payload.task_id ?? 'unknown'}`,
        ...payload,
      },
    });
    await writePortableInboxEnvelope(cwd, envelope);
    const mutation = await writeInboxMutationEvidence({
      cwd,
      command: 'task review reply obligation',
      principal: reviewer,
      authorityClass: 'claim',
      before: null,
      after: inboxEnvelopeToEvidenceState(envelope),
      result: {
        status: 'success',
        envelope,
        target_mutation: 'review_reply_inbox_envelope',
      },
    });
    return { envelope, mutationEvidencePath: mutation?.path ?? null };
  } finally {
    store.close();
  }
}

async function writePortableInboxEnvelope(cwd: string, envelope: InboxEnvelope): Promise<string> {
  const outDir = resolve(cwd, '.ai', 'inbox-envelopes');
  await mkdir(outDir, { recursive: true });
  const fileName = `${envelope.received_at.replace(/[:.]/g, '-')}-${envelope.envelope_id}.json`;
  const path = join(outDir, fileName);
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return path;
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
