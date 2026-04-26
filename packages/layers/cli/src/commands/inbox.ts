import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  type InboxAuthorityLevel,
  type InboxEnvelopeKind,
  type InboxEnvelopeStatus,
  type InboxPromotionTargetKind,
  type InboxSourceKind,
  SqliteInboxStore,
} from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';

export interface InboxCommandOptions {
  cwd?: string;
  format?: CliFormat;
  store?: SqliteInboxStore;
}

export interface InboxSubmitOptions extends InboxCommandOptions {
  sourceKind?: string;
  sourceRef?: string;
  kind?: string;
  authorityLevel?: string;
  principal?: string;
  payload?: string;
}

export interface InboxListOptions extends InboxCommandOptions {
  status?: string;
  limit?: number;
}

export interface InboxShowOptions extends InboxCommandOptions {
  envelopeId?: string;
}

export interface InboxPromoteOptions extends InboxCommandOptions {
  envelopeId?: string;
  targetKind?: string;
  targetRef?: string;
  by?: string;
}

export async function inboxSubmitCommand(options: InboxSubmitOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const sourceKind = parseSourceKind(options.sourceKind);
  const kind = parseEnvelopeKind(options.kind);
  const authorityLevel = parseAuthorityLevel(options.authorityLevel);
  const sourceRef = options.sourceRef;
  if (!sourceKind || !kind || !authorityLevel || !sourceRef) {
    return errorResult('Missing or invalid --source-kind, --source-ref, --kind, or --authority-level');
  }
  const payload = parsePayload(options.payload);
  if (payload instanceof Error) return errorResult(payload.message);

  return withInboxStore(options, (store) => {
    const envelope = store.insert({
      envelope_id: `env_${randomUUID()}`,
      received_at: new Date().toISOString(),
      source: { kind: sourceKind, ref: sourceRef },
      kind,
      authority: {
        level: authorityLevel,
        ...(options.principal ? { principal: options.principal } : {}),
      },
      payload,
    });
    return okResult(
      { status: 'success', envelope },
      [
        `Inbox envelope received: ${envelope.envelope_id}`,
        `Kind: ${envelope.kind}`,
        `Source: ${envelope.source.kind}:${envelope.source.ref}`,
        `Status: ${envelope.status}`,
      ],
      options.format,
    );
  });
}

export async function inboxListCommand(options: InboxListOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = options.status ? parseStatus(options.status) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  return withInboxStore(options, (store) => {
    const envelopes = store.list({ status, limit: options.limit });
    return okResult(
      { status: 'success', count: envelopes.length, envelopes },
      [
        `Inbox envelopes: ${envelopes.length}`,
        ...envelopes.map((envelope: { envelope_id: string; status: string; kind: string; source: { kind: string; ref: string } }) =>
          `${envelope.envelope_id}  ${envelope.status}  ${envelope.kind}  ${envelope.source.kind}:${envelope.source.ref}`),
      ],
      options.format,
    );
  });
}

export async function inboxShowCommand(options: InboxShowOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.envelopeId) return errorResult('Missing envelope ID');
  return withInboxStore(options, (store) => {
    const envelope = store.get(options.envelopeId!);
    if (!envelope) return errorResult(`Inbox envelope not found: ${options.envelopeId}`);
    return okResult(
      { status: 'success', envelope },
      [
        `Inbox envelope: ${envelope.envelope_id}`,
        `Status: ${envelope.status}`,
        `Kind: ${envelope.kind}`,
        `Source: ${envelope.source.kind}:${envelope.source.ref}`,
        `Authority: ${envelope.authority.level}${envelope.authority.principal ? ` (${envelope.authority.principal})` : ''}`,
        `Promotion: ${envelope.promotion ? `${envelope.promotion.target_kind}:${envelope.promotion.target_ref}` : 'none'}`,
      ],
      options.format,
    );
  });
}

export async function inboxPromoteCommand(options: InboxPromoteOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const targetKind = parsePromotionTargetKind(options.targetKind);
  if (!options.envelopeId || !targetKind || !options.targetRef || !options.by) {
    return errorResult('Missing or invalid envelope ID, --target-kind, --target-ref, or --by');
  }
  return withInboxStore(options, (store) => {
    try {
      const envelope = store.promote(options.envelopeId!, {
        target_kind: targetKind,
        target_ref: options.targetRef!,
        promoted_at: new Date().toISOString(),
        promoted_by: options.by!,
      });
      return okResult(
        { status: 'success', envelope },
        [
          `Inbox envelope promoted: ${envelope.envelope_id}`,
          `Target: ${targetKind}:${options.targetRef}`,
          `Promoted by: ${options.by}`,
        ],
        options.format,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  });
}

function withInboxStore(
  options: InboxCommandOptions,
  run: (store: SqliteInboxStore) => { exitCode: ExitCode; result: unknown },
): { exitCode: ExitCode; result: unknown } {
  if (options.store) return run(options.store);
  const store = new SqliteInboxStore(join(options.cwd ?? process.cwd(), '.ai', 'inbox.db'));
  try {
    return run(store);
  } finally {
    store.close();
  }
}

function okResult(result: Record<string, unknown>, human: string[], format: CliFormat = 'auto'): { exitCode: ExitCode; result: unknown } {
  return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, human, format) };
}

function errorResult(error: string): { exitCode: ExitCode; result: unknown } {
  return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error } };
}

function parsePayload(payload: string | undefined): unknown | Error {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`Invalid JSON payload: ${message}`);
  }
}

function parseSourceKind(value: string | undefined): InboxSourceKind | undefined {
  return oneOf(value, ['user_chat', 'email', 'diagnostic', 'agent_report', 'file_drop', 'cli', 'webhook', 'system_observation']);
}

function parseEnvelopeKind(value: string | undefined): InboxEnvelopeKind | undefined {
  return oneOf(value, ['proposal', 'observation', 'command_request', 'question', 'knowledge_candidate', 'task_candidate', 'incident', 'upstream_task_candidate']);
}

function parseAuthorityLevel(value: string | undefined): InboxAuthorityLevel | undefined {
  return oneOf(value, ['none', 'user_statement', 'operator_confirmed', 'system_observed', 'agent_reported']);
}

function parseStatus(value: string | undefined): InboxEnvelopeStatus | undefined {
  return oneOf(value, ['received', 'classified', 'accepted', 'rejected', 'promoted', 'archived', 'superseded']);
}

function parsePromotionTargetKind(value: string | undefined): InboxPromotionTargetKind | undefined {
  return oneOf(value, ['task', 'decision', 'operator_action', 'knowledge_entry', 'site_config_change', 'archive']);
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}
