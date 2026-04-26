import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  type InboxAuthorityLevel,
  type InboxEnvelope,
  type InboxEnvelopeKind,
  type InboxEnvelopeStatus,
  type InboxPromotionTargetKind,
  type InboxSourceKind,
  SqliteInboxStore,
} from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { taskCreateCommand } from './task-create.js';

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
  kind?: string;
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
  title?: string;
  goal?: string;
  criteria?: string[];
}

export interface InboxNextOptions extends InboxListOptions {}

export interface InboxWorkNextOptions extends InboxNextOptions {}

export interface InboxTriageOptions extends Omit<InboxPromoteOptions, 'targetKind'> {
  action?: string;
  targetKind?: string;
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

  return withInboxStoreAsync(options, async (store) => {
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
  const kind = options.kind ? parseEnvelopeKind(options.kind) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  if (options.kind && !kind) return errorResult(`Invalid kind: ${options.kind}`);
  return withInboxStoreAsync(options, async (store) => {
    const envelopes = selectEnvelopes(store, { status, kind, limit: options.limit });
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

export async function inboxNextCommand(options: InboxNextOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = options.status ? parseStatus(options.status) : 'received';
  const kind = options.kind ? parseEnvelopeKind(options.kind) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  if (options.kind && !kind) return errorResult(`Invalid kind: ${options.kind}`);

  return withInboxStoreAsync(options, async (store) => {
    const limit = clampLimit(options.limit ?? 5);
    const envelopes = selectEnvelopes(store, { status, kind, limit });
    const [primary, ...alternatives] = envelopes;
    return okResult(
      {
        status: 'success',
        primary: primary ?? null,
        alternatives,
        count: envelopes.length,
      },
      primary
        ? [
          `Next inbox envelope: ${primary.envelope_id}`,
          `Kind: ${primary.kind}`,
          `Source: ${primary.source.kind}:${primary.source.ref}`,
          `Alternatives: ${alternatives.length}`,
        ]
        : ['No matching inbox envelopes.'],
      options.format,
    );
  });
}

export async function inboxWorkNextCommand(options: InboxWorkNextOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const status = options.status ? parseStatus(options.status) : 'received';
  const kind = options.kind ? parseEnvelopeKind(options.kind) : undefined;
  if (options.status && !status) return errorResult(`Invalid status: ${options.status}`);
  if (options.kind && !kind) return errorResult(`Invalid kind: ${options.kind}`);

  return withInboxStoreAsync(options, async (store) => {
    const limit = clampLimit(options.limit ?? 5);
    const envelopes = selectEnvelopes(store, { status, kind, limit });
    const [primary, ...alternatives] = envelopes;
    const admissibleActions = primary ? admissibleActionsForEnvelope(primary) : [];
    return okResult(
      {
        status: 'success',
        primary: primary ?? null,
        admissible_actions: admissibleActions,
        alternatives,
        alternatives_count: alternatives.length,
      },
      primary
        ? [
          `Next inbox work: ${primary.envelope_id}`,
          `Kind: ${primary.kind}`,
          `Admissible actions: ${admissibleActions.map((action) => action.action).join(', ') || 'none'}`,
          `Alternatives: ${alternatives.length}`,
        ]
        : ['No matching inbox work.'],
      options.format,
    );
  });
}

export async function inboxShowCommand(options: InboxShowOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (!options.envelopeId) return errorResult('Missing envelope ID');
  return withInboxStoreAsync(options, async (store) => {
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
  if (!options.envelopeId || !targetKind || !options.by) {
    return errorResult('Missing or invalid envelope ID, --target-kind, or --by');
  }
  if (targetKind !== 'archive' && targetKind !== 'task' && !options.targetRef) {
    return errorResult('Missing --target-ref for non-archive promotion');
  }
  return withInboxStoreAsync(options, async (store) => {
    const existing = store.get(options.envelopeId!);
    if (!existing) return errorResult(`Inbox envelope not found: ${options.envelopeId}`);
    if (existing.promotion?.target_kind === targetKind) {
      return okResult(
        {
          status: 'success',
          already_promoted: true,
          enactment_status: existing.promotion.enactment_status ?? 'recorded',
          envelope: existing,
        },
        [
          `Inbox envelope already promoted: ${existing.envelope_id}`,
          `Target: ${existing.promotion.target_kind}:${existing.promotion.target_ref}`,
          `Enactment: ${existing.promotion.enactment_status ?? 'recorded'}`,
        ],
        options.format,
      );
    }

    try {
      if (targetKind === 'archive') {
        const envelope = store.archive(options.envelopeId!, {
          target_kind: 'archive',
          target_ref: options.targetRef ?? `archive:${options.envelopeId}`,
          promoted_at: new Date().toISOString(),
          promoted_by: options.by!,
          enactment_status: 'recorded',
          note: 'Envelope archived; no target-zone mutation was performed.',
        });
        return okResult(
          {
            status: 'success',
            enactment_status: 'recorded',
            target_mutation: false,
            envelope,
          },
          [
            `Inbox envelope archived: ${envelope.envelope_id}`,
            'Target mutation: none',
            `Promoted by: ${options.by}`,
          ],
          options.format,
        );
      }

      if (targetKind === 'task') {
        const taskResult = await createTaskFromEnvelope(existing, options);
        if (taskResult.exitCode !== ExitCode.SUCCESS) return taskResult;
        const task = taskResult.result as { task_number: number; task_id: string };
        const envelope = store.promote(options.envelopeId!, {
          target_kind: 'task',
          target_ref: `task:${task.task_number}`,
          promoted_at: new Date().toISOString(),
          promoted_by: options.by!,
          enactment_status: 'enacted',
          target_command: 'task create',
          target_result: taskResult.result,
        });
        return okResult(
          {
            status: 'success',
            enactment_status: 'enacted',
            target_mutation: true,
            target: taskResult.result,
            envelope,
          },
          [
            `Inbox envelope promoted: ${envelope.envelope_id}`,
            `Created task: ${task.task_number}`,
            `Promoted by: ${options.by}`,
          ],
          options.format,
        );
      }

      const envelope = store.promote(options.envelopeId!, {
        target_kind: targetKind,
        target_ref: options.targetRef!,
        promoted_at: new Date().toISOString(),
        promoted_by: options.by!,
        enactment_status: 'pending',
        note: `recorded_pending_crossing: executable promotion for target kind '${targetKind}' is not implemented yet.`,
      });
      return okResult(
        {
          status: 'success',
          enactment_status: 'pending',
          pending_kind: 'recorded_pending_crossing',
          target_mutation: false,
          envelope,
        },
        [
          `Inbox envelope recorded as pending crossing: ${envelope.envelope_id}`,
          `Target: ${targetKind}:${options.targetRef}`,
          'Enactment: pending (not executed)',
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

export async function inboxTaskCommand(options: Omit<InboxPromoteOptions, 'targetKind'>): Promise<{ exitCode: ExitCode; result: unknown }> {
  return inboxPromoteCommand({
    ...options,
    targetKind: 'task',
    targetRef: options.targetRef ?? options.title,
  });
}

export async function inboxTriageCommand(options: InboxTriageOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  switch (options.action) {
    case 'archive':
      return inboxPromoteCommand({ ...options, targetKind: 'archive' });
    case 'task':
      return inboxTaskCommand(options);
    case 'pending':
      if (!options.targetKind || options.targetKind === 'task' || options.targetKind === 'archive') {
        return errorResult('--target-kind must be a pending target kind for --action pending');
      }
      if (!options.targetRef) {
        return errorResult('--target-ref is required for --action pending');
      }
      return inboxPromoteCommand(options);
    default:
      return errorResult('--action must be one of: archive, task, pending');
  }
}

function admissibleActionsForEnvelope(envelope: InboxEnvelope): Array<Record<string, unknown>> {
  if (envelope.status !== 'received') {
    return [];
  }
  const actions: Array<Record<string, unknown>> = [
    {
      action: 'archive',
      command: `narada inbox triage ${envelope.envelope_id} --action archive --by <principal>`,
      mutates: true,
      target_mutation: false,
    },
    {
      action: 'pending',
      command: `narada inbox triage ${envelope.envelope_id} --action pending --target-kind <kind> --target-ref <ref> --by <principal>`,
      mutates: true,
      target_mutation: false,
      pending_kind: 'recorded_pending_crossing',
    },
  ];
  if (envelope.kind === 'task_candidate' || envelope.kind === 'upstream_task_candidate') {
    actions.unshift({
      action: 'task',
      command: `narada inbox task ${envelope.envelope_id} --by <principal>`,
      mutates: true,
      target_mutation: true,
    });
  }
  return actions;
}

function selectEnvelopes(
  store: SqliteInboxStore,
  options: { status?: InboxEnvelopeStatus; kind?: InboxEnvelopeKind; limit?: number },
): InboxEnvelope[] {
  const limit = clampLimit(options.limit ?? 20);
  const scanLimit = options.kind ? 200 : limit;
  return store
    .list({ status: options.status, limit: scanLimit })
    .filter((envelope) => !options.kind || envelope.kind === options.kind)
    .slice(0, limit);
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(limit, 50));
}

async function createTaskFromEnvelope(
  envelope: InboxEnvelope,
  options: InboxPromoteOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (envelope.kind !== 'task_candidate' && envelope.kind !== 'upstream_task_candidate') {
    return errorResult(`Envelope kind '${envelope.kind}' cannot be enacted as task`);
  }

  const payload = asRecord(envelope.payload);
  const title = cleanString(options.title)
    ?? stringField(payload, 'title')
    ?? stringField(payload, 'summary')
    ?? options.targetRef
    ?? `Inbox envelope ${envelope.envelope_id}`;
  const goal = cleanString(options.goal)
    ?? stringField(payload, 'goal')
    ?? stringField(payload, 'description')
    ?? `Promoted from inbox envelope ${envelope.envelope_id}.`;
  const criteria = cleanStringArray(options.criteria)
    ?? stringArrayField(payload, 'acceptance_criteria')
    ?? stringArrayField(payload, 'criteria')
    ?? [`Inbox envelope ${envelope.envelope_id} has been handled.`];

  return taskCreateCommand({
    cwd: options.cwd,
    title,
    goal,
    criteria,
    chapter: stringField(payload, 'chapter') ?? 'Canonical Inbox Promotions',
    dependsOn: numberArrayCsvField(payload, 'depends_on'),
    format: 'json',
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

async function withInboxStoreAsync(
  options: InboxCommandOptions,
  run: (store: SqliteInboxStore) => Promise<{ exitCode: ExitCode; result: unknown }>,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  if (options.store) return run(options.store);
  const store = new SqliteInboxStore(join(options.cwd ?? process.cwd(), '.ai', 'inbox.db'));
  try {
    return await run(store);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length > 0 ? strings.map((item) => item.trim()) : undefined;
}

function cleanString(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanStringArray(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  const strings = value.filter((item) => item.trim().length > 0).map((item) => item.trim());
  return strings.length > 0 ? strings : undefined;
}

function numberArrayCsvField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const numbers = value
    .map((item) => typeof item === 'number' ? item : Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
  return numbers.length > 0 ? numbers.join(',') : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}
