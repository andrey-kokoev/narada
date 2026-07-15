import type { Ref } from 'vue';
import { useHealthStatus } from './useHealthStatus';
import { useNarsConnection, type NarsConnectionConfig } from './useNarsConnection';
import { useNarsEvents, type SessionIdentitySummary } from './useNarsEvents';
import type { ProjectionVerbosity } from './useProjectionVerbosity';
import { useRetainedEvents } from './useRetainedEvents';

export interface SessionStateConfig extends NarsConnectionConfig {
  healthEndpoint: string | null;
  maxRetainedEvents?: number;
}

/**
 * The browser-owned session boundary. Runtime events, transport state, health,
 * identity, active-turn state, bounded retention, and all view projections
 * enter and leave through this controller.
 */
export function useSessionState(
  verbosity: Ref<ProjectionVerbosity>,
  config: SessionStateConfig,
) {
  const retained = useRetainedEvents(config.maxRetainedEvents);
  const connection = useNarsConnection(
    {
      eventEndpoint: config.eventEndpoint,
      healthEndpoint: config.healthEndpoint,
      inputEndpoint: config.inputEndpoint,
      browserToken: config.browserToken,
      maxReplay: config.maxReplay,
      view: verbosity,
    },
    retained.retain,
    retained.retainMany,
  );
  const health = useHealthStatus({
    endpoint: config.healthEndpoint,
    browserToken: config.browserToken ?? null,
    transport: connection.connection.value ?? undefined,
  });
  const projection = useNarsEvents(retained.events, verbosity, health.identity, health.body);

  return {
    ...retained,
    ...projection,
    health,
    connection,
    hasEarlierEvents: connection.hasEarlierEvents,
    loadingEarlier: connection.loadingEarlier,
    loadEarlier: connection.loadEarlier,
    streamText: connection.streamText,
  };
}

export type SessionState = ReturnType<typeof useSessionState>;
export type { SessionIdentitySummary };
