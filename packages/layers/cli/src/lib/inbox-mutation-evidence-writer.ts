import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildMutationEvidenceRecord,
  serializeMutationEvidenceRecord,
  type MutationEvidenceAuthorityClass,
} from '@narada2/task-governance/mutation-evidence';
import type { InboxEnvelope } from '@narada2/control-plane';
import { governanceFreshnessEvidence } from './governance-freshness.js';

export interface InboxMutationEvidenceState {
  envelope_id: string;
  status: string;
  kind: string;
  source_kind: string;
  source_ref: string;
  authority_level: string;
  authority_principal: string | null;
  handling_by: string | null;
  promotion_target_kind: string | null;
  promotion_target_ref: string | null;
  promotion_enactment_status: string | null;
}

export interface WriteInboxMutationEvidenceOptions {
  cwd: string;
  command: string;
  principal?: string | null;
  authorityClass: MutationEvidenceAuthorityClass;
  before: InboxMutationEvidenceState | null;
  after: InboxMutationEvidenceState | null;
  result: unknown;
  occurredAt?: string | null;
  confirmationKind?: 'read_back' | 'import_replay';
}

export function inboxEnvelopeToEvidenceState(envelope: InboxEnvelope | null): InboxMutationEvidenceState | null {
  if (!envelope) return null;
  return {
    envelope_id: envelope.envelope_id,
    status: envelope.status,
    kind: envelope.kind,
    source_kind: envelope.source.kind,
    source_ref: envelope.source.ref,
    authority_level: envelope.authority.level,
    authority_principal: envelope.authority.principal ?? null,
    handling_by: envelope.handling?.handled_by ?? null,
    promotion_target_kind: envelope.promotion?.target_kind ?? null,
    promotion_target_ref: envelope.promotion?.target_ref ?? null,
    promotion_enactment_status: envelope.promotion?.enactment_status ?? null,
  };
}

export async function writeInboxMutationEvidence(
  options: WriteInboxMutationEvidenceOptions,
): Promise<{ operation_id: string; path: string; wrote: boolean } | null> {
  const envelopeId = options.after?.envelope_id ?? options.before?.envelope_id;
  if (!envelopeId) return null;
  const occurredAt = options.occurredAt
    ?? extractTimestamp(options.result)
    ?? new Date().toISOString();
  const freshness = governanceFreshnessEvidence(options.command);
  const record = buildMutationEvidenceRecord({
    family: 'inbox',
    authority_class: options.authorityClass,
    command: options.command,
    locus: options.cwd,
    principal: options.principal?.trim() || 'operator',
    subject: {
      kind: 'inbox_envelope',
      id: envelopeId,
      number: null,
    },
    before: options.before ? { ...options.before } : null,
    after: options.after ? { ...options.after } : null,
    occurred_at: occurredAt,
    confirmation: {
      kind: options.confirmationKind ?? 'read_back',
      status: options.after ? 'confirmed' : 'pending',
      detail: options.confirmationKind === 'import_replay'
        ? `import replay read back envelope ${envelopeId} as ${options.after?.status ?? 'unknown'}`
        : `inbox envelope ${envelopeId} read back as ${options.after?.status ?? 'unknown'}`,
    },
    replay_payload: {
      envelope_id: envelopeId,
      before_status: options.before?.status ?? null,
      after_status: options.after?.status ?? null,
      promotion_target_kind: options.after?.promotion_target_kind ?? null,
      promotion_target_ref: options.after?.promotion_target_ref ?? null,
      transition: inboxTransitionEvidence(options),
      envelope: extractEnvelope(options.result),
      command_result: summarizeCommandResult(options.result),
      ...(freshness ? { governance_freshness: freshness } : {}),
    },
  });

  const dir = join(options.cwd, '.ai', 'mutation-evidence', 'inbox');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${record.operation_id}.json`);
  const body = serializeMutationEvidenceRecord(record);
  const existing = await readExisting(path);
  if (existing === body) {
    return { operation_id: record.operation_id, path, wrote: false };
  }
  await writeFile(path, body, { flag: 'wx' });
  return { operation_id: record.operation_id, path, wrote: true };
}

async function readExisting(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function inboxTransitionEvidence(options: WriteInboxMutationEvidenceOptions): Record<string, unknown> {
  return {
    family: 'inbox',
    command: options.command,
    authority_class: options.authorityClass,
    confirmation_kind: options.confirmationKind ?? 'read_back',
    subject_id: options.after?.envelope_id ?? options.before?.envelope_id ?? null,
    source_status: options.before?.status ?? null,
    target_status: options.after?.status ?? null,
    source_handling_by: options.before?.handling_by ?? null,
    target_handling_by: options.after?.handling_by ?? null,
    source_promotion_target_kind: options.before?.promotion_target_kind ?? null,
    target_promotion_target_kind: options.after?.promotion_target_kind ?? null,
    source_promotion_target_ref: options.before?.promotion_target_ref ?? null,
    target_promotion_target_ref: options.after?.promotion_target_ref ?? null,
    source_promotion_enactment_status: options.before?.promotion_enactment_status ?? null,
    target_promotion_enactment_status: options.after?.promotion_enactment_status ?? null,
    normalized: true,
  };
}

function extractTimestamp(result: unknown): string | null {
  const envelope = extractEnvelope(result);
  return envelope?.promotion?.promoted_at ?? envelope?.handling?.claimed_at ?? envelope?.received_at ?? null;
}

function extractEnvelope(result: unknown): InboxEnvelope | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  return record.envelope && typeof record.envelope === 'object'
    ? record.envelope as InboxEnvelope
    : null;
}

function summarizeCommandResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { value: result };
  const record = result as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of [
    'status',
    'enactment_status',
    'target_mutation',
    'pending_kind',
    'already_promoted',
    'imported',
    'skipped',
  ]) {
    if (key in record) summary[key] = record[key];
  }
  const envelope = extractEnvelope(result);
  if (envelope) {
    summary.envelope_id = envelope.envelope_id;
    summary.envelope_status = envelope.status;
    summary.promotion_target_kind = envelope.promotion?.target_kind ?? null;
    summary.promotion_target_ref = envelope.promotion?.target_ref ?? null;
  }
  return summary;
}
