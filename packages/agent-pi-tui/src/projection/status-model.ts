import type { AttachState, PiRowViewModel } from '../types.js';

export interface PiStatusModel {
  connection: AttachState['phase'];
  sessionStatus: string;
  health: string | null;
  model: string | null;
  provider: string | null;
  thinking: string | null;
  usage: string | null;
}

export function buildStatusModel(rows: readonly PiRowViewModel[], attach: AttachState): PiStatusModel {
  const healthRow = [...rows].reverse().find((row) => row.kind === 'session_health');
  const statusRow = [...rows].reverse().find((row) => row.kind === 'session_status' || row.kind === 'session_started');
  const event = healthRow?.event;
  const usage = event?.usage && typeof event.usage === 'object' ? event.usage as Record<string, unknown> : null;
  const model = typeof event?.model === 'string' ? event.model : null;
  const provider = typeof event?.provider === 'string' ? event.provider : null;
  const thinking = typeof event?.thinking === 'string' ? event.thinking : null;
  return {
    connection: attach.phase,
    sessionStatus: typeof statusRow?.status === 'string' ? statusRow.status : attach.phase,
    health: typeof event?.status === 'string' ? event.status : null,
    model,
    provider,
    thinking,
    usage: usage ? `input ${String(usage.input_tokens ?? '?')} · output ${String(usage.output_tokens ?? '?')}` : null,
  };
}

