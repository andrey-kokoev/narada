import { computed, type Ref } from 'vue';
import { projectEventRows } from '../lib/eventProjection';
import type { ProjectionVerbosity } from './useProjectionVerbosity';

export function useNarsEvents(events: unknown[], verbosity: Ref<ProjectionVerbosity>) {
  const rows = computed(() => projectEventRows(events, verbosity.value));
  return { rows };
}
