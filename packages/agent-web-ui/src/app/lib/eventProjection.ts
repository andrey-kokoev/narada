import type { NarsClientProjectionVerbosity } from '@narada-core/nars-client-projection-contract';
import { createSessionProjection } from '../../session-projection.ts';

export interface ProjectedEventRow {
  key: string;
  kind: string;
  label: string;
  tone: string;
  summary: unknown;
  event: unknown;
  renderKey?: string | null;
  streamContent?: string;
  disposition?: string;
}

export interface ProjectedTurnGroupRow {
  key: string;
  kind: 'turn_group';
  label: 'Turn';
  tone: 'assistant';
  summary: unknown;
  event: unknown;
  disposition: 'conversation_group';
  turnId: string;
  requestId: string | null;
  children: ProjectedEventRow[];
  turnSummary: ProjectedEventRow | null;
}

export type ProjectedTranscriptRow = ProjectedEventRow | ProjectedTurnGroupRow;

export function isProjectedTurnGroupRow(row: ProjectedTranscriptRow): row is ProjectedTurnGroupRow {
  return row.kind === 'turn_group';
}

export function projectEventRows(events: unknown[], verbosity: NarsClientProjectionVerbosity): ProjectedTranscriptRow[] {
  return createSessionProjection(events, { verbosity }).transcriptRows as ProjectedTranscriptRow[];
}
