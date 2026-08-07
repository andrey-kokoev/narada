import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteAgentsAdapter, SiteAgentsApiError } from '../src/site-agents/adapter.ts';
import { createSiteAgentsTransport, SiteAgentsTransportError } from '../src/site-agents/transport.ts';

const overview = {
  schema: 'narada.operator_console.site_agent_overview.v1',
  status: 'success',
  generated_at: '2026-07-18T00:00:00.000Z',
  refusals: [],
  groups: [{
    id: 'sites',
    label: 'Sites',
    sites: [{
      site_id: 'sonar',
      display_name: 'Sonar',
      site_kind: 'site',
      group_id: 'sites',
      observation_status: 'present',
      agents: [{
        agent_id: 'sonar.resident',
        local_agent_id: 'resident',
        title: 'Resident',
        role: 'resident',
        admission_status: 'admitted',
        runtime: { state: 'stopped', session_count: 0, healthy_session_ids: [], selected_session_id: null },
        work: { state: 'available', detail: null, source: 'principal-runtime' },
        operator_surfaces: {
          default_kind: 'agent-web-ui',
          choices: [
            { kind: 'agent-web-ui', label: 'Web UI', status: 'available', reason: null },
            { kind: 'agent-cli', label: 'CLI', status: 'available', reason: null },
            { kind: 'agent-tui', label: 'TUI', status: 'available', reason: null },
          ],
        },
        actions: { start: true, inspect: false, inspect_reason: 'No healthy session is available.' },
      }],
    }],
  }],
};

test('site agents adapter accepts governed overview and launch contracts', async () => {
  const adapter = createSiteAgentsAdapter({
    overview: async () => overview,
    launch: async () => ({
      schema: 'narada.operator_console.agent_launch.v1',
      status: 'launched',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      session_id: 'session-1',
      reason: null,
    }),
  });
  assert.equal((await adapter.overview()).groups[0]?.sites[0]?.agents[0]?.agent_id, 'sonar.resident');
  assert.equal((await adapter.launch('sonar', 'sonar.resident')).session_id, 'session-1');
});

test('site agents transport carries the selected operator surface explicitly', async () => {
  let requestBody: unknown = null;
  const transport = createSiteAgentsTransport('/console/agents/api', async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      schema: 'narada.operator_console.agent_launch.v1',
      status: 'launched',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      session_id: 'session-2',
      reason: null,
      operator_surface: 'agent-tui',
      handoff: { kind: 'terminal', status: 'started', url: null, command: null, message: 'started' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await transport.launch('sonar', 'sonar.resident', 'agent-tui');
  assert.deepEqual(requestBody, { site_id: 'sonar', agent_id: 'sonar.resident', operator_surface: 'agent-tui' });
});

test('site agents admission transport and adapter preserve authoritative choices', async () => {
  const authority = {
    schema: 'narada.invokable-intelligence.selection-authority.v1',
    owner: '@narada-core/invokable-intelligence-runtime',
    resolution_phase: 'runtime-invocation',
    authority_scope: { kind: 'site', site_id: 'sonar' },
    catalog: { store_kind: 'node:sqlite', locator: 'C:/workspace/sonar/.ai/intelligence-registry.db' },
    launcher_selection: false,
    authoritative_inputs: ['invocation-intent', 'catalog'],
  };
  const options = {
    schema: 'narada.operator_console.site_agent_admission_options.v1',
    status: 'success',
    generated_at: '2026-07-24T00:00:00.000Z',
    site_id: 'sonar',
    site_display_name: 'Sonar',
    revision: 'revision-1',
    roles: [{ value: 'builder', label: 'builder' }],
    agent_kinds: [{ value: 'codex_cli', label: 'codex_cli' }],
    runtimes: [{ value: 'narada-agent-runtime-server', label: 'narada-agent-runtime-server' }],
    operator_surfaces: [{ value: 'agent-cli', label: 'agent-cli' }],
    intelligence: {
      selection_authority: authority,
      policy_choices: [{ value: 'catalog-and-materialized-policy', label: 'Site catalog + materialized policy' }],
      provider_choices: [{ value: 'codex', label: 'codex' }],
      model_choices: [{ value: 'gpt-test', label: 'gpt-test' }],
    },
    refusals: [],
  };
  const admitted = {
    schema: 'narada.operator_console.site_agent_admission.v1',
    status: 'admitted',
    site_id: 'sonar',
    agent_id: 'sonar.builder',
    local_agent_id: 'builder',
    role: 'builder',
    agent_kind: 'codex_cli',
    runtime: 'narada-agent-runtime-server',
    operator_surface: 'agent-cli',
    reason: null,
    message: 'Agent admitted.',
    request_id: 'admit-1',
    options_revision: 'revision-1',
    intelligence: { selection_authority: authority, policy: 'catalog-and-materialized-policy', provider: 'codex', model: 'gpt-test' },
  };
  const transport = createSiteAgentsTransport('/console/agents/api', async (input, init) => {
    if (String(input).includes('/admission/options')) return new Response(JSON.stringify(options), { status: 200 });
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      site_id: 'sonar',
      role: 'builder',
      agent_kind: 'codex_cli',
      runtime: 'narada-agent-runtime-server',
      operator_surface: 'agent-cli',
      intelligence_policy: 'catalog-and-materialized-policy',
      provider: 'codex',
      model: 'gpt-test',
      options_revision: 'revision-1',
    });
    return new Response(JSON.stringify(admitted), { status: 201 });
  });
  const client = createSiteAgentsAdapter({
    overview: async () => overview,
    launch: async () => null,
    pending: async () => [],
    admissionOptions: () => transport.admissionOptions('sonar'),
    admit: (request) => transport.admit(request),
  });
  assert.equal((await client.admissionOptions('sonar')).revision, 'revision-1');
  assert.equal((await client.admit({
    site_id: 'sonar',
    role: 'builder',
    agent_kind: 'codex_cli',
    runtime: 'narada-agent-runtime-server',
    operator_surface: 'agent-cli',
    intelligence_policy: 'catalog-and-materialized-policy',
    provider: 'codex',
    model: 'gpt-test',
    options_revision: 'revision-1',
  })).agent_id, 'sonar.builder');
});

test('site agents adapter refuses malformed authority projections', async () => {
  const adapter = createSiteAgentsAdapter({ overview: async () => ({ ...overview, groups: [{}] }), launch: async () => null });
  await assert.rejects(() => adapter.overview(), (error: unknown) => error instanceof SiteAgentsApiError && error.code === 'invalid_overview');
  await assert.rejects(() => adapter.launch('sonar', 'sonar.resident'), (error: unknown) => error instanceof SiteAgentsApiError && error.code === 'invalid_launch');
});

test('site agents adapter refuses malformed launch diagnostics', async () => {
  const adapter = createSiteAgentsAdapter({
    overview: async () => overview,
    launch: async () => ({
      schema: 'narada.operator_console.agent_launch.v1',
      status: 'failed',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      session_id: null,
      reason: 'workspace_launch_failed',
      failure: { phase: 'not-a-phase', code: 42, message: null, diagnostic_ref: {} },
    }),
  });
  await assert.rejects(() => adapter.launch('sonar', 'sonar.resident'), (error: unknown) => error instanceof SiteAgentsApiError && error.code === 'invalid_launch');
});

test('site agents adapter preserves Web UI attachment diagnostics', async () => {
  const adapter = createSiteAgentsAdapter({
    overview: async () => overview,
    launch: async () => ({
      schema: 'narada.operator_console.agent_launch.v1',
      status: 'failed',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      session_id: 'session-1',
      reason: 'agent_web_ui_attach_exception',
      request_id: 'request-web-ui-1',
      failure: {
        phase: 'web_ui_attach',
        code: 'agent_web_ui_attach_exception',
        message: 'fetch failed',
        diagnostic_ref: 'D:/runtime/web-ui-failure.json',
      },
    }),
  });
  const result = await adapter.launch('sonar', 'sonar.resident');
  assert.equal(result.request_id, 'request-web-ui-1');
  assert.equal(result.failure?.diagnostic_ref, 'D:/runtime/web-ui-failure.json');
});

test('site agents adapter preserves bounded session-authority decision diagnostics', async () => {
  const diagnosticSummary = {
    source: 'agent_start' as const,
    source_schema: 'narada.nars.session_authority_refusal.v1',
    reason_code: 'session_authority_already_active',
    required_next_step: 'Attach to the existing session or reconcile it explicitly.',
    source_result_ref: 'D:/runtime/agent-start-result.json',
    conflicting_session: {
      session_id: 'carrier-existing',
      state: 'active',
      authority_epoch: 3,
      pid: 39164,
      process_status: 'alive' as const,
      lease_status: 'fresh' as const,
      lease_expires_at: '2026-07-29T16:24:18.000Z',
      heartbeat_age_ms: 1_000,
      governing_rule: 'reclaim_when_lease_expired_and_no_live_process_is_observed',
      reclaim_eligible: false,
      reclaim_blockers: ['lease_fresh', 'process_alive'],
    },
  };
  const adapter = createSiteAgentsAdapter({
    overview: async () => overview,
    launch: async () => ({
      schema: 'narada.operator_console.agent_launch.v1',
      status: 'failed',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      session_id: null,
      reason: 'workspace_launch_exception',
      request_id: 'request-authority-1',
      failure: {
        phase: 'workspace_launch',
        code: 'workspace_launch_attachment_not_ready',
        message: 'An active session already owns this principal.',
        diagnostic_ref: 'D:/runtime/failure.json',
        diagnostic_summary: diagnosticSummary,
      },
    }),
  });
  const result = await adapter.launch('sonar', 'sonar.resident');
  assert.deepEqual(result.failure?.diagnostic_summary, diagnosticSummary);
});

test('site agents adapter refuses semantically invalid overview payloads', async () => {
  const violating = {
    ...overview,
    groups: [{
      id: 'sites',
      label: 'Sites',
      sites: [{
        ...overview.groups[0].sites[0],
        agents: [{
          ...overview.groups[0].sites[0].agents[0],
          runtime: { state: 'running', session_count: 0, healthy_session_ids: [], selected_session_id: null },
          actions: { start: true, inspect: false, inspect_reason: null },
        }],
      }],
    }],
  };
  const adapter = createSiteAgentsAdapter({ overview: async () => violating, launch: async () => null });
  await assert.rejects(
    () => adapter.overview(),
    (error: unknown) => error instanceof SiteAgentsApiError && error.code === 'invalid_overview',
  );
});

test('site agents transport preserves structured launch diagnostics from HTTP 500', async () => {
  const payload = {
    schema: 'narada.operator_console.agent_launch.v1',
    status: 'failed',
    site_id: 'sonar',
    agent_id: 'sonar.resident',
    session_id: null,
    reason: 'workspace_launch_exit',
    request_id: 'request-1',
    failure: {
      phase: 'workspace_launch',
      code: 'workspace_launch_exit',
      message: 'provider unavailable',
      diagnostic_ref: 'D:/runtime/failure.json',
    },
  };
  const transport = createSiteAgentsTransport('/console/agents/api', async () => new Response(JSON.stringify(payload), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  }));
  await assert.rejects(
    () => transport.launch('sonar', 'sonar.resident'),
    (error: unknown) => {
      assert.ok(error instanceof SiteAgentsTransportError);
      assert.equal(error.status, 500);
      assert.deepEqual(error.payload, payload);
      assert.equal(error.message, 'Agent launch failed: provider unavailable');
      return true;
    },
  );
});
