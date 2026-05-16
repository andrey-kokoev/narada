import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildHumanPeekSurfacePosture,
  buildSiteInboxLocationCheckConfig,
  buildAgentIdentityTelemetry,
  buildRegisteredSiteProbeReport,
  buildRegisteredSiteProbeRequest,
  buildSiteRegistryProjectionContract,
  buildSiteTelemetryConfig,
  decideSiteEventReceiver,
  decideSiteInboxLocationChecks,
  decideRegisteredSiteProbe,
  decideSiteTelemetry,
  deriveSiteProjectionReadModel,
  deriveSiteRegistryReadModel,
  deriveUserSiteAwarenessFromRegistryReadModel,
  mapSiteEventEnvelopeToTelemetryEvent,
  parseSiteTelemetryPublicationEdge,
  preflightSiteTelemetryPublicationEdge,
  parseSiteTelemetryEventFixture,
  siteTelemetryCompatibilityMap,
  siteProjectionEntryFromKnownSite,
  staccatoPublishedSurfacePatternMap,
  validateKnownSiteRegistryEntry,
  validateSiteTelemetryEventContract,
  type SiteEventEnvelope,
  type SiteEventReceiverContract,
  type KnownSiteRegistryEntry,
  type SiteRegistryReadModelInputEvent,
  type SiteRegistryReadModel,
} from '../src/index.js';

function knownSite(overrides: Partial<KnownSiteRegistryEntry> = {}): KnownSiteRegistryEntry {
  return {
    site_id: 'example-site',
    locus_type: 'project',
    roots: { site_root_windows: 'C:/example/.narada' },
    authority_boundaries: {
      user_site: ['know', 'navigate', 'review', 'route_proposals'],
      example_site: ['target_site_governance'],
      not_granted_by_awareness: ['mutate_target_site_config', 'access_project_secrets'],
    },
    capability_edges: [
      {
        from: 'local-site',
        to: 'example-site',
        capability: 'review',
        status: 'available',
        basis: 'local_registry_awareness',
      },
    ],
    capability_denials: [
      {
        from: 'local-site',
        to: 'example-site',
        capability: 'mutate_target_site_config',
        status: 'not_granted',
        basis: 'local_site_registry_non_grant',
      },
    ],
    sync_posture: 'unknown_until_inspected',
    capabilities: ['known_root'],
    inbox_endpoint: { status: 'not_observed' },
    task_lifecycle: { status: 'not_observed' },
    mcp_access: { status: 'missing_from_current_session' },
    inbox_location_check: buildSiteInboxLocationCheckConfig({
      check_remote_inbox_locations: false,
      inbox_locations: [],
    }),
    freshness: { reviewed_at: '2026-05-12' },
    health: { status: 'root_known_not_inspected' },
    blockers: [],
    evidence_refs: ['fixture'],
    ...overrides,
  };
}

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../docs/product/fixtures/site-telemetry-event-contract/${name}`, import.meta.url), 'utf8'));
}

function readPublicationEdgeFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../docs/product/fixtures/site-telemetry-publication-edge/${name}`, import.meta.url), 'utf8'));
}

function readSiteRegistryReadModelFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../docs/product/fixtures/site-registry-read-model/${name}`, import.meta.url), 'utf8'));
}

function readUserSiteAwarenessFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../docs/product/fixtures/user-site-awareness-from-registry/${name}`, import.meta.url), 'utf8'));
}

describe('site config registry awareness descriptors', () => {
  it('validates explicit capability edges and mutation denials without granting target authority', () => {
    const validation = validateKnownSiteRegistryEntry('example-site', knownSite());

    expect(validation.status).toBe('valid');
    expect(validation.config_mutated).toBe(false);
    expect(validation.target_authority_granted).toBe(false);
    expect(validation.warnings).toContain('registered_site_not_inspected');
  });

  it('rejects relationship-as-authority smearing and missing required state fields', () => {
    const validation = validateKnownSiteRegistryEntry('example-site', knownSite({
      site_id: 'other-site',
      task_lifecycle: { status: '' },
      authority_boundaries: {
        user_site: ['know'],
        not_granted_by_awareness: ['access_project_secrets'],
      },
      capability_edges: [
        {
          from: 'local-site',
          to: 'example-site',
          capability: 'mutate',
          status: 'available',
          basis: 'inherited_authority' as 'local_registry_awareness',
        },
      ],
    }));

    expect(validation.status).toBe('invalid');
    expect(validation.errors).toEqual(expect.arrayContaining([
      'registered_site_id_mismatch',
      'registered_site_missing_mutation_denial',
      'registered_site_missing_task_lifecycle_status',
      'registered_site_bad_capability_basis',
    ]));
  });

  it('plans read-only registered Site probes and refuses target mutation state import', () => {
    const planned = decideRegisteredSiteProbe(buildRegisteredSiteProbeRequest({
      site_id: 'example-site',
      authority_basis: { kind: 'local_registry_entry', summary: 'fixture registry entry' },
    }));
    const refused = decideRegisteredSiteProbe(buildRegisteredSiteProbeRequest({
      root: 'C:/external/.narada',
      target_mutation_requested: true,
      arbitrary_scan_requested: true,
      runtime_state_import_requested: true,
      credentials_requested: true,
    }));

    expect(planned.status).toBe('planned_descriptor');
    expect(planned.target_mutated).toBe(false);
    expect(refused.status).toBe('refused');
    expect(refused.refusals).toEqual([
      'site_probe_unregistered_root_requires_operator_authority_basis',
      'target_site_mutation_refused',
      'arbitrary_client_file_scan_refused',
      'runtime_state_import_refused',
      'credential_import_refused',
    ]);
  });

  it('builds read-only probe reports that do not scan arbitrary client files', () => {
    const report = buildRegisteredSiteProbeReport({
      site_id: 'example-site',
      root: 'C:/example/.narada',
      registration_status: 'registered_local_site_registry',
      current_state: knownSite(),
      readable_surfaces: ['config.json', 'AGENTS.md'],
      missing_surfaces: ['.ai/mcp'],
      blockers: ['mcp_missing'],
      recommended_next_actions: ['admit target-rooted MCP before mutation'],
      evidence_refs: ['fixture'],
    });

    expect(report.status).toBe('blocked');
    expect(report.read_only).toBe(true);
    expect(report.target_mutated).toBe(false);
    expect(report.arbitrary_client_files_scanned).toBe(false);
    expect(report.source_state_imported).toBe(false);
  });

  it('declares remote inbox locations separately from whether they are checked', () => {
    const config = buildSiteInboxLocationCheckConfig({
      check_remote_inbox_locations: false,
      inbox_locations: [
        {
          id: 'staccato-published-surface',
          kind: 'cloudflare_worker',
          enabled: true,
          target_site_id: 'staccato-client-service',
          endpoint: 'https://staccato.example/api/inbox/messages',
          health_endpoint: 'https://staccato.example/health',
          auth_capability_ref: 'capability:staccato.surface.local_admission',
          accepted_message_schemas: ['narada.site_inbox.remote_message.v0'],
          authority_limits: [
            'remote_surface_is_candidate_only',
            'local_site_admission_required',
            'no_task_or_capability_authority',
          ],
        },
      ],
    });

    const disabled = decideSiteInboxLocationChecks(config);
    const enabled = decideSiteInboxLocationChecks({
      ...config,
      check_remote_inbox_locations: true,
    });

    expect(disabled.status).toBe('disabled');
    expect(disabled.locations_to_check).toEqual([]);
    expect(disabled.warnings).toContain('enabled_inbox_locations_ignored_while_remote_checks_disabled');
    expect(disabled.target_mutated).toBe(false);
    expect(disabled.remote_inbox_authority_granted).toBe(false);
    expect(enabled.status).toBe('enabled');
    expect(enabled.locations_to_check.map((location) => location.id)).toEqual(['staccato-published-surface']);
  });

  it('validates remote inbox locations without granting remote inbox authority', () => {
    const decision = decideSiteInboxLocationChecks(buildSiteInboxLocationCheckConfig({
      check_remote_inbox_locations: true,
      inbox_locations: [
        {
          id: '',
          kind: 'cloudflare_worker',
          enabled: true,
          target_site_id: '',
          authority_limits: [],
        },
      ],
    }));

    expect(decision.status).toBe('invalid');
    expect(decision.errors).toEqual(expect.arrayContaining([
      'inbox_location_id_required',
      'inbox_location_target_site_required',
      'inbox_location_authority_limits_required',
      'remote_inbox_location_endpoint_required',
      'remote_inbox_location_capability_ref_required',
    ]));
    expect(decision.target_mutated).toBe(false);
    expect(decision.remote_inbox_authority_granted).toBe(false);
  });

  it('defaults telemetry on with local bounded destination and supports explicit opt-out', () => {
    const defaultConfig = buildSiteTelemetryConfig();
    const disabledConfig = buildSiteTelemetryConfig({ enable_telemetry: false });
    const enabled = decideSiteTelemetry(defaultConfig);
    const disabled = decideSiteTelemetry(disabledConfig);

    expect(defaultConfig.enable_telemetry).toBe(true);
    expect(enabled.status).toBe('enabled');
    expect(enabled.destinations_to_project.map((destination) => destination.id)).toEqual(['local-bounded-telemetry']);
    expect(enabled.config_mutated).toBe(false);
    expect(enabled.telemetry_is_authority).toBe(false);
    expect(disabled.status).toBe('disabled');
    expect(disabled.destinations_to_project).toEqual([]);
  });

  it('validates telemetry destinations and separates destination from transport', () => {
    const config = buildSiteTelemetryConfig({
      telemetry_destinations: [
        {
          id: 'staccato-worker-telemetry',
          kind: 'cloudflare_worker',
          enabled: false,
          scope: 'site_projection',
          accepted_event_families: ['site_health', 'agent_identity'],
          redaction_bounds: ['no_secrets', 'no_raw_transcripts', 'no_raw_provider_outputs'],
          output_bounds: { max_bytes: 4096, raw_values_excluded: true },
          retention_posture: 'latest_projection_with_optional_event_log',
          freshness_posture: 'source_freshness_tagged',
          transport: {
            kind: 'bearer_https_post',
            capability_ref: 'capability:telemetry.cloudflare_worker',
            url: 'https://worker.example/telemetry',
            health_url: 'https://worker.example/health',
          },
          storage_posture: 'remote_projection_non_authority',
          authority_limits: [
            'cannot_assign_work',
            'cannot_grant_capability',
            'cannot_certify_identity',
            'cannot_admit_task_or_inbox_state',
            'cannot_override_local_freshness',
          ],
        },
      ],
    });

    const decision = decideSiteTelemetry(config);

    expect(decision.status).toBe('enabled');
    expect(decision.destinations_to_project).toEqual([]);
    expect(config.telemetry_destinations[0].kind).toBe('cloudflare_worker');
    expect(config.telemetry_destinations[0].transport.kind).toBe('bearer_https_post');
    expect(config.telemetry_destinations[0].transport.capability_ref).toBe('capability:telemetry.cloudflare_worker');
    expect(decision.telemetry_is_authority).toBe(false);
  });

  it('rejects unsafe telemetry destinations and preserves agent telemetry non-authority', () => {
    const invalid = decideSiteTelemetry(buildSiteTelemetryConfig({
      telemetry_destinations: [
        {
          id: '',
          kind: 'webhook',
          enabled: true,
          scope: '',
          accepted_event_families: ['agent_identity'],
          redaction_bounds: ['no_secrets'],
          output_bounds: { max_bytes: 4096, raw_values_excluded: false as true },
          retention_posture: 'latest_projection',
          freshness_posture: 'freshness_tagged',
          transport: { kind: 'local_append' },
          storage_posture: 'remote_projection_non_authority',
          authority_limits: [],
        },
      ],
    }));
    const agentTelemetry = buildAgentIdentityTelemetry({
      agent_id: 'narada.builder',
      durable_identity_ref: 'agent:narada.builder',
      carrier_kind: 'codex',
      carrier_session_id: 'carrier_session_test',
      runtime_locus: 'narada-proper',
      heartbeat_freshness: 'fresh',
      current_governed_work_posture: 'claimed_task',
      last_governed_action_ref: 'task:1372',
      projected_capability_refs: ['capability:task_read_packet'],
      grant_refs: ['grant:fixture'],
      health_status: 'ok',
    });

    expect(invalid.status).toBe('invalid');
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'telemetry_destination_id_required',
      'telemetry_destination_scope_required',
      'telemetry_destination_authority_limits_required',
      'telemetry_destination_raw_values_must_be_excluded',
      'remote_telemetry_requires_bearer_https_post_transport',
      'remote_telemetry_requires_capability_ref',
      'remote_telemetry_requires_url',
    ]));
    expect(agentTelemetry.raw_secret_values_recorded).toBe(false);
    expect(agentTelemetry.raw_transcript_recorded).toBe(false);
    expect(agentTelemetry.assigns_work).toBe(false);
    expect(agentTelemetry.grants_capability).toBe(false);
    expect(agentTelemetry.certifies_identity).toBe(false);
    expect(agentTelemetry.admits_inbox_or_task_state).toBe(false);
  });

  it('builds a Site Registry projection contract without becoming Site authority', () => {
    const site = siteProjectionEntryFromKnownSite(knownSite(), {
      substrate: 'cloudflare',
      event_endpoint: {
        kind: 'cloudflare_worker',
        status: 'available',
        url: 'https://registry.example/webhook',
        capability_ref: 'capability:site_registry.event_publish',
        accepted_event_families: ['site_health', 'site_inbox', 'agent_session'],
      },
      inbox_message_endpoint: {
        kind: 'cloudflare_worker',
        status: 'available',
        url: 'https://registry.example/api/inbox/messages',
        capability_ref: 'capability:site_registry.message_submit',
      },
    });
    const projection = buildSiteRegistryProjectionContract({
      projection_id: 'user-site-registry',
      generated_at: '2026-05-16T02:00:00.000Z',
      sites: [site],
      source_evidence_refs: ['docs/product/operator-console-site-registry.md'],
    });

    expect(projection.schema).toBe('narada.site_config.site_registry_projection.v0');
    expect(projection.sites[0].site_id).toBe('example-site');
    expect(projection.sites[0].event_endpoint.kind).toBe('cloudflare_worker');
    expect(projection.sites[0].authority_limits).toEqual(expect.arrayContaining([
      'registry_projection_is_not_site_authority',
      'registry_projection_cannot_mutate_site_config',
      'registry_projection_cannot_admit_inbox_or_task_state',
      'registry_projection_cannot_grant_capability',
    ]));
    expect(projection.projection_is_authority).toBe(false);
    expect(projection.registry_mutates_sites).toBe(false);
  });

  it('accepts typed Site events only for known Sites, accepted families, bounded payloads, and authenticated capability posture', () => {
    const receiver: SiteEventReceiverContract = {
      schema: 'narada.site_event.receiver_contract.v0',
      receiver_id: 'site-registry-webhook',
      accepted_event_families: ['site_health', 'site_inbox'],
      known_site_ids: ['source-site', 'example-site'],
      max_payload_bytes: 4096,
      requires_authenticated_capability: true,
      authority_limits: ['receiver_projects_events_only', 'local_site_admission_required'],
    };
    const event: SiteEventEnvelope = {
      schema: 'narada.site_event.envelope.v0',
      event_id: 'evt_1',
      idempotency_key: 'source-site:evt_1',
      source_site_id: 'source-site',
      subject_site_id: 'example-site',
      family: 'site_health',
      type: 'narada.site.health.snapshot.v0',
      observed_at: '2026-05-16T01:59:00.000Z',
      sent_at: '2026-05-16T02:00:00.000Z',
      auth: {
        kind: 'bearer_capability_ref',
        capability_ref: 'capability:site_registry.event_publish',
        authenticated: true,
      },
      payload_bounds: { max_bytes: 1024, raw_values_excluded: true },
      payload_summary: { status: 'ok' },
      authority_limits: ['event_is_projection_input_only'],
    };
    const accepted = decideSiteEventReceiver(receiver, event);
    const refused = decideSiteEventReceiver(receiver, {
      ...event,
      event_id: '',
      source_site_id: 'unknown-site',
      family: 'report',
      auth: { kind: 'bearer_capability_ref', authenticated: false },
      payload_bounds: { max_bytes: 8192, raw_values_excluded: false as true },
      authority_limits: [],
    });

    expect(accepted.status).toBe('accepted');
    expect(accepted.projection_event_recorded).toBe(true);
    expect(accepted.mutates_site_authority).toBe(false);
    expect(accepted.admits_inbox_or_task_state).toBe(false);
    expect(accepted.grants_capability).toBe(false);
    expect(refused.status).toBe('refused');
    expect(refused.refusal_reasons).toEqual(expect.arrayContaining([
      'site_event_id_required',
      'site_event_source_unknown',
      'site_event_family_not_accepted',
      'site_event_authenticated_capability_required',
      'site_event_capability_ref_required',
      'site_event_payload_too_large',
      'site_event_raw_values_must_be_excluded',
      'site_event_authority_limits_required',
    ]));
  });

  it('validates telemetry event contract fixtures while preserving current SiteEventEnvelope compatibility', () => {
    const current = parseSiteTelemetryEventFixture(readFixture('site-health.current-envelope.json'));
    const future = parseSiteTelemetryEventFixture(readFixture('site-health.future-contract.json'));
    const map = siteTelemetryCompatibilityMap();

    expect(current.status).toBe('valid');
    expect(current.compatible_site_event_envelope).toBe(true);
    expect(current.raw_values_accepted).toBe(false);
    expect(current.event?.schema).toBe('narada.site_event.envelope.v0');
    expect(future.status).toBe('valid');
    expect(future.compatible_site_event_envelope).toBe(false);
    expect(future.event?.publication_edge_id).toBe('pubedge_narada-proper_to_narada-andrey_site-telemetry');
    expect(map.silent_widening_forbidden).toBe(true);
    expect(map.future_fields_not_inferred).toEqual(expect.arrayContaining([
      'publication_edge_id',
      'surface_id',
      'evidence_refs',
      'provenance',
    ]));
  });

  it('refuses invalid telemetry events and raw secret, log, or DB payload markers', () => {
    const invalid = validateSiteTelemetryEventContract({
      schema: 'narada.site_event.envelope.v0',
      event_id: '',
      idempotency_key: 'source-site:bad',
      source_site_id: 'source-site',
      family: 'site_health',
      type: 'narada.site.health.snapshot.v0',
      observed_at: '2026-05-16T01:59:00.000Z',
      sent_at: '2026-05-16T02:00:00.000Z',
      auth: { kind: 'bearer_capability_ref', authenticated: false },
      payload_bounds: { max_bytes: 1024, raw_values_excluded: true },
      payload_summary: {
        status: 'ok',
        raw_db_rows: [{ id: 1 }],
        secret_token: 'not-admissible',
        raw_log_excerpt: 'not-admissible',
      },
      authority_limits: [],
    });

    expect(invalid.status).toBe('invalid');
    expect(invalid.raw_values_accepted).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'site_telemetry_event_id_required',
      'site_telemetry_event_payload_summary_contains_raw_value_marker',
      'site_telemetry_event_authority_limits_required',
    ]));
  });

  it('maps current SiteEventEnvelope data to the future telemetry event shape only with explicit added coordinates', () => {
    const current = readFixture('site-health.current-envelope.json') as SiteEventEnvelope;
    const mapped = mapSiteEventEnvelopeToTelemetryEvent(current, {
      publication_edge_id: 'pubedge_fixture',
      surface_id: 'surface_fixture',
      freshness: { status: 'fresh', computed_by_receiver: false },
      evidence_refs: ['fixture:evidence'],
      provenance: { projection_only: true, publisher_runtime: 'test' },
    });
    const validation = validateSiteTelemetryEventContract(mapped);

    expect(mapped.schema).toBe('narada.site_telemetry.event.v0');
    expect(mapped.publication_edge_id).toBe('pubedge_fixture');
    expect(mapped.surface_id).toBe('surface_fixture');
    expect(validation.status).toBe('valid');
    expect(validation.compatible_site_event_envelope).toBe(false);
  });

  it('validates Publication Edge config and preflights without network publish or raw secret materialization', () => {
    const edge = readPublicationEdgeFixture('publication-edge.valid.json');
    const validation = parseSiteTelemetryPublicationEdge(edge);
    const preflight = preflightSiteTelemetryPublicationEdge(edge, {
      expected_surface_id: 'surface_user-site-telemetry_awareness',
      credential_ref_status: 'fresh',
      checked_at: '2026-05-16T19:55:00.000Z',
    });

    expect(validation.status).toBe('valid');
    expect(validation.raw_secret_values_accepted).toBe(false);
    expect(validation.edge?.capability_refs.publish).toBe('capability:site_telemetry.publish.narada-proper');
    expect(preflight.status).toBe('pass');
    expect(preflight.publish_allowed).toBe(true);
    expect(preflight.network_publish_performed).toBe(false);
    expect(preflight.raw_secret_values_recorded).toBe(false);
    expect(preflight.authority_granted).toBe(false);
  });

  it('reports Publication Edge missing capability, stale credential, and target surface mismatch', () => {
    const edge = {
      ...(readPublicationEdgeFixture('publication-edge.valid.json') as Record<string, unknown>),
      surface_id: 'surface_actual',
      capability_refs: {},
      rotation_posture: {
        credential_ref_status: 'stale',
      },
    };
    const validation = parseSiteTelemetryPublicationEdge(edge);
    const preflight = preflightSiteTelemetryPublicationEdge(edge, {
      expected_surface_id: 'surface_expected',
      credential_ref_status: 'stale',
      checked_at: '2026-05-16T19:55:00.000Z',
    });

    expect(validation.status).toBe('invalid');
    expect(validation.errors).toContain('publication_edge_publish_capability_missing');
    expect(preflight.status).toBe('fail');
    expect(preflight.publish_allowed).toBe(false);
    expect(preflight.checks).toEqual(expect.arrayContaining([
      { name: 'edge_valid', status: 'fail', failure: 'publication_edge_publish_capability_missing' },
      { name: 'surface_identity_matches', status: 'fail', failure: 'publication_edge_surface_mismatch' },
      { name: 'publish_capability_ref_present', status: 'fail', failure: 'publication_edge_publish_capability_missing' },
      { name: 'credential_ref_fresh', status: 'fail', failure: 'publication_edge_credential_ref_stale' },
    ]));
  });

  it('derives read-model projection state with freshness and provenance instead of authority', () => {
    const events: SiteEventEnvelope[] = [
      {
        schema: 'narada.site_event.envelope.v0',
        event_id: 'evt_health',
        idempotency_key: 'source-site:health',
        source_site_id: 'source-site',
        subject_site_id: 'example-site',
        family: 'site_health',
        type: 'narada.site.health.snapshot.v0',
        observed_at: '2026-05-16T01:59:00.000Z',
        sent_at: '2026-05-16T02:00:00.000Z',
        auth: { kind: 'bearer_capability_ref', capability_ref: 'capability:site_registry.event_publish', authenticated: true },
        payload_bounds: { max_bytes: 1024, raw_values_excluded: true },
        payload_summary: { status: 'ok' },
        authority_limits: ['event_is_projection_input_only'],
      },
      {
        schema: 'narada.site_event.envelope.v0',
        event_id: 'evt_task',
        idempotency_key: 'source-site:task',
        source_site_id: 'source-site',
        target_site_id: 'example-site',
        family: 'task_work',
        type: 'narada.site.task_work.summary.v0',
        observed_at: '2026-05-16T01:30:00.000Z',
        sent_at: '2026-05-16T01:31:00.000Z',
        auth: { kind: 'bearer_capability_ref', capability_ref: 'capability:site_registry.event_publish', authenticated: true },
        payload_bounds: { max_bytes: 1024, raw_values_excluded: true },
        payload_summary: { status: 'pending_review' },
        authority_limits: ['event_is_projection_input_only'],
      },
    ];

    const model = deriveSiteProjectionReadModel({
      site_id: 'example-site',
      events,
      now: '2026-05-16T02:00:00.000Z',
      stale_after_ms: 15 * 60 * 1000,
    });

    expect(model.latest_health).toMatchObject({ status: 'ok', freshness: 'fresh', event_id: 'evt_health' });
    expect(model.task_work_posture).toMatchObject({ status: 'pending_review', freshness: 'stale', event_id: 'evt_task' });
    expect(model.inbox_availability.freshness).toBe('missing');
    expect(model.event_provenance.map((event) => event.event_id)).toEqual(['evt_health', 'evt_task']);
    expect(model.projection_is_authority).toBe(false);
  });

  it('replays local telemetry surface fixture events into the same projection shape without network transport', () => {
    const event = readFixture('../site-telemetry-surface-realization/events/site-health.narada-proper.json') as SiteEventEnvelope;
    const expected = readFixture('../site-telemetry-surface-realization/projections/narada-proper.expected.json');
    const validation = parseSiteTelemetryEventFixture(event);
    const projection = deriveSiteProjectionReadModel({
      site_id: 'narada-proper',
      events: [event],
      now: '2026-05-16T20:06:00.000Z',
      stale_after_ms: 15 * 60 * 1000,
    });

    expect(validation.status).toBe('valid');
    expect(projection).toEqual(expected);
    expect(projection.projection_is_authority).toBe(false);
    expect(JSON.stringify(projection)).not.toContain('NARADA_SITE_REGISTRY');
  });

  it('derives SiteRegistry read models from telemetry events without becoming source Site authority', () => {
    const input = readSiteRegistryReadModelFixture('site-registry-input-events.json') as { events: SiteRegistryReadModelInputEvent[] };
    const expected = readSiteRegistryReadModelFixture('site-registry.expected.json');
    const projection = deriveSiteRegistryReadModel({
      registry_id: 'site-registry:narada-andrey:awareness',
      owning_site_id: 'narada-andrey',
      generated_at: '2026-05-16T20:07:00.000Z',
      events: input.events,
      stale_after_ms: 15 * 60 * 1000,
    });

    expect(projection).toEqual(expected);
    expect(projection.authority_limits).toContain('site_registry_read_model_is_projection_only');
    expect(projection.sites[0].capability_denials).toContain('mutation_not_granted_by_registry_projection');
  });

  it('keeps stale and conflicting SiteRegistry signals visible as projection data', () => {
    const events: SiteRegistryReadModelInputEvent[] = [
      {
        event_id: 'evt_old_project',
        family: 'site_health',
        source_site_id: 'source-site',
        subject_site_id: 'example-site',
        observed_at: '2026-05-16T19:00:00.000Z',
        payload_summary: {
          status: 'healthy',
          locus_type: 'project',
          relation: 'repo_site',
          telemetry_surfaces: ['surface_local_fixture_site-telemetry'],
        },
      },
      {
        event_id: 'evt_new_user',
        family: 'site_health',
        source_site_id: 'source-site',
        subject_site_id: 'example-site',
        observed_at: '2026-05-16T19:10:00.000Z',
        payload_summary: {
          status: 'healthy',
          locus_type: 'user_site',
          relation: 'candidate',
          telemetry_surfaces: ['surface_user-site-telemetry_awareness'],
        },
      },
    ];
    const projection = deriveSiteRegistryReadModel({
      registry_id: 'site-registry:test',
      owning_site_id: 'owner-site',
      generated_at: '2026-05-16T20:00:00.000Z',
      events,
      stale_after_ms: 15 * 60 * 1000,
    });

    expect(projection.sites[0].freshness).toEqual({ status: 'stale', latest_event_id: 'evt_new_user' });
    expect(projection.sites[0].conflicts).toEqual(expect.arrayContaining([
      { field: 'locus_type', values: ['project', 'user_site'], event_ids: ['evt_new_user', 'evt_old_project'] },
      { field: 'relation', values: ['candidate', 'repo_site'], event_ids: ['evt_new_user', 'evt_old_project'] },
    ]));
    expect(projection.sites[0].read_model_authority_limits).toContain('read_model_cannot_grant_capability');
  });

  it('projects remote SiteRegistry output into User Site awareness without ownership collapse', () => {
    const registry = readUserSiteAwarenessFixture('site-awareness-input-registry.json') as SiteRegistryReadModel;
    const expected = readUserSiteAwarenessFixture('site-awareness.expected.json');
    const awareness = deriveUserSiteAwarenessFromRegistryReadModel({
      user_site_id: 'narada-andrey',
      registry,
    });

    expect(awareness).toEqual(expected);
    expect(awareness.advisory_only).toBe(true);
    expect(awareness.mutates_known_sites).toBe(false);
    expect(awareness.imports_remote_ownership).toBe(false);
    expect(awareness.entries.map((entry) => entry.site_id)).toEqual([
      'narada-proper',
      'staccato-client-service',
    ]);
    expect(awareness.entries[1].awareness_posture).toBe('conflicted');
    expect(awareness.entries[1].denied_authority).toContain('remote_registry_does_not_transfer_ownership');
  });

  it('declares human peek UI/API and Staccato pattern mapping as reusable non-authority projection posture', () => {
    const peek = buildHumanPeekSurfacePosture({
      surface_id: 'cloudflare-registry-peek',
      routes: ['GET /', 'GET /api/sites', 'GET /api/projections/example-site'],
    });
    const pattern = staccatoPublishedSurfacePatternMap();

    expect(peek.reads_projection_state).toBe(true);
    expect(peek.mutates_site).toBe(false);
    expect(peek.admits_inbox).toBe(false);
    expect(peek.mutates_task_lifecycle).toBe(false);
    expect(peek.certifies_identity).toBe(false);
    expect(peek.grants_capability).toBe(false);
    expect(pattern.reusable_parts).toEqual(expect.arrayContaining([
      'bearer_capability_guarded_post_webhook',
      'typed_event_validation_before_projection',
      'latest_projection_read_api',
      'bounded_human_peek_surface',
      'local_admission_pullback_before_inbox_authority',
    ]));
    expect(pattern.site_specific_parts).toContain('staccato_event_type_names');
    expect(pattern.projection_is_authority).toBe(false);
  });
});
