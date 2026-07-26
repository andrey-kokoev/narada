import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA = 'narada.nars.operator_input_queue_state.v1' as const;

export interface NarsOperatorInputQueueItem {
  event_id?: unknown;
  source?: unknown;
  source_kind?: unknown;
  source_id?: unknown;
  transport?: unknown;
  delivery_mode?: unknown;
  hold_condition?: unknown;
  created_at?: unknown;
  received_at?: unknown;
  authority_ref?: unknown;
  directive_id?: unknown;
  request_id?: unknown;
  idempotency_key?: unknown;
  admission_state?: unknown;
  content?: unknown;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NarsOperatorInputQueueState {
  schema: typeof NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA;
  path: string | null;
  updated_at: string | null;
  revision: number;
  pending_count: number;
  pending: NarsOperatorInputQueueItem[];
  last_transition: unknown;
  corrupt: boolean;
}

export interface NarsOperatorInputQueueStateInput {
  revision?: unknown;
  pending?: readonly unknown[];
  last_transition?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function operatorInputQueueStatePathFromSessionPath(sessionPath: string | null | undefined): string | null {
  if (!sessionPath) return null;
  return join(dirname(String(sessionPath)), 'operator-input-queue.json');
}

export function readOperatorInputQueueState(path: string | null | undefined): NarsOperatorInputQueueState {
  if (!path || !existsSync(path)) return emptyOperatorInputQueueState({ path });
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed) || parsed.schema !== NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA || !Array.isArray(parsed.pending)) {
      return emptyOperatorInputQueueState({ path, corrupt: true });
    }
    return {
      schema: NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA,
      path,
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
      revision: Number(parsed.revision ?? 0),
      pending_count: parsed.pending.length,
      pending: parsed.pending.filter((item): item is NarsOperatorInputQueueItem => isRecord(item)),
      last_transition: parsed.last_transition ?? null,
      corrupt: false,
    };
  } catch {
    return emptyOperatorInputQueueState({ path, corrupt: true });
  }
}

export function writeOperatorInputQueueState(path: string | null | undefined, state: NarsOperatorInputQueueStateInput = {}): NarsOperatorInputQueueState | null {
  if (!path) return null;
  const next = {
    schema: NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA,
    updated_at: new Date().toISOString(),
    revision: Number(state.revision ?? 0) + 1,
    pending_count: Array.isArray(state.pending) ? state.pending.length : 0,
    pending: Array.isArray(state.pending) ? state.pending.map((item) => toPersistedInputItem(isRecord(item) ? item : {})) : [],
    last_transition: state.last_transition ?? null,
  };
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, path);
  return { ...next, path, corrupt: false };
}

export function emptyOperatorInputQueueState({ path = null, corrupt = false }: { path?: string | null; corrupt?: boolean } = {}): NarsOperatorInputQueueState {
  return {
    schema: NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA,
    path,
    updated_at: null,
    revision: 0,
    pending_count: 0,
    pending: [],
    last_transition: null,
    corrupt,
  };
}

function toPersistedInputItem(item: Record<string, unknown> = {}): NarsOperatorInputQueueItem {
  return {
    event_id: item.event_id,
    source: item.source,
    source_kind: item.source_kind,
    source_id: item.source_id,
    transport: item.transport,
    delivery_mode: item.delivery_mode,
    hold_condition: item.hold_condition ?? null,
    created_at: item.created_at,
    received_at: item.received_at ?? item.created_at ?? null,
    authority_ref: item.authority_ref ?? null,
    directive_id: item.directive_id ?? null,
    request_id: item.request_id ?? null,
    idempotency_key: item.idempotency_key ?? null,
    admission_state: item.admission_state ?? 'queued',
    content: item.content ?? '',
    metadata: isRecord(item.metadata) ? item.metadata : {},
  };
}
