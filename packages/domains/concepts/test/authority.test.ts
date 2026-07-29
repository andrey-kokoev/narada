import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_GRANT_SCHEMA,
  PROJECTION_TOPOLOGY_SCHEMA,
  AuthorityContractError,
  authorityGrantSchema,
  projectionTopologySchema,
  queryProjectionTopology,
  transitionAuthorityGrant,
  validateAuthorityGrant,
  validateProjectionTopology,
  type AuthorityGrant,
  type ProjectionTopology,
} from '../src/authority.js';

const owner = { kind: 'site_authority', id: 'site:andrey-user' };

function makeGrant(overrides: Partial<AuthorityGrant> = {}): AuthorityGrant {
  return {
    schema: AUTHORITY_GRANT_SCHEMA,
    grant_id: 'grant:demo',
    owner,
    non_owner_boundary: 'Projections may observe this grant but cannot admit, enforce, or revoke it.',
    grantor: owner,
    grantee: { kind: 'capability_gateway', id: 'gateway:local' },
    capability: 'session.input',
    action: 'admit',
    scope: { kind: 'session', ref: 'session:demo', constraints: { method: 'session.submit' } },
    basis: { kind: 'operator_intent', ref: 'intent:demo', reason: 'Operator explicitly enabled the capability.' },
    state: 'declared',
    declaration: { declared_at: '2026-07-28T01:00:00.000Z', declared_by: owner, intent_ref: 'intent:demo' },
    evidence: [{ kind: 'canonical_event', ref: 'event:grant-declared', observed_at: '2026-07-28T01:00:00.000Z' }],
    audit: {
      created_at: '2026-07-28T01:00:00.000Z',
      created_by: owner,
      last_transition_at: '2026-07-28T01:00:00.000Z',
      last_transition_by: owner,
      transition_count: 0,
    },
    ...overrides,
  };
}

function makeTopology(): ProjectionTopology {
  return {
    schema: PROJECTION_TOPOLOGY_SCHEMA,
    graph_id: 'rpg:demo',
    generated_at: '2026-07-28T01:00:00.000Z',
    authority_runtimes: [{
      authority_runtime_id: 'auth:local-nars',
      kind: 'nars',
      location: { kind: 'local', site_root: 'D:/code/narada' },
      authority_role: 'canonical_session_runtime',
      owner: { kind: 'nars_session_authority', id: 'auth:local-nars' },
      non_owner_boundary: 'Projection stores and surfaces cannot mint session events or admit input.',
      session_id: 'session:demo',
      agent_id: 'resident',
      endpoint_refs: { events: 'ws://127.0.0.1/events', health: 'http://127.0.0.1/health' },
      health_ref: 'session.health',
      lifecycle_state: 'active',
    }],
    projection_edges: [{
      projection_edge_id: 'edge:local-to-cloud',
      origin_authority_runtime_id: 'auth:local-nars',
      target_projection_store_id: 'store:cloud',
      kind: 'local_to_cloudflare_projection',
      policy_refs: { events: 'selected_events' },
      credential_refs: { bridge: 'secret:bridge' },
      cursor: { last_replicated_sequence: 7 },
      lifecycle_state: 'active',
    }],
    projection_stores: [{
      projection_store_id: 'store:cloud',
      kind: 'cloudflare_projection_store',
      location: { kind: 'cloudflare', worker_url: 'https://projection.example.test' },
      authority_posture: 'non_canonical_projection',
      freshness_ref: 'projection.status',
    }],
    projection_surfaces: [{
      projection_surface_id: 'surface:web-ui',
      kind: 'agent-web-ui',
      location: { kind: 'cloudflare' },
      reads_from_projection_store_id: 'store:cloud',
    }],
    intent_routes: [{
      intent_route_id: 'route:web-to-local',
      origin_projection_surface_id: 'surface:web-ui',
      target_authority_runtime_id: 'auth:local-nars',
      admitted_methods: ['session.submit', 'session.cancel'],
      adapter_methods: ['conversation.send', 'conversation.interrupt'],
      credential_refs: { browser: 'token:fingerprint' },
      acknowledgement_authority: 'target_authority_runtime',
    }],
    provenance: { created_by: 'authority-runtime', created_at: '2026-07-28T01:00:00.000Z' },
  };
}

describe('AuthorityGrant', () => {
  it('validates the durable declaration/admission/enforcement record shape', () => {
    const result = validateAuthorityGrant(makeGrant());
    expect(result.valid).toBe(true);
    expect(result.data?.state).toBe('declared');
    expect(result.data?.owner).toEqual(owner);
  });

  it('enforces lifecycle ordering and records each phase separately', () => {
    const declared = makeGrant();
    const admitted = transitionAuthorityGrant(declared, 'admit', {
      at: '2026-07-28T01:01:00.000Z',
      actor: owner,
      decision_ref: 'decision:admit',
    });
    const enforced = transitionAuthorityGrant(admitted, 'enforce', {
      at: '2026-07-28T01:02:00.000Z',
      actor: owner,
      decision_ref: 'enforcement:admit-input',
      effect_ref: 'effect:input-admission',
    });

    expect(enforced.state).toBe('enforced');
    expect(enforced.admission?.decision_ref).toBe('decision:admit');
    expect(enforced.enforcement?.effect_ref).toBe('effect:input-admission');
    expect(enforced.audit.transition_count).toBe(2);
  });

  it('refuses projection-originated authority and invalid transitions', () => {
    const projectionGrant = validateAuthorityGrant(makeGrant({
      grantor: { kind: 'projection_surface', id: 'surface:web-ui' },
    }));
    expect(projectionGrant.valid).toBe(false);
    expect(projectionGrant.issues.some((issue) => issue.code === 'projection_cannot_grant_authority')).toBe(true);

    expect(() => transitionAuthorityGrant(makeGrant(), 'enforce', {
      at: '2026-07-28T01:02:00.000Z',
      actor: owner,
      effect_ref: 'effect:too-early',
    })).toThrowError(AuthorityContractError);
    try {
      transitionAuthorityGrant(makeGrant(), 'enforce', {
        at: '2026-07-28T01:02:00.000Z',
        actor: owner,
        effect_ref: 'effect:too-early',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorityContractError);
      expect((error as AuthorityContractError).code).toBe('invalid_authority_grant_transition');
    }
  });
});

describe('ProjectionTopology', () => {
  it('validates cross-zone references and queries the graph by authority', () => {
    const topology = makeTopology();
    expect(validateProjectionTopology(topology).valid).toBe(true);

    const result = queryProjectionTopology(topology, { authority_runtime_id: 'auth:local-nars' });
    expect(result.authority_runtimes).toHaveLength(1);
    expect(result.projection_edges).toHaveLength(1);
    expect(result.projection_stores).toHaveLength(1);
    expect(result.projection_surfaces).toHaveLength(1);
    expect(result.intent_routes).toHaveLength(1);
    expect(result.intent_routes[0].target_authority_runtime_id).toBe('auth:local-nars');
  });

  it('rejects canonical projection stores and unknown crossing endpoints', () => {
    const canonicalStore = validateProjectionTopology({
      ...makeTopology(),
      projection_stores: [{ ...makeTopology().projection_stores[0], authority_posture: 'canonical' }],
    });
    expect(canonicalStore.valid).toBe(false);
    expect(canonicalStore.issues.some((issue) => issue.code === 'projection_store_cannot_be_canonical')).toBe(true);

    const unknownRoute = projectionTopologySchema.safeParse({
      ...makeTopology(),
      intent_routes: [{ ...makeTopology().intent_routes[0], target_authority_runtime_id: 'auth:missing' }],
    });
    expect(unknownRoute.success).toBe(false);
    if (!unknownRoute.success) expect(unknownRoute.error.issues.some((issue) => issue.code === 'route_target_not_found')).toBe(true);
  });

  it('keeps canonical ownership stable across freshness and attachment-order changes', () => {
    const topology = makeTopology();
    const changedProjection = projectionTopologySchema.parse({
      ...topology,
      projection_stores: [{ ...topology.projection_stores[0], freshness_ref: 'projection.status?fresh=1' }],
      projection_surfaces: [...topology.projection_surfaces].reverse(),
    });
    expect(changedProjection.authority_runtimes[0].owner).toEqual(topology.authority_runtimes[0].owner);
    const expanded = projectionTopologySchema.parse({
      ...changedProjection,
      authority_runtimes: [...changedProjection.authority_runtimes, {
        ...changedProjection.authority_runtimes[0],
        authority_runtime_id: 'auth:other',
        owner: { kind: 'other_authority', id: 'auth:other' },
        session_id: 'session:other',
      }],
    });
    const storeQuery = queryProjectionTopology(expanded, { projection_store_id: 'store:cloud' });
    expect(storeQuery.authority_runtimes).toHaveLength(1);
    expect(storeQuery.authority_runtimes[0].owner).toEqual(topology.authority_runtimes[0].owner);
  });
});
