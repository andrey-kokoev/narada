import { describe, expect, it } from 'vitest';
import { resolveJourneyRoutes } from '../scripts/lib/operator-console-mirror-journey.js';

describe('operator console mirror journey route resolution', () => {
  it('records planned and inventory-only surfaces without fabricating identities', () => {
    const routes = resolveJourneyRoutes({
      surfaces: [
        {
          id: 'site-operations',
          availability: 'planned',
          projectedDetail: 'Select a Site before entering operations.',
          routes: [{ path: '/sites/<site-id>/operations/' }],
        },
        {
          id: 'agent-sessions',
          availability: 'available',
          routes: [{ path: '/console/sessions' }],
        },
        {
          id: 'artifacts',
          availability: 'planned',
          routes: [{ path: '/artifacts/<session-id>/<artifact-id>/' }],
        },
      ],
    });

    expect(routes.site_operations_path).toBeNull();
    expect(routes.session_path).toBeNull();
    expect(routes.session_events_path).toBeNull();
    expect(routes.session_input_path).toBeNull();
    expect(routes.artifact_base_path).toBeNull();
    expect(routes.availability.site_operations).toMatchObject({
      status: 'planned',
      reason: 'planned_surface',
    });
    expect(routes.availability.agent_sessions).toMatchObject({
      status: 'unavailable',
      reason: 'no_concrete_path',
    });
    expect(routes.availability.artifacts).toMatchObject({
      status: 'planned',
      reason: 'planned_surface',
    });
  });

  it('resolves only concrete paths and derives the session event route', () => {
    const routes = resolveJourneyRoutes({
      surfaces: [
        {
          id: 'site-operations',
          availability: 'available',
          routes: [{ path: '/sites/<site-id>/operations/' }],
          projectedRoutes: [{ path: '/sites/staccato/operations/', availability: 'available' }],
        },
        {
          id: 'agent-sessions',
          availability: 'available',
          routes: [{ path: '/console/sessions' }, { path: '/sessions/<session-id>/' }],
          projectedRoutes: [{ path: '/sessions/carrier-123/', availability: 'available' }],
        },
        {
          id: 'artifacts',
          availability: 'available',
          routes: [{ path: '/artifacts/<session-id>/<artifact-id>/' }],
          projectedRoutes: [{ path: '/artifacts/carrier-123/report-456/', availability: 'available' }],
        },
      ],
    });

    expect(routes).toMatchObject({
      site_operations_path: '/sites/staccato/operations/',
      session_path: '/sessions/carrier-123/',
      session_events_path: '/sessions/carrier-123/events',
      session_input_path: '/sessions/carrier-123/input',
      artifact_base_path: '/artifacts/carrier-123/report-456',
    });
    expect(routes.availability.site_operations.reason).toBe('concrete_path');
    expect(routes.availability.agent_sessions.reason).toBe('concrete_path');
    expect(routes.availability.artifacts.reason).toBe('concrete_path');
  });

  it('distinguishes a missing surface from a surface with no concrete route', () => {
    const routes = resolveJourneyRoutes({
      surfaces: [
        {
          id: 'agent-sessions',
          availability: 'available',
          routes: [{ path: '/sessions/<session-id>/' }],
          projectedRoutes: [{ path: '/sessions/stale-session/', availability: 'unavailable' }],
        },
      ],
    });

    expect(routes.availability.site_operations).toMatchObject({
      status: 'unavailable',
      reason: 'unavailable_surface',
    });
    expect(routes.availability.agent_sessions).toMatchObject({
      status: 'unavailable',
      reason: 'no_concrete_path',
    });
    expect(routes.availability.artifacts).toMatchObject({
      status: 'unavailable',
      reason: 'unavailable_surface',
    });
  });
});
