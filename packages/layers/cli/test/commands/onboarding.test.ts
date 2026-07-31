import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceLaunchMock = vi.hoisted(() => vi.fn());
const narsSessionsMock = vi.hoisted(() => vi.fn());
const sitesInitMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/commands/workspace-launch-application.js', () => ({
  workspaceLaunchCommand: workspaceLaunchMock,
}));

vi.mock('../../src/commands/nars.js', () => ({ narsSessionsCommand: narsSessionsMock }));

// The memfs-backed suite cannot exercise the native sqlite SiteRegistry that
// the real sitesInitCommand opens; the onboarding flow only needs a successful
// provisioning boundary here.
vi.mock('../../src/commands/sites.js', () => ({ sitesInitCommand: sitesInitMock }));

vi.mock('@narada2/invokable-intelligence-management', () => ({
  ensureIntelligenceCatalog: vi.fn(async ({ siteRoot, targetSiteId, userSiteId, hostSiteId }: {
    siteRoot: string;
    targetSiteId: string;
    userSiteId: string;
    hostSiteId: string;
  }) => ({
    schema: 'narada.invokable-intelligence.catalog-bootstrap.v1',
    status: 'initialized',
    mutation_performed: true,
    site_root: siteRoot,
    registry_db_path: join(siteRoot, '.ai', 'intelligence-registry.db'),
    source_registry_path: 'test-provider-registry.bootstrap.json',
    target_site: { kind: 'site', id: `site:${targetSiteId}` },
    user_site: { kind: 'site', id: `site:${userSiteId}` },
    host_site: { kind: 'site', id: `site:${hostSiteId}` },
    counts: { add: 1, update: 0, unchanged: 0 },
    catalog_record_count: 1,
    resource_count: 1,
  })),
}));

import { appendAgentsToJsonRegistryText, appendAgentsToPsd1RegistryText, normalizeOnboardingPlatform, onboardingRoleApprovalCommand, onboardingRoleMaterializeCommand, onboardingStartCommand, onboardingStatusCommand } from '../../src/commands/onboarding.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

const tempDirs: string[] = [];

function createMockContext(): CommandContext {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() };
  return { configPath: '/test/config.json', logger: logger as unknown as CommandContext['logger'], verbose: false };
}

async function tempUserSite(withRegistry = true, residentCount = 1): Promise<{ root: string; registry: string }> {
  const root = join(process.cwd(), '.ai', 'tmp-tests', `onboarding-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const registry = join(root, 'config', 'launch', 'agents.json');
  await mkdir(join(root, 'config', 'launch'), { recursive: true });
  tempDirs.push(root);
  if (withRegistry) {
    await writeFile(registry, JSON.stringify({
      NaradaRoot: root,
      Agents: Array.from({ length: residentCount }, (_, index) => ({
        Agent: index === 0 ? 'user.resident' : `user.resident${index}`,
        Role: 'resident',
        Site: 'user-site',
        NaradaRoot: root,
        SiteRoot: root,
        WorkspaceRoot: root,
        LauncherPath: join(root, 'narada-user.ps1'),
        OperatorSurface: 'agent-cli',
        Runtime: 'narada-agent-runtime-server',
        EnableNativeShell: false,
      })),
    }), 'utf8');
  }
  return { root, registry };
}

afterEach(async () => {
  workspaceLaunchMock.mockReset();
  narsSessionsMock.mockReset();
  sitesInitMock.mockReset();
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

beforeEach(() => {
  workspaceLaunchMock.mockResolvedValue({ exitCode: ExitCode.SUCCESS, result: { status: 'planned' } });
  sitesInitMock.mockResolvedValue({ exitCode: ExitCode.SUCCESS, result: { status: 'initialized' } });
});

describe('User Site onboarding', () => {
  it('defaults the onboarding platform to the current host', () => {
    expect(normalizeOnboardingPlatform()).toBe(process.platform === 'win32' ? 'windows' : 'linux');
  });

  it('renders the concrete launch handoff in human output', async () => {
    const { root, registry } = await tempUserSite(false);
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'launched',
        result_path: join(root, 'runtime', 'workspace-launch-result.json'),
        launch_agents: [{
          agent: 'user-site.resident',
          launch_session_id: 'launch-onboarding-test',
          operator_projection_open_requests: [{ target_ref: 'http://127.0.0.1:54321' }],
        }],
        attachment: {
          sessions: [{
            launch_session_id: 'launch-onboarding-test',
            session_id: 'session-onboarding-test',
            health_endpoint: 'http://127.0.0.1:54322/health',
            event_endpoint: 'ws://127.0.0.1:54323/events',
          }],
        },
      },
    });

    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'human' }, createMockContext());
    const human = (result.result as { _formatted: string })._formatted;
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(human).toContain(`Result: ${join(root, 'runtime', 'workspace-launch-result.json')}`);
    expect(human).toContain('Launch session: launch-onboarding-test');
    expect(human).toContain('Session: session-onboarding-test');
    expect(human).toContain('Health: http://127.0.0.1:54322/health');
    expect(human).toContain('Events: ws://127.0.0.1:54323/events');
    expect(human).toContain('Open: http://127.0.0.1:54321');
  });

  it('renders pending browser projection readiness instead of implying a URL is already open', async () => {
    const { root, registry } = await tempUserSite(false);
    const bindingPath = join(root, 'runtime', 'operator-projection-launch-bindings', 'launch-onboarding-pending.json');
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'launched',
        result_path: join(root, 'runtime', 'workspace-launch-result.json'),
        launch_agents: [{
          agent: 'user-site.resident',
          launch_session_id: 'launch-onboarding-pending',
          operator_projection_launch_binding: { path: bindingPath },
          operator_projection_open_requests: [{ status: 'planned', target_ref: null }],
        }],
      },
    });

    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'human' }, createMockContext());
    const human = (result.result as { _formatted: string })._formatted;
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(human).toContain('Browser: waiting for agent-web-ui attachment and browser URL');
    expect(human).toContain('Projection: exact NARS session binding is resolved before browser open');
    expect(human).toContain(`Projection readiness: ${bindingPath}.ready.json`);
    expect(human).not.toContain('Open: agent-web-ui browser projection requested');
  });

  it('offers the no-credential demo even when the User Site is absent', async () => {
    const root = join(process.cwd(), '.ai', 'tmp-tests', `onboarding-missing-${Date.now()}`);
    const result = await onboardingStartCommand({ siteRoot: root, demo: true, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result, JSON.stringify(result.result, null, 2)).toMatchObject({
      schema: 'narada.onboarding.start.v1',
      status: 'demo_available',
      mutation_performed: false,
      readiness: { status: 'demo_available', first_useful_interaction: 'pending' },
      role_expansion: { status: 'unavailable', recommended_roles: [] },
    });
  });

  it('uses Linux-native resident-first defaults and JSON launch registry', async () => {
    const { root, registry } = await tempUserSite(false);
    const result = await onboardingStartCommand({
      platform: 'linux',
      siteRoot: root,
      registryPath: registry,
      noExec: false,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      schema: 'narada.onboarding.start.v1',
      status: 'launched',
      platform: 'linux',
      user_site: { root, registry_path: registry, resident_agent: 'user-site.resident' },
      defaults: {
        operator_surface: 'agent-web-ui',
        runtime_host: 'narada-agent-runtime-server',
      },
    });

    const launchRegistry = JSON.parse(await readFile(registry, 'utf8')) as {
      Agents: Array<Record<string, unknown>>;
    };
    expect(launchRegistry.Agents).toHaveLength(1);
    expect(launchRegistry.Agents[0]).toMatchObject({
      Agent: 'user-site.resident',
      Role: 'resident',
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
      McpScope: 'none',
      SiteRoot: root,
      WorkspaceRoot: root,
    });
    expect(typeof launchRegistry.Agents[0].LauncherPath).toBe('string');
    expect(launchRegistry.Agents[0]).not.toHaveProperty('Launcher');
  });

  it('reports explicit intelligence setup when the provisioned resident launch is refused', async () => {
    const { root, registry } = await tempUserSite(false);
    workspaceLaunchMock.mockRejectedValueOnce(new Error(
      'workspace_launch_catalog_preflight_failed: user-site.resident: intelligence_context_not_configured: Intelligence launch context is incomplete: user_site_id, host_site_id, principal_id',
    ));

    const result = await onboardingStartCommand({
      platform: 'linux',
      siteRoot: root,
      registryPath: registry,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result, JSON.stringify(result.result, null, 2)).toMatchObject({
      schema: 'narada.onboarding.start.v1',
      status: 'blocked',
      reason_code: 'intelligence_catalog_setup_required',
      mutation_performed: true,
      user_site: { root, registry_path: registry, resident_agent: 'user-site.resident' },
      readiness: { status: 'blocked', first_useful_interaction: 'pending', evidence: ['launch_refused'] },
      intelligence_catalog: { mutation_performed: true },
      message: expect.stringContaining('intelligence_context_not_configured'),
      next_action: expect.stringContaining('Complete User Site intelligence setup'),
    });
  });

  it('normalizes a structured intelligence refusal returned by the launch command', async () => {
    const { root, registry } = await tempUserSite(false);
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        status: 'failed',
        error: 'workspace_launch_catalog_preflight_failed: user-site.resident: intelligence_context_not_configured',
      },
    });

    const result = await onboardingStartCommand({
      platform: 'linux',
      siteRoot: root,
      registryPath: registry,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      status: 'blocked',
      reason_code: 'intelligence_catalog_setup_required',
      mutation_performed: true,
      message: expect.stringContaining('intelligence_context_not_configured'),
    });
  });

  it('reports a missing User Site registry as an actionable block', async () => {
    const { root, registry } = await tempUserSite(false);
    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, noExec: true, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'planned',
      reason_code: 'user_site_bootstrap_required',
      mutation_performed: false,
    });
  });

  it('provisions a resident launch registry on the live first-use path', async () => {
    const { root, registry } = await tempUserSite(false);
    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'launched',
      mutation_performed: true,
      user_site: { resident_agent: 'user-site.resident' },
    });
    expect(JSON.parse(await readFile(registry, 'utf8'))).toMatchObject({
      Agents: [{ Agent: 'user-site.resident', Role: 'resident', OperatorSurface: 'agent-web-ui' }],
    });
  });

  it('preserves the admitted resident surface and durable role recommendation metadata', async () => {
    const { root, registry } = await tempUserSite();
    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, noExec: true, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'planned',
      mutation_performed: false,
      user_site: { resident_agent: 'user.resident' },
      defaults: {
        assistant_label: 'General assistant',
        role: 'resident',
        operator_surface: 'agent-cli',
        intelligence: {
          resolution_phase: 'runtime-invocation',
          authority: 'site-catalog-and-materialized-policy',
        },
      },
      role_expansion: {
        status: 'unavailable',
        recommended_roles: [],
        requires_operator_confirmation: true,
      },
      readiness: { status: 'not_started', first_useful_interaction: 'pending' },
      state_path: null,
    });
    expect(workspaceLaunchMock).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding: true, noWaitForEnterBeforeExec: true }),
      expect.anything(),
    );
  });

  it('refuses an ambiguous resident roster instead of guessing', async () => {
    const { root, registry } = await tempUserSite(true, 2);
    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, noExec: true, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'error', reason_code: 'onboarding_start_failed' });
  });

  it('does not attach to a different or stale launch session', async () => {
    const { root, registry } = await tempUserSite();
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: { status: 'launched', launch_agents: [{ agent: 'user.resident', launch_session_id: 'launch-current-test' }] },
    });
    const started = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    const startedValue = started.result as { state_path: string };
    narsSessionsMock.mockResolvedValue({
      exitCode: ExitCode.SUCCESS,
      result: {
        sessions: [{
          session_id: 'session-stale-test',
          agent_id: 'user.resident',
          launch_session_id: 'launch-old-test',
          display_state: 'active',
          health_status: 'healthy',
        }],
      },
    });
    const result = await onboardingStatusCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'launch_requested',
      session: { id: null, launch_session_id: null },
      verification: { status: 'pending', session_id: null },
      state_path: startedValue.state_path,
    });
  });

  it('does not treat a system directive as the first operator interaction', async () => {
    const { root, registry } = await tempUserSite();
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: { status: 'launched', launch_agents: [{ agent: 'user.resident', launch_session_id: 'launch-system-test' }] },
    });
    await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    const sessionDir = join(root, '.narada', 'crew', 'nars-sessions', 'session-system-test');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'events.jsonl'), [
      { event_sequence: 1, event: 'session_started', agent_id: 'user.resident' },
      { event_sequence: 2, event: { type: 'item.completed', item: { type: 'mcp_tool_call', tool: 'agent_context_startup_sequence', status: 'completed' } } },
      { event_sequence: 3, event: 'input_event_queued', event_id: 'input-system-test', source: 'system_directive', source_kind: 'system_directive' },
      { event_sequence: 4, event: 'input_admitted_to_turn', input_event_id: 'input-system-test' },
      { event_sequence: 5, event: 'carrier_turn_started', turn_id: 'turn-system-test' },
      { event_sequence: 6, event: { type: 'item.completed', item: { type: 'agent_message', text: 'The system check completed.' } } },
      { event_sequence: 7, event: 'carrier_turn_completed', turn_id: 'turn-system-test' },
      { event_sequence: 8, event: 'input_completed', input_event_id: 'input-system-test', terminal_state: 'completed' },
    ].map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8');
    narsSessionsMock.mockResolvedValue({
      exitCode: ExitCode.SUCCESS,
      result: {
        sessions: [{
          session_id: 'session-system-test',
          session_dir: sessionDir,
          agent_id: 'user.resident',
          launch_session_id: 'launch-system-test',
          display_state: 'active',
          health_status: 'healthy',
        }],
      },
    });
    const result = await onboardingStatusCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(result.result, JSON.stringify(result.result, null, 2)).toMatchObject({
      status: 'launch_requested',
      verification: {
        status: 'pending',
        checks: {
          healthy_session: true,
          identity_hydrated: true,
          useful_or_no_work_response: true,
          admitted_message: false,
        },
      },
    });
  });

  it('returns a nonzero status and human diagnostics when first-use verification is blocked', async () => {
    const { root, registry } = await tempUserSite();
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: { status: 'launched', launch_agents: [{ agent: 'user.resident', launch_session_id: 'launch-failed-verification' }] },
    });
    await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    const sessionDir = join(root, '.narada', 'crew', 'nars-sessions', 'session-failed-verification');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'events.jsonl'), [
      { event_sequence: 1, sequence: 1, event: 'session_started', agent_id: 'user.resident' },
      { event_sequence: 2, sequence: 2, event: 'session_lifecycle_transition', lifecycle_state: 'ready' },
      { event_sequence: 3, sequence: 3, event: 'input_event_queued', event_id: 'input-failed-verification', source: 'operator', source_kind: 'operator' },
      { event_sequence: 4, sequence: 4, event: 'input_admitted_to_turn', input_event_id: 'input-failed-verification' },
      { event_sequence: 5, sequence: 5, event: 'turn_started', turn_id: 'turn-failed-verification' },
      { event_sequence: 6, sequence: 6, event: 'turn_failed', turn_id: 'turn-failed-verification', terminal_state: 'failed' },
      { event_sequence: 7, sequence: 7, event: 'input_completed', input_event_id: 'input-failed-verification', terminal_state: 'failed' },
    ].map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8');
    narsSessionsMock.mockResolvedValue({
      exitCode: ExitCode.SUCCESS,
      result: {
        sessions: [{
          session_id: 'session-failed-verification',
          session_dir: sessionDir,
          agent_id: 'user.resident',
          launch_session_id: 'launch-failed-verification',
          display_state: 'active',
          health_status: 'healthy',
        }],
      },
    });

    const result = await onboardingStatusCommand({ siteRoot: root, format: 'human' }, createMockContext());
    const human = (result.result as { _formatted: string })._formatted;
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'blocked', reason_code: 'first_use_verification_failed' });
    expect(human).toContain('Status: blocked');
    expect(human).toContain('Reason: first_use_verification_failed');
    expect(human).toContain('Failed checks: useful_or_no_work_response');
    expect(human).toContain('Events: ');
  });

  it('reports malformed durable onboarding state instead of treating it as missing', async () => {
    const { root } = await tempUserSite();
    const statePath = join(root, '.narada', 'runtime', 'onboarding', 'user-site-onboarding.json');
    await mkdir(join(root, '.narada', 'runtime', 'onboarding'), { recursive: true });
    await writeFile(statePath, '{ malformed', 'utf8');
    const result = await onboardingStatusCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'blocked' });
    expect(String((result.result as { reason_code?: string }).reason_code)).toMatch(/^onboarding_state_invalid_json:/);
  });

  it('persists non-secret launch readiness and role recommendation state only after execution', async () => {
    const { root, registry } = await tempUserSite();
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'launched',
        launch_agents: [{ agent: 'user.resident', launch_session_id: 'launch-readiness-test' }],
      },
    });
    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const value = result.result as { status: string; mutation_performed: boolean; state_path: string | null };
    expect(value.status).toBe('launched');
    expect(value.mutation_performed).toBe(true);
    expect(value.state_path).toBe(join(root, '.narada', 'runtime', 'onboarding', 'user-site-onboarding.json'));
    const state = JSON.parse(await readFile(value.state_path!, 'utf8')) as Record<string, unknown>;
    expect(state).toMatchObject({
      schema: 'narada.user_site_onboarding_state.v1',
      user_site_root: root,
      resident_agent: 'user.resident',
      readiness: { status: 'launch_requested', first_useful_interaction: 'pending' },
      role_expansion: { recommended_roles: [], status: 'unavailable', requires_operator_confirmation: true },
      launch_registry_path: registry,
      launch_session_id: 'launch-readiness-test',
    });
    expect(JSON.stringify(state)).not.toMatch(/api[_-]?key|secret|token/i);
  });

  it('verifies first use from the resident session health and event log', async () => {
    const { root, registry } = await tempUserSite();
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'launched',
        launch_agents: [{ agent: 'user.resident', launch_session_id: 'launch-onboarding-test' }],
      },
    });
    const started = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    const startedValue = started.result as { state_path: string };
    expect(JSON.parse(await readFile(startedValue.state_path, 'utf8'))).toMatchObject({ launch_session_id: 'launch-onboarding-test', launch_registry_path: registry });
    const sessionDir = join(root, '.narada', 'crew', 'nars-sessions', 'session-onboarding-test');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'events.jsonl'), [
      { event_sequence: 1, sequence: 1, event: 'session_started', agent_id: 'user.resident', agent_identity_ref: { schema: 'narada.agent_identity_ref.v2' } },
      { event_sequence: 2, sequence: 2, event: { type: 'item.completed', item: { type: 'mcp_tool_call', tool: 'agent_context_startup_sequence', status: 'completed' } } },
      { event_sequence: 3, sequence: 3, event: 'input_event_queued', event_id: 'input-onboarding-test', source: 'operator', source_kind: 'operator' },
      { event_sequence: 4, sequence: 4, event: 'input_admitted_to_turn', input_event_id: 'input-onboarding-test' },
      { event_sequence: 5, sequence: 5, event: 'carrier_turn_started', turn_id: 'turn-onboarding-test' },
      { event_sequence: 6, sequence: 6, event: { type: 'item.completed', item: { type: 'agent_message', text: 'Your workspace is ready.' } } },
      { event_sequence: 7, sequence: 7, event: 'carrier_turn_completed', turn_id: 'turn-onboarding-test' },
      { event_sequence: 8, sequence: 8, event: 'input_completed', input_event_id: 'input-onboarding-test', terminal_state: 'completed' },
    ].map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8');
    narsSessionsMock.mockResolvedValue({
      exitCode: ExitCode.SUCCESS,
      result: {
        sessions: [{
          session_id: 'session-onboarding-test',
          session_dir: sessionDir,
          agent_id: 'user.resident',
          launch_session_id: 'launch-onboarding-test',
          started_at: new Date().toISOString(),
          display_state: 'active',
          health_status: 'healthy',
          agent_identity_ref: { schema: 'narada.agent_identity_ref.v2' },
        }],
      },
    });

    const result = await onboardingStatusCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      schema: 'narada.onboarding.status.v1',
      status: 'first_use_verified',
      mutation_performed: true,
      session: { id: 'session-onboarding-test', display_state: 'active', health_status: 'healthy' },
      readiness: { status: 'first_use_verified', first_useful_interaction: 'verified' },
      verification: {
        status: 'verified',
        response_kind: 'useful',
        checks: {
          healthy_session: true,
          identity_hydrated: true,
          input_ready: true,
          admitted_message: true,
          useful_or_no_work_response: true,
        },
      },
      state_path: startedValue.state_path,
    });
    const state = JSON.parse(await readFile(startedValue.state_path, 'utf8')) as Record<string, unknown>;
    expect(state).toMatchObject({
      readiness: { status: 'first_use_verified', first_useful_interaction: 'verified' },
      session_id: 'session-onboarding-test',
      verification: { status: 'verified', response_kind: 'useful' },
    });
    expect(JSON.stringify(state)).not.toMatch(/api[_-]?key|secret|token/i);

    const partialApproval = await onboardingRoleApprovalCommand({ siteRoot: root, roles: ['architect'], confirm: true, format: 'json' }, createMockContext());
    expect(partialApproval.exitCode).toBe(ExitCode.SUCCESS);
    expect(partialApproval.result).toMatchObject({
      schema: 'narada.onboarding.role_expansion_approval.v1',
      status: 'approved_pending_materialization',
      mutation_performed: true,
      approved_roles: ['architect'],
      preview: { roles: ['architect'], roster_mutation_performed: false },
    });
    const partialState = JSON.parse(await readFile(startedValue.state_path, 'utf8')) as Record<string, unknown>;
    expect(partialState).toMatchObject({
      role_expansion: {
        status: 'available',
        recommended_roles: ['builder'],
        approved_roles: ['architect'],
      },
    });

    const refreshed = await onboardingStatusCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(refreshed.result).toMatchObject({
      status: 'first_use_verified',
      role_expansion: { status: 'available', recommended_roles: ['builder'], approved_roles: ['architect'] },
    });

    const finalApproval = await onboardingRoleApprovalCommand({ siteRoot: root, roles: ['builder'], confirm: true, format: 'json' }, createMockContext());
    expect(finalApproval.exitCode).toBe(ExitCode.SUCCESS);
    expect(finalApproval.result).toMatchObject({
      schema: 'narada.onboarding.role_expansion_approval.v1',
      status: 'approved_pending_materialization',
      mutation_performed: true,
      approved_roles: ['builder'],
      preview: { roles: ['builder'], roster_mutation_performed: false },
    });
    expect(JSON.stringify(finalApproval.result)).not.toMatch(/api[_-]?key|secret|token/i);

    const approvalPath = join(root, '.narada', 'runtime', 'onboarding', 'role-expansion-approval.json');

    const unapprovedRole = await onboardingRoleMaterializeCommand({ siteRoot: root, roles: ['observer'], format: 'json' }, createMockContext());
    expect(unapprovedRole.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(unapprovedRole.result).toMatchObject({
      schema: 'narada.onboarding.role_expansion_materialization.v1',
      status: 'blocked',
      mutation_performed: false,
      reason_code: 'role_materialization_roles_not_approved',
    });

    const partialMaterialize = await onboardingRoleMaterializeCommand({ siteRoot: root, roles: ['architect'], format: 'json' }, createMockContext());
    expect(partialMaterialize.exitCode).toBe(ExitCode.SUCCESS);
    expect(partialMaterialize.result).toMatchObject({
      schema: 'narada.onboarding.role_expansion_materialization.v1',
      status: 'materialized',
      mutation_performed: true,
      materialized_roles: ['architect'],
      pending_roles: ['builder'],
      registry_path: registry,
      approval_path: approvalPath,
    });
    const partialRegistry = JSON.parse(await readFile(registry, 'utf8')) as { Agents: Array<Record<string, unknown>> };
    expect(partialRegistry.Agents).toHaveLength(2);
    expect(partialRegistry.Agents[0]).toMatchObject({ Agent: 'user.resident', Role: 'resident', OperatorSurface: 'agent-cli' });
    expect(partialRegistry.Agents[1]).toMatchObject({
      Agent: 'user-site.architect',
      Title: 'Architect',
      Role: 'architect',
      Site: 'user-site',
      NaradaRoot: root,
      SiteRoot: root,
      WorkspaceRoot: root,
      OperatorSurface: 'agent-cli',
      Runtime: 'narada-agent-runtime-server',
      EnableNativeShell: false,
    });
    expect(JSON.parse(await readFile(approvalPath, 'utf8'))).toMatchObject({
      status: 'approved_pending_materialization',
      materialized_roles: ['architect'],
    });
    expect(JSON.parse(await readFile(startedValue.state_path, 'utf8'))).toMatchObject({
      role_expansion: {
        status: 'approved',
        recommended_roles: [],
        approved_roles: ['architect', 'builder'],
        materialized_roles: ['architect'],
      },
    });

    const finalMaterialize = await onboardingRoleMaterializeCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(finalMaterialize.exitCode).toBe(ExitCode.SUCCESS);
    expect(finalMaterialize.result).toMatchObject({
      schema: 'narada.onboarding.role_expansion_materialization.v1',
      status: 'materialized',
      mutation_performed: true,
      materialized_roles: ['builder'],
      pending_roles: [],
    });
    expect(JSON.stringify(finalMaterialize.result)).not.toMatch(/api[_-]?key|secret|token/i);
    const finalRegistry = JSON.parse(await readFile(registry, 'utf8')) as { Agents: Array<Record<string, unknown>> };
    expect(finalRegistry.Agents).toHaveLength(3);
    expect(finalRegistry.Agents[0]).toMatchObject({ Agent: 'user.resident', Role: 'resident', OperatorSurface: 'agent-cli' });
    expect(finalRegistry.Agents[2]).toMatchObject({
      Agent: 'user-site.builder',
      Title: 'Builder',
      Role: 'builder',
      OperatorSurface: 'agent-cli',
      Runtime: 'narada-agent-runtime-server',
      EnableNativeShell: false,
    });
    expect(JSON.parse(await readFile(approvalPath, 'utf8'))).toMatchObject({
      status: 'materialized',
      materialized_roles: ['architect', 'builder'],
    });
    expect(JSON.parse(await readFile(startedValue.state_path, 'utf8'))).toMatchObject({
      role_expansion: {
        status: 'materialized',
        recommended_roles: [],
        approved_roles: ['architect', 'builder'],
        materialized_roles: ['architect', 'builder'],
      },
    });

    const refreshedAfterMaterialize = await onboardingStatusCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(refreshedAfterMaterialize.result).toMatchObject({
      role_expansion: { status: 'materialized', materialized_roles: ['architect', 'builder'] },
    });

    const registryTextBeforeRerun = await readFile(registry, 'utf8');
    const rerun = await onboardingRoleMaterializeCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(rerun.exitCode).toBe(ExitCode.SUCCESS);
    expect(rerun.result).toMatchObject({
      schema: 'narada.onboarding.role_expansion_materialization.v1',
      status: 'already_materialized',
      mutation_performed: false,
      pending_roles: [],
    });
    expect(await readFile(registry, 'utf8')).toBe(registryTextBeforeRerun);
  });

  it('returns a nonzero status and reason when role approval is blocked', async () => {
    const { root } = await tempUserSite();
    const result = await onboardingRoleApprovalCommand({ siteRoot: root, format: 'human' }, createMockContext());
    const human = (result.result as { _formatted: string })._formatted;
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({ status: 'blocked', reason_code: 'onboarding_state_missing' });
    expect(human).toContain('Status: blocked');
    expect(human).toContain('Reason: onboarding_state_missing');
  });

  it('blocks role materialization when no approval was recorded', async () => {
    const { root, registry } = await tempUserSite();
    const started = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    expect(started.exitCode).toBe(ExitCode.SUCCESS);
    const registryBefore = await readFile(registry, 'utf8');
    const result = await onboardingRoleMaterializeCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(result.result).toMatchObject({
      schema: 'narada.onboarding.role_expansion_materialization.v1',
      status: 'blocked',
      mutation_performed: false,
      reason_code: 'role_materialization_requires_approval',
    });
    expect(await readFile(registry, 'utf8')).toBe(registryBefore);
  });

  it('verifies first use from the narada-agent-runtime-server event vocabulary', async () => {
    const { root, registry } = await tempUserSite();
    workspaceLaunchMock.mockResolvedValueOnce({
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'launched',
        launch_agents: [{ agent: 'user.resident', launch_session_id: 'launch-runtime-carrier-test' }],
      },
    });
    const started = await onboardingStartCommand({ siteRoot: root, registryPath: registry, format: 'json' }, createMockContext());
    const startedValue = started.result as { state_path: string };
    const sessionDir = join(root, '.narada', 'crew', 'nars-sessions', 'session-runtime-carrier-test');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, 'events.jsonl'), [
      { event_sequence: 1, sequence: 1, event: 'session_started', runtime: 'narada-agent-runtime-server', agent_id: 'user.resident' },
      { event_sequence: 2, sequence: 2, event: 'session_lifecycle_transition', lifecycle_state: 'ready', agent_id: 'user.resident' },
      { event_sequence: 3, sequence: 3, event: 'input_event_queued', event_id: 'input-runtime-test', source: 'manual_operator', source_kind: 'operator' },
      { event_sequence: 4, sequence: 4, event: 'input_event_started', event_id: 'input-runtime-test' },
      { event_sequence: 5, sequence: 5, event: 'turn_started', turn_id: 'turn-runtime-test', input_event_id: 'input-runtime-test' },
      { event_sequence: 6, sequence: 6, event: 'assistant_message', content: 'Online and ready to work.' },
      { event_sequence: 7, sequence: 7, event: 'turn_complete', turn_id: 'turn-runtime-test', terminal_state: 'completed' },
      { event_sequence: 8, sequence: 8, event: 'input_event_completed', event_id: 'input-runtime-test', terminal_state: 'completed' },
    ].map((event) => JSON.stringify(event)).join('\n') + '\n', 'utf8');
    narsSessionsMock.mockResolvedValue({
      exitCode: ExitCode.SUCCESS,
      result: {
        sessions: [{
          session_id: 'session-runtime-carrier-test',
          session_dir: sessionDir,
          agent_id: 'user.resident',
          launch_session_id: 'launch-runtime-carrier-test',
          started_at: new Date().toISOString(),
          display_state: 'active',
          health_status: 'healthy',
          agent_identity_ref: { schema: 'narada.agent_identity_ref.v2' },
        }],
      },
    });

    const result = await onboardingStatusCommand({ siteRoot: root, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      schema: 'narada.onboarding.status.v1',
      status: 'first_use_verified',
      readiness: { status: 'first_use_verified', first_useful_interaction: 'verified' },
      verification: {
        status: 'verified',
        response_kind: 'useful',
        checks: {
          healthy_session: true,
          identity_hydrated: true,
          input_ready: true,
          admitted_message: true,
          useful_or_no_work_response: true,
        },
      },
    });
    expect(JSON.parse(await readFile(startedValue.state_path, 'utf8'))).toMatchObject({
      readiness: { status: 'first_use_verified', first_useful_interaction: 'verified' },
      verification: { status: 'verified' },
    });
  });
});

describe('launch registry agent append', () => {
  const psd1Fixture = [
    '@{',
    '  # Explicitly admit the composed host/user-site/local-site MCP fabric.',
    '  McpScope = "all"',
    '',
    '  CarrierPolicy = @{',
    '    DirectCarrierStartEnabled = $true',
    '    Shims = @{',
    '      Enabled = $true',
    '    }',
    '  }',
    '',
    '  Agents = @(',
    '    @{',
    '      Agent = "andrey-user.resident"',
    '      Title = "Andrey Resident"',
    '      NaradaRoot = "C:\\Users\\Andrey\\Narada"',
    '      OperatorSurface = "agent-web-ui"',
    '      Runtime = "narada-agent-runtime-server"',
    '      EnableNativeShell = $false',
    '    }',
    '  )',
    '}',
    '',
  ].join('\n');

  const architectBlock = [
    '    @{',
    '      Agent = "andrey-user.architect"',
    '      Title = "Architect"',
    '      Role = "architect"',
    '      OperatorSurface = "agent-cli"',
    '      Runtime = "narada-agent-runtime-server"',
    '      EnableNativeShell = $false',
    '    }',
  ];

  it('appends psd1 agent blocks without disturbing policy content or comments', () => {
    const merged = appendAgentsToPsd1RegistryText(psd1Fixture, [architectBlock]);
    expect(merged.slice(0, merged.indexOf('Agents = @('))).toBe(psd1Fixture.slice(0, psd1Fixture.indexOf('Agents = @(')));
    expect(merged).toContain('CarrierPolicy = @{');
    expect(merged).toContain('Shims = @{');
    expect(merged).toContain('McpScope = "all"');
    expect(merged).toContain('Agent = "andrey-user.resident"');
    expect(merged.indexOf('Agent = "andrey-user.architect"')).toBeGreaterThan(merged.indexOf('Agent = "andrey-user.resident"'));
    expect(merged.split('    @{').length - 1).toBe(2);
    expect(merged.slice(merged.indexOf('\n  )'))).toBe(psd1Fixture.slice(psd1Fixture.indexOf('\n  )')));
  });

  it('matches the line-ending style of the psd1 file', () => {
    const crlfFixture = psd1Fixture.replace(/\n/g, '\r\n');
    const merged = appendAgentsToPsd1RegistryText(crlfFixture, [architectBlock]);
    expect(merged).toContain('Agent = "andrey-user.architect"\r\n');
    expect(merged).toContain('    }\r\n  )\r\n}');
  });

  it('refuses psd1 content without a detectable Agents array', () => {
    expect(() => appendAgentsToPsd1RegistryText('@{\n  McpScope = "all"\n}\n', [architectBlock])).toThrow('launch_registry_agents_array_not_found');
  });

  it('preserves unrelated top-level json keys when appending agents', () => {
    const merged = JSON.parse(appendAgentsToJsonRegistryText(
      `${JSON.stringify({ NaradaRoot: '/x', Policy: { keep: true }, Agents: [{ Agent: 'site.resident' }] })}\n`,
      [{ Agent: 'site.architect', Role: 'architect', OperatorSurface: 'agent-cli' }],
    )) as Record<string, unknown>;
    expect(merged).toMatchObject({
      NaradaRoot: '/x',
      Policy: { keep: true },
      Agents: [{ Agent: 'site.resident' }, { Agent: 'site.architect', Role: 'architect' }],
    });
  });
});
