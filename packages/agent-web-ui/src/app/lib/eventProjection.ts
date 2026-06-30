import type { NarsClientProjectionVerbosity } from '@narada2/nars-client-projection-contract';
import { createSessionProjection } from '../../session-projection.js';

export interface ProjectedEventRow {
  key: string;
  kind: string;
  label: string;
  tone: string;
  summary: string;
  event: unknown;
  renderKey?: string | null;
  streamContent?: string;
  disposition?: string;
}

export function projectEventRows(events: unknown[], verbosity: NarsClientProjectionVerbosity): ProjectedEventRow[] {
  return createSessionProjection(events, { verbosity }).rows as ProjectedEventRow[];
}
