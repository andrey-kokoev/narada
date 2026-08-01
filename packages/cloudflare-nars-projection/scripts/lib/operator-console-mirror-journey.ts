type AnyRecord = Record<string, any>;

export type JourneyRouteAvailability = {
  surface_availability: string | null;
  projected_detail: string | null;
  path: string | null;
  status: 'available' | 'planned' | 'unavailable';
  reason: 'concrete_path' | 'planned_surface' | 'no_concrete_path' | 'unavailable_surface';
};

export type JourneyRoutes = {
  site_operations_path: string | null;
  session_path: string | null;
  session_events_path: string | null;
  session_input_path: string | null;
  artifact_base_path: string | null;
  availability: {
    site_operations: JourneyRouteAvailability;
    agent_sessions: JourneyRouteAvailability;
    artifacts: JourneyRouteAvailability;
  };
};

export function resolveJourneyRoutes(directory: AnyRecord): JourneyRoutes {
  const surface = (surfaceId: string): AnyRecord | null => {
    const candidate = (Array.isArray(directory.surfaces) ? directory.surfaces : [])
      .find((entry: AnyRecord) => entry?.id === surfaceId);
    return candidate && typeof candidate === 'object' ? candidate : null;
  };
  const surfaceRoutes = (surfaceId: string): AnyRecord[] => {
    const descriptor = surface(surfaceId);
    const routes = Array.isArray(descriptor?.projectedRoutes) ? descriptor.projectedRoutes : descriptor?.routes;
    return Array.isArray(routes) ? routes : routes && typeof routes === 'object' ? [routes] : [];
  };
  const concretePath = (surfaceId: string, predicate: (path: string) => boolean): JourneyRouteAvailability => {
    const descriptor = surface(surfaceId);
    const surfaceAvailability = typeof descriptor?.availability === 'string'
      ? descriptor.availability
      : typeof descriptor?.defaultAvailability === 'string'
        ? descriptor.defaultAvailability
        : null;
    const path = surfaceRoutes(surfaceId)
      .map((route) => ({
        path: typeof route.path === 'string' ? route.path : '',
        availability: typeof route.availability === 'string' ? route.availability : null,
      }))
      .find((candidate) => candidate.path.startsWith('/')
        && !candidate.path.includes('<')
        && candidate.availability !== 'planned'
        && candidate.availability !== 'unavailable'
        && predicate(candidate.path))?.path ?? null;
    const status = path
      ? 'available'
      : surfaceAvailability === 'planned'
        ? 'planned'
        : 'unavailable';
    return {
      surface_availability: surfaceAvailability,
      projected_detail: typeof descriptor?.projectedDetail === 'string' ? descriptor.projectedDetail : null,
      path,
      status,
      reason: path
        ? 'concrete_path'
        : surfaceAvailability === 'planned'
          ? 'planned_surface'
          : surfaceAvailability === 'available'
            ? 'no_concrete_path'
            : 'unavailable_surface',
    };
  };

  const siteOperations = concretePath('site-operations', (path) => path.startsWith('/sites/') && /\/operations\/?$/.test(path));
  const agentSessions = concretePath('agent-sessions', (path) => path.startsWith('/sessions/'));
  const artifacts = concretePath('artifacts', (path) => path.startsWith('/artifacts/'));
  const sessionId = agentSessions.path?.split('/').filter(Boolean)[1] ?? '';
  const sessionPath = sessionId ? agentSessions.path : null;
  const sessionEventsPath = sessionId ? `/sessions/${encodeURIComponent(sessionId)}/events` : null;
  const sessionInputPath = sessionId ? `/sessions/${encodeURIComponent(sessionId)}/input` : null;
  if (!sessionPath && agentSessions.path) {
    agentSessions.path = null;
    agentSessions.status = 'unavailable';
    agentSessions.reason = 'no_concrete_path';
  }
  return {
    site_operations_path: siteOperations.path,
    session_path: sessionPath,
    session_events_path: sessionEventsPath,
    session_input_path: sessionInputPath,
    artifact_base_path: artifacts.path?.replace(/\/$/, '') ?? null,
    availability: {
      site_operations: siteOperations,
      agent_sessions: agentSessions,
      artifacts,
    },
  };
}
