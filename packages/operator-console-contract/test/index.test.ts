import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstAvailableConcreteProjectedOperatorSurfaceRoute,
  findOperatorSurfaceRoute,
  operatorSurfaceDescriptors,
  operatorSurfaceRoutePath,
  primaryProjectedOperatorSurfaceRoute,
  primaryOperatorSurfaceRoute,
  projectOperatorSurfaceCatalog,
  projectOperatorSurfaceRouteBinding,
  projectOperatorSurfaceNavigation,
  projectOperatorWorkspaceRouteDirectory,
  isOperatorWorkspaceRoutePath,
  parseOperatorSiteAgentOverviewWireResponse,
  validateOperatorSiteAgentOverviewInvariants,
  formatOperatorSiteAgentInvariantViolation,
} from '../src/index.ts';

test('operator surface catalog describes canonical registry and launcher routes', () => {
  assert.equal(operatorSurfaceDescriptors.length, 7);
  assert.equal(findOperatorSurfaceRoute('/console/agents')?.surface.id, 'site-agents');
  assert.equal(findOperatorSurfaceRoute('/console/registry/')?.surface.id, 'site-registry');
  assert.equal(findOperatorSurfaceRoute('/console/registry/add')?.route.kind, 'workflow');
  assert.equal(findOperatorSurfaceRoute('/console/launch')?.surface.id, 'launcher');
  assert.equal(findOperatorSurfaceRoute('/console/onboarding')?.surface.id, 'onboarding');
  assert.equal(primaryOperatorSurfaceRoute(operatorSurfaceDescriptors[0])?.path, '/console/agents');
  assert.equal(operatorSurfaceRoutePath('agent-sessions', 'sessions'), '/console/sessions');
  assert.equal(operatorSurfaceDescriptors.find((surface) => surface.id === 'launcher')?.authority.kind, 'operator-console');
  assert.equal(operatorSurfaceDescriptors.find((surface) => surface.id === 'launcher')?.projection.kind, 'launcher');
});

test('workspace route directory maps concrete session routes to session authority', () => {
  const directory = projectOperatorWorkspaceRouteDirectory({
    workspaceHost: { kind: 'cloudflare', id: 'worker', origin: 'https://workspace.example.test' },
    availability: { 'agent-sessions': 'available' },
    additionalRoutes: {
      'agent-sessions': [{
        id: 'router-session-demo',
        path: '/sessions/session-demo',
        kind: 'page',
        label: 'Session session-demo',
        target: { kind: 'session', id: 'session-demo' },
      }],
    },
  });
  const route = directory.surfaces.find((surface) => surface.id === 'agent-sessions')?.projectedRoutes.find((candidate) => candidate.id === 'router-session-demo');
  assert.deepEqual(route?.authority, { kind: 'nars-session', id: 'session-demo' });
  assert.deepEqual(route?.authorityHost, { kind: 'local', id: 'operator-console', origin: null });
  assert.deepEqual(directory.workspaceHost, { kind: 'cloudflare', id: 'worker', origin: 'https://workspace.example.test' });
});

test('live route binding derives scoped authority without changing surface ownership', () => {
  const siteOperations = operatorSurfaceDescriptors.find((surface) => surface.id === 'site-operations')!;
  const route = siteOperations.routes[0];
  const binding = projectOperatorSurfaceRouteBinding(siteOperations, {
    ...route,
    target: { kind: 'site', id: 'site-demo' },
  });
  assert.deepEqual(binding.authority, { kind: 'site', id: 'site-demo' });
  assert.deepEqual(binding.authorityHost, { kind: 'local', id: 'operator-console', origin: null });
  assert.equal(binding.projection.owner, '@narada2/cli');
  assert.equal(binding.intent.kind, 'site-control');
  assert.equal(binding.diagnosticOnly, false);
});

test('navigation projection follows descriptor availability and labels', () => {
  assert.deepEqual(projectOperatorSurfaceNavigation().map((item) => item.label), [
    'Agents',
    'Sites',
    'Add Site',
    'Manage',
    'Site Runtime',
    'First Use',
    'Sessions',
  ]);
  assert.deepEqual(projectOperatorSurfaceNavigation({ availability: { launcher: 'unavailable' } }).map((item) => item.key), [
    'agents',
    'sites',
    'add',
    'manage',
    'onboarding',
    'sessions',
  ]);
});

test('launcher descriptor projection is owned by the console UI, not the grouping-era package', () => {
  const launcher = operatorSurfaceDescriptors.find((surface) => surface.id === 'launcher')!;
  assert.equal(launcher.name, 'Site Runtime');
  assert.equal(launcher.projection.owner, '@narada2/operator-console-ui');
});

test('navigation projection excludes routes that are unavailable within an available surface', () => {
  assert.deepEqual(projectOperatorSurfaceNavigation({
    routeAvailability: { 'site-registry': { add: 'unavailable', manage: 'unavailable' } },
  }).map((item) => item.key), ['agents', 'sites', 'launcher', 'onboarding', 'sessions']);
});

test('availability projection preserves planned and unavailable states', () => {
  const catalog = projectOperatorSurfaceCatalog({
    availability: {
      'site-registry': 'unavailable',
      launcher: 'available',
      'agent-sessions': 'planned',
    },
  });
  assert.equal(catalog.find((surface) => surface.id === 'site-registry')?.availability, 'unavailable');
  assert.equal(catalog.find((surface) => surface.id === 'site-registry')?.projectedDetail, 'The Site Registry projection is not available from this host.');
  assert.equal(catalog.find((surface) => surface.id === 'agent-sessions')?.availability, 'planned');
});

test('workspace route directory preserves concrete and template route availability', () => {
  const directory = projectOperatorWorkspaceRouteDirectory({
    availability: { artifacts: 'available' },
    routeAvailability: {
      'site-registry': { sites: 'available', add: 'unavailable', manage: 'planned' },
      artifacts: { artifact: 'available' },
    },
  });
  assert.equal(directory.schema, 'narada.operator_workspace.route_directory.v3');
  assert.deepEqual(directory.workspaceHost, { kind: 'local', id: 'operator-console', origin: null });
  const registry = directory.surfaces.find((surface) => surface.id === 'site-registry');
  assert.equal(registry?.projectedRoutes.find((route) => route.id === 'sites')?.availability, 'available');
  assert.equal(registry?.projectedRoutes.find((route) => route.id === 'add')?.availability, 'unavailable');
  const artifacts = directory.surfaces.find((surface) => surface.id === 'artifacts');
  assert.equal(primaryProjectedOperatorSurfaceRoute(artifacts!)?.path, '/artifacts/<session-id>/<artifact-id>/');
  assert.equal(artifacts?.projectedRoutes[0]?.availability, 'available');
  assert.equal(artifacts?.projectedRoutes[0]?.authority.kind, 'artifact');
  assert.deepEqual(projectOperatorSurfaceNavigation({
    availability: { artifacts: 'available' },
    routeAvailability: { artifacts: { artifact: 'available' } },
  }).map((item) => item.key), ['agents', 'sites', 'add', 'manage', 'launcher', 'onboarding', 'sessions']);
});

test('workspace route directory admits live concrete routes without replacing templates', () => {
  const directory = projectOperatorWorkspaceRouteDirectory({
    availability: { 'site-operations': 'available', artifacts: 'available' },
    routeAvailability: {
      'site-operations': { operations: 'unavailable', 'router-site-operations-demo': 'available' },
      artifacts: { artifact: 'unavailable', 'router-artifact-demo': 'available' },
    },
    additionalRoutes: {
      'site-operations': [{
        id: 'router-site-operations-demo',
        path: '/sites/demo/operations',
        kind: 'page',
        label: 'Site demo Operations',
        target: { kind: 'site', id: 'demo' },
      }],
      artifacts: [{
        id: 'router-artifact-demo',
        path: '/artifacts/session-demo',
        kind: 'page',
        label: 'Session session-demo Artifacts',
        target: { kind: 'artifact', id: 'session-demo' },
      }],
    },
  });
  const siteOperations = directory.surfaces.find((surface) => surface.id === 'site-operations');
  const artifacts = directory.surfaces.find((surface) => surface.id === 'artifacts');
  assert.equal(siteOperations?.routes.find((route) => route.id === 'router-site-operations-demo')?.path, '/sites/demo/operations');
  assert.equal(artifacts?.routes.find((route) => route.id === 'router-artifact-demo')?.path, '/artifacts/session-demo');
  assert.equal(firstAvailableConcreteProjectedOperatorSurfaceRoute(siteOperations!)?.path, '/sites/demo/operations');
  assert.equal(firstAvailableConcreteProjectedOperatorSurfaceRoute(artifacts!)?.path, '/artifacts/session-demo');
  assert.equal(siteOperations?.projectedRoutes.find((route) => route.id === 'operations')?.availability, 'unavailable');
  assert.equal(artifacts?.projectedRoutes.find((route) => route.id === 'artifact')?.availability, 'unavailable');
});

test('site-agent overview parser preserves orthogonal runtime and work state', () => {
  const parsed = parseOperatorSiteAgentOverviewWireResponse({
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
          runtime: { state: 'running', session_count: 1, healthy_session_ids: ['session-1'], selected_session_id: 'session-1' },
          work: { state: 'executing', detail: 'task-1', source: 'principal-runtime' },
          operator_surfaces: {
            default_kind: 'agent-web-ui',
            choices: [
              { kind: 'agent-web-ui', label: 'Web UI', status: 'available', reason: null },
              { kind: 'agent-cli', label: 'CLI', status: 'available', reason: null },
              { kind: 'agent-tui', label: 'TUI', status: 'available', reason: null },
            ],
          },
          actions: { start: false, inspect: true, inspect_reason: null },
        }],
      }],
    }],
  });
  assert.equal(parsed?.groups[0]?.sites[0]?.agents[0]?.work.state, 'executing');
  assert.equal(parsed?.groups[0]?.sites[0]?.agents[0]?.runtime.state, 'running');
  assert.equal(parseOperatorSiteAgentOverviewWireResponse({
    ...parsed,
    groups: [{ id: 'sites', label: 'Sites', sites: [{ agents: [] }] }],
  }), null);
});

test('workspace route directory rejects duplicate navigation keys across surfaces', () => {
  assert.throws(
    () => projectOperatorWorkspaceRouteDirectory({
      additionalRoutes: {
        launcher: [{
          id: 'duplicate-navigation-key',
          path: '/console/launch/duplicate',
          kind: 'page',
          label: 'Duplicate navigation key',
          navigationKey: 'sites',
        }],
      },
    }),
    /operator_workspace_navigation_key_duplicate:sites/,
  );
});

test('workspace route paths are restricted to same-origin relative paths', () => {
  assert.equal(isOperatorWorkspaceRoutePath('/console/registry'), true);
  assert.equal(isOperatorWorkspaceRoutePath('/sites/demo/operations'), true);
  assert.equal(isOperatorWorkspaceRoutePath('https://outside.example/'), false);
  assert.equal(isOperatorWorkspaceRoutePath('//outside.example/'), false);
  assert.equal(isOperatorWorkspaceRoutePath('\\\\outside\\route'), false);
  assert.throws(
    () => projectOperatorSurfaceWorkspaceRouteDirectoryWithInvalidPath(),
    /operator_surface_route_path_invalid:launcher:invalid/,
  );
});

function projectOperatorSurfaceWorkspaceRouteDirectoryWithInvalidPath() {
  return projectOperatorWorkspaceRouteDirectory({
    additionalRoutes: {
      launcher: [{
        id: 'invalid',
        path: 'https://outside.example/',
        kind: 'page',
        label: 'Outside',
      }],
    },
  });
}

function validSiteAgentOverview() {
  return {
    schema: 'narada.operator_console.site_agent_overview.v1' as const,
    status: 'success' as const,
    generated_at: '2026-07-19T00:00:00.000Z',
    refusals: [],
    groups: [{
      id: 'sites' as const,
      label: 'Sites',
      sites: [{
        site_id: 'sonar',
        display_name: 'Sonar',
        site_kind: 'site' as const,
        group_id: 'sites' as const,
        observation_status: 'present',
        agents: [{
          agent_id: 'sonar.resident',
          local_agent_id: 'resident',
          title: 'Resident',
          role: 'resident',
          admission_status: 'admitted' as const,
          runtime: { state: 'running' as const, session_count: 1, healthy_session_ids: ['session-1'], selected_session_id: 'session-1' },
          work: { state: 'executing', detail: 'task-1', source: 'principal-runtime' as const },
          operator_surfaces: {
            default_kind: 'agent-web-ui',
            choices: [
              { kind: 'agent-web-ui' as const, label: 'Web UI', status: 'available' as const, reason: null },
              { kind: 'agent-cli' as const, label: 'CLI', status: 'available' as const, reason: null },
              { kind: 'agent-tui' as const, label: 'TUI', status: 'available' as const, reason: null },
            ],
          },
          actions: { start: false, inspect: true, inspect_reason: null },
        }],
      }],
    }],
  };
}

test('site agent invariants accept a semantically valid overview', () => {
  assert.deepEqual(validateOperatorSiteAgentOverviewInvariants(validSiteAgentOverview()), []);
});

test('site agent invariants catch running agents without a healthy selected session', () => {
  const overview = validSiteAgentOverview();
  overview.groups[0]!.sites[0]!.agents[0]!.runtime = { state: 'running', session_count: 0, healthy_session_ids: [], selected_session_id: null };
  overview.groups[0]!.sites[0]!.agents[0]!.actions = { start: true, inspect: false, inspect_reason: null };
  const violations = validateOperatorSiteAgentOverviewInvariants(overview);
  assert.ok(violations.some((violation) => violation.invariant === 'runtime_running_shape'));
  assert.ok(violations.some((violation) => violation.invariant === 'action_state_mismatch'));
});

test('site agent invariants catch stopped agents carrying sessions', () => {
  const overview = validSiteAgentOverview();
  overview.groups[0]!.sites[0]!.agents[0]!.runtime = { state: 'stopped', session_count: 1, healthy_session_ids: [], selected_session_id: 'session-1' };
  overview.groups[0]!.sites[0]!.agents[0]!.actions = { start: false, inspect: true, inspect_reason: null };
  const violations = validateOperatorSiteAgentOverviewInvariants(overview);
  assert.ok(violations.some((violation) => violation.invariant === 'runtime_stopped_shape'));
  assert.ok(violations.some((violation) => violation.invariant === 'selected_not_healthy'));
  assert.ok(violations.some((violation) => violation.invariant === 'action_state_mismatch'));
});

test('site agent invariants catch ambiguous agents with fewer than two healthy sessions', () => {
  const overview = validSiteAgentOverview();
  overview.groups[0]!.sites[0]!.agents[0]!.runtime = { state: 'ambiguous', session_count: 1, healthy_session_ids: ['session-1'], selected_session_id: null };
  overview.groups[0]!.sites[0]!.agents[0]!.actions = { start: false, inspect: false, inspect_reason: 'Choose a session.' };
  const violations = validateOperatorSiteAgentOverviewInvariants(overview);
  assert.ok(violations.some((violation) => violation.invariant === 'runtime_ambiguous_shape'));
});

test('site agent invariants catch identity form, duplicates, and group mismatch', () => {
  const overview = validSiteAgentOverview();
  const site = overview.groups[0]!.sites[0]!;
  site.agents[0]!.agent_id = 'other.resident';
  site.agents.push({ ...site.agents[0]! });
  site.group_id = 'personal-infrastructure';
  const violations = validateOperatorSiteAgentOverviewInvariants(overview);
  assert.ok(violations.some((violation) => violation.invariant === 'agent_id_form'));
  assert.ok(violations.some((violation) => violation.invariant === 'duplicate_agent_id'));
  assert.ok(violations.some((violation) => violation.invariant === 'group_kind_mismatch'));
  assert.equal(formatOperatorSiteAgentInvariantViolation(violations[0]!), `invariant_violation:${violations[0]!.invariant}:${violations[0]!.path}`);
});

test('site-agent parser rejects every semantic invariant class', () => {
  const cases: Array<{ invariant: string; mutate: (overview: any) => void }> = [
    {
      invariant: 'duplicate_group_id',
      mutate: (overview) => overview.groups.push(structuredClone(overview.groups[0])),
    },
    {
      invariant: 'duplicate_site_id',
      mutate: (overview) => overview.groups[0].sites.push({ ...structuredClone(overview.groups[0].sites[0]), agents: [] }),
    },
    {
      invariant: 'duplicate_agent_id',
      mutate: (overview) => overview.groups[0].sites[0].agents.push(structuredClone(overview.groups[0].sites[0].agents[0])),
    },
    {
      invariant: 'group_kind_mismatch',
      mutate: (overview) => { overview.groups[0].sites[0].site_kind = 'user_site'; },
    },
    {
      invariant: 'agent_id_form',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].agent_id = 'other.resident'; },
    },
    {
      invariant: 'selected_not_healthy',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].runtime.selected_session_id = 'session-other'; },
    },
    {
      invariant: 'duplicate_healthy_session_id',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].runtime.healthy_session_ids = ['session-1', 'session-1']; },
    },
    {
      invariant: 'runtime_session_cardinality',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].runtime.session_count = 0; },
    },
    {
      invariant: 'runtime_running_shape',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].runtime.selected_session_id = null; },
    },
    {
      invariant: 'runtime_stopped_shape',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].runtime.state = 'stopped'; },
    },
    {
      invariant: 'runtime_ambiguous_shape',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].runtime.state = 'ambiguous'; },
    },
    {
      invariant: 'runtime_degraded_shape',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].runtime.state = 'degraded'; },
    },
    {
      invariant: 'action_state_mismatch',
      mutate: (overview) => { overview.groups[0].sites[0].agents[0].actions.start = true; },
    },
  ];
  for (const testCase of cases) {
    const overview: any = structuredClone(validSiteAgentOverview());
    testCase.mutate(overview);
    assert.ok(
      validateOperatorSiteAgentOverviewInvariants(overview).some((violation) => violation.invariant === testCase.invariant),
      `${testCase.invariant} must be diagnosed`,
    );
    assert.equal(parseOperatorSiteAgentOverviewWireResponse(overview), null, `${testCase.invariant} must be rejected by parser`);
  }
});
