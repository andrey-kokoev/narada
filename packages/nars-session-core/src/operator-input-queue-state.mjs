import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA = 'narada.nars.operator_input_queue_state.v1';

export function operatorInputQueueStatePathFromSessionPath(sessionPath) {
  if (!sessionPath) return null;
  return join(dirname(String(sessionPath)), 'operator-input-queue.json');
}

export function readOperatorInputQueueState(path) {
  if (!path || !existsSync(path)) return emptyOperatorInputQueueState({ path });
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed?.schema !== NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA || !Array.isArray(parsed.pending)) {
      return emptyOperatorInputQueueState({ path, corrupt: true });
    }
    return {
      ...parsed,
      path,
      pending: parsed.pending.filter((item) => item && typeof item === 'object'),
    };
  } catch {
    return emptyOperatorInputQueueState({ path, corrupt: true });
  }
}

export function writeOperatorInputQueueState(path, state = {}) {
  if (!path) return null;
  const next = {
    schema: NARS_OPERATOR_INPUT_QUEUE_STATE_SCHEMA,
    updated_at: new Date().toISOString(),
    revision: Number(state.revision ?? 0) + 1,
    pending_count: Array.isArray(state.pending) ? state.pending.length : 0,
    pending: Array.isArray(state.pending) ? state.pending.map(toPersistedInputItem) : [],
    last_transition: state.last_transition ?? null,
  };
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, path);
  return { ...next, path };
}

export function emptyOperatorInputQueueState({ path = null, corrupt = false } = {}) {
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

function toPersistedInputItem(item = {}) {
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
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
  };
}
