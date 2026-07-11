import type { Ref } from 'vue';
import { useNarsEvents, type SessionIdentitySummary } from './useNarsEvents';
import type { HealthIdentitySummary } from './useHealthStatus';
import type { ProjectionVerbosity } from './useProjectionVerbosity';
import { useRetainedEvents } from './useRetainedEvents';

/**
 * The browser-owned session boundary. Runtime events enter through this state
 * and all view projections are derived from its retained event sequence.
 */
export function useSessionState(
  verbosity: Ref<ProjectionVerbosity>,
  healthIdentity?: Ref<HealthIdentitySummary>,
) {
  const retained = useRetainedEvents();
  const projection = useNarsEvents(retained.events, verbosity, healthIdentity);

  return {
    ...retained,
    ...projection,
  } satisfies ReturnType<typeof useRetainedEvents> & {
    sessionIdentity: ReturnType<typeof useNarsEvents>['sessionIdentity'];
    rows: ReturnType<typeof useNarsEvents>['rows'];
    summarizedStateSampleCount: ReturnType<typeof useNarsEvents>['summarizedStateSampleCount'];
    projection: ReturnType<typeof useNarsEvents>['projection'];
  };
}

export type SessionState = ReturnType<typeof useSessionState>;
export type { SessionIdentitySummary };
