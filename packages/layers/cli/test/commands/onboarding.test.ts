import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceLaunchMock = vi.hoisted(() => vi.fn());
const narsSessionsMock = vi.hoisted(() => vi.fn());
const sitesInitMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/commands/workspace-launch-application.js', () => ({
  registryDefaultIntelligenceProvider: () => 'kimi-code-api',
  workspaceLaunchCommand: workspaceLaunchMock,
}));

vi.mock('../../src/commands/nars.js', () => ({ narsSessionsCommand: narsSessionsMock }));

// The memfs-backed suite cannot exercise the native sqlite SiteRegistry that
// the real sitesInitCommand opens; the onboarding flow only needs a successful
// provisioning boundary here.
vi.mock('../../src/commands/sites.js', () => ({ sitesInitCommand: sitesInitMock }));

import { onboardingRoleApprovalCommand, onboardingStartCommand, onboardingStatusCommand } from '../../src/commands/onboarding.js';
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
  it('offers the no-credential demo even when the User Site is absent', async () => {
    const root = join(process.cwd(), '.ai', 'tmp-tests', `onboarding-missing-${Date.now()}`);
    tempDirs.push(root);
    const result = await onboardingStartCommand({ siteRoot: root, demo: true, format: 'json' }, createMockContext());
    expect(result.exitCode, JSON.stringify(result.result, null, 2)).toBe(ExitCode.SUCCESS);
    expect(result.result, JSON.stringify(result.result, null, 2)).toMatchObject({
      schema: 'narada.onboarding.start.v1',
      status: 'demo_available',
      mutation_performed: false,
      readiness: { status: 'demo_available', first_useful_interaction: 'pending' },
      role_expansion: { status: 'unavailable', recommended_roles: [] },
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

  it('plans one resident with safe defaults and durable role recommendation metadata', async () => {
    const { root, registry } = await tempUserSite();
    const result = await onboardingStartCommand({ siteRoot: root, registryPath: registry, noExec: true, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      status: 'planned',
      mutation_performed: false,
      user_site: { resident_agent: 'user.resident' },
      defaults: { assistant_label: 'General assistant', role: 'resident', operator_surface: 'agent-cli', intelligence_provider: 'kimi-code-api' },
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
  });
});
