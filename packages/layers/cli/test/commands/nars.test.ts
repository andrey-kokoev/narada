import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { agentWebUiAttachCommand } from '../../src/commands/agent-web-ui.js';
import { narsAttachCommandCommand, narsAuthorityTransitionPlanCommand, narsSessionsCommand } from '../../src/commands/nars.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

const registrySites: Array<{ siteId: string; siteRoot: string }> = [];

vi.mock('@narada2/windows-site', () => ({
  resolveRegistryDbPath: () => 'mock-registry.db',
  openRegistryDb: vi.fn(async () => ({ close: vi.fn() })),
  SiteRegistry: class {
    listSites(): Array<{ siteId: string; siteRoot: string }> {
      return registrySites;
    }

    close(): void {}
  },
}));

function createMockContext(): CommandContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
  return {
    configPath: '/test/config.json',
    logger: logger as unknown as CommandContext['logger'],
    verbose: false,
  };
}

const tempDirs: string[] = [];

function tempSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'narada-nars-cli-'));
  tempDirs.push(dir);
  return dir;
}

function writeSession(siteRoot: string, sessionId = 'carrier_cli_test', options: { agentId?: string; siteId?: string } = {}): void {
  const agentId = options.agentId ?? 'sonar.resident';
  const siteId = options.siteId ?? 'sonar';
  const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir!;
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'session-index-record.json'), `${JSON.stringify({
    schema: 'narada.nars.session_index_record.v1',
    session_id: sessionId,
    runtime_session_id: sessionId,
    nars_session_id: sessionId,
    carrier_session_id: sessionId,
    derived_from_event: 'session_started',
    projection_generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: agentId,
    site_id: siteId,
    site_id_source: 'session_started',
    site_root: siteRoot,
    runtime_kind: 'narada-agent-runtime-server',
    launch_operator_surface_kind: 'agent-cli',
    session_dir: sessionDir,
    session_path: join(sessionDir, 'session.jsonl'),
    events_path: join(sessionDir, 'events.jsonl'),
    heartbeat_path: join(sessionDir, 'heartbeat.json'),
    event_endpoint: 'ws://127.0.0.1:12345/events',
    health_endpoint: 'http://127.0.0.1:12346/health',
    started_at: '2026-06-23T00:00:00.000Z',
    last_seen_at: '2026-06-23T00:00:05.000Z',
    terminal_state: null,
    status_hint: 'alive',
    status_hint_authority: 'discovery_projection_only',
    authority_runtime_host: 'local',
    authority_epoch: 3,
    authority_runtime_id: `auth_local_${sessionId}`,
    authority_transition_state: null,
    superseded_by_session_id: null,
    authority_locator_ref: null,
    authority_transition_feasibility: {
      active_turn: { status: 'clear', active: false },
      operator_input_queue: { mode: 'drain_before_seal', pending_count_at_request: 0, pending_count_at_seal: 0 },
      event_cursor: { last_sequence: 120 },
      target_health_by_host: { ['cloudflare-host']: { status: 'healthy' } },
      source_seal: { status: 'available', available: true },
      mcp_fabric: { mode: 'compatibility_report_required', status: 'compatible' },
      artifacts: { mode: 'registry_plus_admitted_content', source_paths_exposed: false },
      credentials: { status: 'available', refs_only: true },
      target_descriptor: { authority_role: 'canonical_session_runtime' },
    },
    attached_projections: null,
    attached_projections_status: 'not_tracked',
    attach_commands: {
      agent_cli: `narada-agent-cli --identity ${agentId} --session ${sessionId} --attach`,
      agent_web_ui: 'narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health',
    },
  }, null, 2)}\n`, 'utf8');
  writeFileSync(join(sessionDir, 'heartbeat.json'), `${JSON.stringify({ timestamp: new Date().toISOString() })}\n`, 'utf8');
}

function writeClosedSession(siteRoot: string, sessionId = 'carrier_closed_test'): void {
  writeSession(siteRoot, sessionId);
  const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir!;
  const recordPath = join(sessionDir, 'session-index-record.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.terminal_state = 'closed';
  record.status_hint = 'closed';
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function writeSupersededSession(siteRoot: string, sessionId = 'carrier_source_test', targetSessionId = 'carrier_target_test'): void {
  writeSession(siteRoot, sessionId);
  const recordPath = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionIndexRecordPath!;
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.authority_transition_state = 'target_active';
  record.source_write_admission = 'sealed';
  record.superseded_by_session_id = targetSessionId;
  record.authority_locator_ref = 'authority-locator:target';
  record.target_authority_locator = {
    session_id: targetSessionId,
    event_endpoint: 'wss://projection.example.test/authority/events',
    health_endpoint: 'https://projection.example.test/authority/health',
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function retimeSession(siteRoot: string, sessionId: string, timestamp: string): void {
  const recordPath = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionIndexRecordPath!;
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.started_at = timestamp;
  record.last_seen_at = timestamp;
  record.projection_generated_at = timestamp;
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function writeLaunchRegistry(siteRoot: string): string {
  const registryPath = join(siteRoot, 'agents.psd1');
  writeFileSync(registryPath, `@{\n  Agents = @(\n    @{\n      Agent = "resident"\n      Site = "sonar"\n      SiteRoot = "${siteRoot.replace(/\\/g, '\\\\')}"\n    }\n  )\n}\n`, 'utf8');
  return registryPath;
}

function writeLaunchRegistryWithoutExplicitSite(registryDir: string, siteRoot: string): string {
  const registryPath = join(registryDir, 'agents-no-site.psd1');
  writeFileSync(registryPath, `@{\n  Agents = @(\n    @{\n      Agent = "narada-staccato.resident"\n      NaradaRoot = "${siteRoot.replace(/\\/g, '\\\\')}"\n      SiteRoot = "${siteRoot.replace(/\\/g, '\\\\')}"\n    }\n  )\n}\n`, 'utf8');
  return registryPath;
}

afterEach(() => {
  registrySites.splice(0);
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('nars CLI commands', () => {
  it('discovers Site-local NARS sessions with display state', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);

    const result = await narsSessionsCommand({ siteRoot, health: false, format: 'json' }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { schema: string; sessions: Array<Record<string, unknown>> };
    expect(body.schema).toBe('narada.nars.sessions_command_result.v1');
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      session_id: 'carrier_cli_test',
      runtime_session_id: 'carrier_cli_test',
      nars_session_id: 'carrier_cli_test',
      agent_id: 'sonar.resident',
      display_state: 'starting_or_degraded',
    });
    expect(body.sessions[0].record).toBeUndefined();
    expect(body.sessions[0].heartbeat).toBeUndefined();
  });

  it('renders authority host and supersession state in session text output', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_superseded_source');
    const recordPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_superseded_source' }).narsSessionIndexRecordPath!;
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.authority_transition_state = 'source_sealed';
    record.superseded_by_session_id = 'cf_session_target';
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

    const result = await narsSessionsCommand({ siteRoot, health: false, format: 'human' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const rendered = (result.result as { _formatted: string })._formatted;
    expect(rendered).toContain('authority');
    expect(rendered).toContain('local e3 source_sealed -> cf_session_target');
  });

  it('plans a read-only NARS authority host transition from session index metadata', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);

    const result = await narsAuthorityTransitionPlanCommand({
      siteRoot,
      session: 'carrier_cli_test',
      targetHost: 'cloudflare-host',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      schema: 'narada.nars.authority_runtime_host_transition_plan.v1',
      status: 'feasible',
      mutation_performed: false,
      session_id: 'carrier_cli_test',
      source_authority_runtime_host: 'local',
      source_authority_epoch: 3,
      target_authority_runtime_host: 'cloudflare-host',
      target_authority_epoch: 4,
      recommended_next_action: 'run_feasibility_checks_before_execute',
    });
    const body = result.result as { transition_record_candidate: Record<string, unknown>; warnings: Array<Record<string, unknown>> };
    expect(body.transition_record_candidate).toMatchObject({
      schema: 'narada.nars.authority_runtime_host_transition.v1',
      state: 'proposed',
      source_authority_runtime: { host_kind: 'local', authority_epoch: 3 },
      target_authority_runtime: { host_kind: 'cloudflare-host', authority_epoch: 4 },
      handoff: {
        event_log: { source_last_sequence: 120, target_first_sequence: 121 },
        mcp_fabric: { status: 'compatible' },
      },
      fencing: {
        source_write_admission: 'active',
        target_write_admission: 'not_before_source_seal',
      },
    });
    expect(body.warnings[0]).toMatchObject({ code: 'read_only_planner_slice' });
  });

  it('refuses authority transition planning when required feasibility checks fail', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_matrix_refusal');
    const recordPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_matrix_refusal' }).narsSessionIndexRecordPath!;
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    record.authority_transition_feasibility.active_turn = { status: 'active', active: true };
    record.authority_transition_feasibility.mcp_fabric = { mode: 'compatibility_report_required', status: 'incompatible' };
    record.authority_transition_feasibility.artifacts = { mode: 'registry_plus_admitted_content', source_paths_exposed: true };
    record.authority_transition_feasibility.target_descriptor = { authority_role: 'projection_store' };
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

    const result = await narsAuthorityTransitionPlanCommand({
      siteRoot,
      session: 'carrier_matrix_refusal',
      targetHost: 'cloudflare-host',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const body = result.result as { refusals: Array<Record<string, unknown>>; checks: Array<Record<string, unknown>> };
    expect(body.refusals.map((entry) => entry.reason_code)).toEqual(expect.arrayContaining([
      'active_turn_in_progress',
      'mcp_fabric_incompatible',
      'artifact_handoff_policy_refused',
      'projection_cache_is_not_authority',
    ]));
    expect(body.checks.find((entry) => entry.name === 'active_turn')).toMatchObject({ status: 'refused' });
  });

  it.each([
    ['active_turn', 'active_turn_in_progress', (record: Record<string, any>) => { record.authority_transition_feasibility.active_turn = { status: 'active', active: true }; }],
    ['operator_input_queue', 'queue_not_drainable', (record: Record<string, any>) => { record.authority_transition_feasibility.operator_input_queue = { mode: 'drain_before_seal', pending_count_at_request: 1, pending_count_at_seal: 1 }; }],
    ['event_cursor', 'event_cursor_unavailable', (record: Record<string, any>) => { delete record.authority_transition_feasibility.event_cursor.last_sequence; }],
    ['target_health', 'target_health_unavailable', (record: Record<string, any>) => { record.authority_transition_feasibility.target_health_by_host['cloudflare-host'] = { status: 'unavailable' }; }],
    ['source_seal', 'source_seal_unavailable', (record: Record<string, any>) => { record.authority_transition_feasibility.source_seal = { status: 'unavailable', available: false }; }],
    ['mcp_fabric', 'mcp_fabric_incompatible', (record: Record<string, any>) => { record.authority_transition_feasibility.mcp_fabric = { mode: 'compatibility_report_required', status: 'incompatible' }; }],
    ['artifacts', 'artifact_handoff_policy_refused', (record: Record<string, any>) => { record.authority_transition_feasibility.artifacts = { mode: 'registry_plus_admitted_content', source_paths_exposed: true }; }],
    ['credentials', 'transition_credentials_unavailable', (record: Record<string, any>) => { record.authority_transition_feasibility.credentials = { status: 'missing', refs_only: true }; }],
    ['projection_authority_guard', 'projection_cache_is_not_authority', (record: Record<string, any>) => { record.authority_transition_feasibility.target_descriptor = { authority_role: 'projection_store' }; }],
  ])('refuses authority transition planning for %s violation', async (checkName, refusalCode, mutate) => {
    const siteRoot = tempSite();
    writeSession(siteRoot, `carrier_${String(checkName)}`);
    const recordPath = resolveNaradaSitePaths({ siteRoot, sessionId: `carrier_${String(checkName)}` }).narsSessionIndexRecordPath!;
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    mutate(record);
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

    const result = await narsAuthorityTransitionPlanCommand({
      siteRoot,
      session: `carrier_${String(checkName)}`,
      targetHost: 'cloudflare-host',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const body = result.result as { refusals: Array<Record<string, unknown>>; checks: Array<Record<string, unknown>> };
    expect(body.refusals.map((entry) => entry.reason_code)).toContain(refusalCode);
    expect(body.checks.find((entry) => entry.name === checkName)).toMatchObject({ status: 'refused' });
    expect(body.transition_record_candidate).toBeNull();
  });

  it('refuses authority transition planning for stale session discovery', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_stale_discovery');
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_stale_discovery' }).narsSessionDir!;
    writeFileSync(join(sessionDir, 'heartbeat.json'), `${JSON.stringify({ timestamp: '2026-06-23T00:00:00.000Z' })}\n`, 'utf8');

    const result = await narsAuthorityTransitionPlanCommand({
      siteRoot,
      session: 'carrier_stale_discovery',
      targetHost: 'cloudflare-host',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    const body = result.result as { refusals: Array<Record<string, unknown>>; checks: Array<Record<string, unknown>> };
    expect(body.refusals.map((entry) => entry.reason_code)).toContain('session_discovery_stale');
    expect(body.checks.find((entry) => entry.name === 'stale_discovery')).toMatchObject({ status: 'refused' });
    expect(body.transition_record_candidate).toBeNull();
  });

  it('refuses authority transition planning for legacy sessions without comparable authority epoch', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_legacy_transition');
    const recordPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_legacy_transition' }).narsSessionIndexRecordPath!;
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    delete record.authority_runtime_host;
    delete record.authority_epoch;
    delete record.authority_runtime_id;
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

    const result = await narsAuthorityTransitionPlanCommand({
      siteRoot,
      session: 'carrier_legacy_transition',
      targetHost: 'cloudflare-host',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'refused',
      source_authority_runtime_host: 'unknown_authority_metadata',
      source_authority_epoch: null,
      transition_record_candidate: null,
      recommended_next_action: 'repair_refusals_and_rerun_plan',
    });
    const body = result.result as { refusals: Array<Record<string, unknown>> };
    expect(body.refusals.map((entry) => entry.reason_code)).toContain('authority_host_unknown_legacy');
    expect(body.refusals.map((entry) => entry.reason_code)).toContain('authority_epoch_unavailable');
  });

  it('plans direct agent-web-ui attachment by discovering a live agent session', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      agent: 'sonar.resident',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_plan.v1',
      status: 'planned',
      session_id: 'carrier_cli_test',
      site_id: 'sonar',
      event_endpoint: 'ws://127.0.0.1:12345/events',
      operator_projection_open_request: {
        schema: 'narada.operator_projection_open_request.v1',
        status: 'planned',
        projection_kind: 'browser_url',
        target_ref: null,
        purpose: 'agent_web_ui_attach',
        target_ref_resolution: 'agent-web-ui attach resolves local URL after server start',
      },
    });
  });

  it('refuses direct agent-web-ui attachment to a superseded source with reattach metadata', async () => {
    const siteRoot = tempSite();
    writeSupersededSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      session: 'carrier_source_test',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_refusal.v1',
      status: 'refused',
      reason: 'source_authority_superseded',
      session_id: 'carrier_source_test',
      authority_transition: {
        authority_runtime_host: 'local',
        authority_epoch: 3,
        authority_transition_state: 'target_active',
        source_write_admission: 'sealed',
        stale_source: true,
        input_policy: 'disabled_source_sealed',
        reattach: {
          target_session_id: 'carrier_target_test',
          target_locator_ref: 'authority-locator:target',
        },
      },
    });
  });

  it('discovers the newest matching agent session for direct agent-web-ui attachment', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_old');
    retimeSession(siteRoot, 'carrier_old', '2026-06-23T00:00:00.000Z');
    writeSession(siteRoot, 'carrier_new');
    retimeSession(siteRoot, 'carrier_new', '2026-06-23T00:10:00.000Z');
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      agent: 'sonar.resident',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      session_id: 'carrier_new',
    });
  });

  it('plans direct agent-web-ui attachment for a role alias inside an explicit Site root', async () => {
    const workspaceRoot = tempSite();
    const siteRoot = join(workspaceRoot, '.narada');
    mkdirSync(siteRoot, { recursive: true });
    writeSession(siteRoot, 'carrier_staccato', { agentId: 'narada-staccato.resident', siteId: 'staccato' });

    const result = await agentWebUiAttachCommand({
      siteRoot,
      agent: 'resident',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_plan.v1',
      status: 'planned',
      session_id: 'carrier_staccato',
      site_id: null,
      event_endpoint: 'ws://127.0.0.1:12345/events',
    });
  });

  it('refuses role-alias agent-web-ui discovery when multiple identities match', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_a', { agentId: 'narada-alpha.resident', siteId: 'alpha' });
    writeSession(siteRoot, 'carrier_b', { agentId: 'narada-beta.resident', siteId: 'beta' });

    const result = await agentWebUiAttachCommand({
      siteRoot,
      agent: 'resident',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_refusal.v1',
      reason: 'nars_session_ambiguous_for_agent',
      agent_id: 'resident',
    });
    const body = result.result as { candidates: Array<Record<string, unknown>> };
    expect(body.candidates.map((candidate) => candidate.session_id)).toEqual(expect.arrayContaining(['carrier_a', 'carrier_b']));
  });

  it('returns candidate sessions when agent-web-ui discovery finds the Site but not the requested agent', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_architect', { agentId: 'sonar.architect', siteId: 'sonar' });

    const result = await agentWebUiAttachCommand({
      siteRoot,
      agent: 'sonar.resident',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_refusal.v1',
      reason: 'nars_session_not_found_for_agent',
      agent_id: 'sonar.resident',
      candidates: [expect.objectContaining({ session_id: 'carrier_architect', agent_id: 'sonar.architect' })],
    });
  });

  it('ignores stale matching sessions during direct agent-web-ui discovery', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_fresh');
    retimeSession(siteRoot, 'carrier_fresh', '2026-06-23T00:00:00.000Z');
    writeSession(siteRoot, 'carrier_stale_newer');
    retimeSession(siteRoot, 'carrier_stale_newer', '2026-06-23T00:10:00.000Z');
    rmSync(resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_stale_newer' }).narsHeartbeatPath!, { force: true });
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      agent: 'sonar.resident',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      session_id: 'carrier_fresh',
    });
  });

  it('returns a clean refusal when no direct agent-web-ui session appears', async () => {
    const siteRoot = tempSite();
    const launchRegistryPath = writeLaunchRegistry(siteRoot);
    const progress: string[] = [];

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      agent: 'sonar.resident',
      waitForSessionMs: 1,
    }, createMockContext(), {
      progress: (line) => progress.push(line),
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(progress).toContain('agent-web-ui: waiting up to 1s for a healthy NARS session for sonar.resident');
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_refusal.v1',
      status: 'refused',
      reason: 'nars_session_not_found_for_agent',
      agent_id: 'sonar.resident',
      wait_ms: 1,
    });
  });

  it('waits for health availability before starting agent-web-ui attachment', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);
    let probes = 0;
    const progress: string[] = [];
    const openedUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      probes += 1;
      if (probes === 1) throw new Error('not listening yet');
      return { ok: true };
    }));

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      agent: 'sonar.resident',
      waitForSessionMs: 2000,
      open: true,
    }, createMockContext(), {
      progress: (line) => progress.push(line),
      startAgentWebUiServer: async () => ({ url: 'http://127.0.0.1:4444' }),
      openUrl: async (url) => { openedUrls.push(url); },
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(probes).toBe(2);
    expect(progress).toContain('agent-web-ui: waiting up to 2s for a healthy NARS session for sonar.resident');
    expect(progress).toContain('agent-web-ui: found NARS session carrier_cli_test');
    expect(progress).toContain('agent-web-ui: resolving attach endpoints for carrier_cli_test');
    expect(progress).toContain('agent-web-ui: starting local web UI for carrier_cli_test');
    expect(progress).toContain('agent-web-ui: opening browser http://127.0.0.1:4444');
    expect(openedUrls).toEqual(['http://127.0.0.1:4444']);
    expect(result.result).toMatchObject({
      status: 'started',
      session_id: 'carrier_cli_test',
      url: 'http://127.0.0.1:4444',
    });
    expect((result.result as { _formatted?: string })._formatted).toContain('agent-web-ui: http://127.0.0.1:4444');
    vi.unstubAllGlobals();
  });

  it('opens the browser by default after starting agent-web-ui attachment', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);
    const openedUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      session: 'carrier_cli_test',
    }, createMockContext(), {
      startAgentWebUiServer: async () => ({ url: 'http://127.0.0.1:4545' }),
      openUrl: async (url) => { openedUrls.push(url); },
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(openedUrls).toEqual(['http://127.0.0.1:4545']);
    vi.unstubAllGlobals();
  });

  it('resolves --site through the registered Site inventory', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const emptyRegistry = join(siteRoot, 'empty-agents.psd1');
    writeFileSync(emptyRegistry, '@{ Agents = @() }\n', 'utf8');
    registrySites.push({ siteId: 'sonar', siteRoot });

    const result = await narsSessionsCommand({ site: 'sonar', health: false, format: 'json', launchRegistryPath: emptyRegistry }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { site_root: string; site_root_source: string; site_id: string; sessions: Array<Record<string, unknown>> };
    expect(body.site_root).toBe(siteRoot);
    expect(body.site_root_source).toBe('site_registry');
    expect(body.site_id).toBe('sonar');
    expect(body.sessions).toHaveLength(1);
  });

  it('discovers sessions across known Sites when no Site selector is supplied', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await narsSessionsCommand({ health: false, format: 'json', launchRegistryPath }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { discovery_scope: string; site_count: number; sessions: Array<Record<string, unknown>> };
    expect(body.discovery_scope).toBe('known_sites');
    expect(body.site_count).toBe(1);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      session_id: 'carrier_cli_test',
      site_root: siteRoot,
      site_root_source: 'user_site_launch_registry',
    });
  });

  it('resolves --site through the User Site launch registry before the Site inventory', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);
    registrySites.push({ siteId: 'sonar', siteRoot: 'D:/wrong-site' });

    const result = await narsSessionsCommand({ site: 'sonar', health: false, format: 'json', launchRegistryPath }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { site_root: string; site_root_source: string; site_id: string; sessions: Array<Record<string, unknown>> };
    expect(body.site_root).toBe(siteRoot);
    expect(body.site_root_source).toBe('user_site_launch_registry');
    expect(body.site_id).toBe('sonar');
    expect(body.sessions).toHaveLength(1);
  });

  it('infers friendly Site ids from launch records without explicit Site', async () => {
    const parent = tempSite();
    const siteRoot = join(parent, 'narada.staccato');
    mkdirSync(siteRoot, { recursive: true });
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistryWithoutExplicitSite(parent, siteRoot);

    const result = await narsSessionsCommand({ site: 'staccato', health: false, format: 'json', launchRegistryPath }, createMockContext());
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const body = result.result as { site_root: string; site_root_source: string; site_id: string; sessions: Array<Record<string, unknown>> };
    expect(body.site_root).toBe(siteRoot);
    expect(body.site_root_source).toBe('user_site_launch_registry');
    expect(body.site_id).toBe('staccato');
    expect(body.sessions).toHaveLength(1);
  });

  it('refuses unknown registered Site ids', async () => {
    const siteRoot = tempSite();
    const emptyRegistry = join(siteRoot, 'empty-agents.psd1');
    writeFileSync(emptyRegistry, '@{ Agents = @() }\n', 'utf8');
    await expect(narsSessionsCommand({ site: 'missing', health: false, format: 'json', launchRegistryPath: emptyRegistry }, createMockContext()))
      .rejects.toThrow('site_not_found: missing');
  });

  it('resolves a projection attach command for a session', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);

    const result = await narsAttachCommandCommand({
      siteRoot,
      session: 'carrier_cli_test',
      surface: 'agent-web-ui',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { command: string }).command).toBe('narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health');
  });

  it('resolves recorded attach commands for non-web surfaces', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);

    const result = await narsAttachCommandCommand({
      siteRoot,
      session: 'carrier_cli_test',
      surface: 'agent-cli',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { command: string }).command).toBe('narada-agent-cli --identity sonar.resident --session carrier_cli_test --attach');
  });

  it('resolves attach commands across known Sites when no Site selector is supplied', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await narsAttachCommandCommand({
      launchRegistryPath,
      session: 'carrier_cli_test',
      surface: 'agent-web-ui',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect((result.result as { site_root: string; site_root_source: string; command: string }).site_root).toBe(siteRoot);
    expect((result.result as { site_root: string; site_root_source: string; command: string }).site_root_source).toBe('user_site_launch_registry');
    expect((result.result as { command: string }).command).toBe('narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health');
  });

  it('plans direct agent-web-ui attachment from NARS discovery', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      session: 'carrier_cli_test',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_plan.v1',
      status: 'planned',
      session_id: 'carrier_cli_test',
      site_id: 'sonar',
      event_endpoint: 'ws://127.0.0.1:12345/events',
      health_endpoint: 'http://127.0.0.1:12346/health',
      command: 'narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health',
    });
  });

  it('refuses live agent-web-ui attachment to a closed NARS session by default', async () => {
    const siteRoot = tempSite();
    writeClosedSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      session: 'carrier_closed_test',
      dryRun: false,
      format: 'json',
    }, createMockContext(), {
      startAgentWebUiServer: vi.fn(async () => ({ url: 'http://127.0.0.1:9999/' })),
    });

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      schema: 'narada.agent_web_ui.attach_refusal.v1',
      status: 'refused',
      reason: 'terminal_state_closed',
      session_id: 'carrier_closed_test',
      override: '--allow-stale-session',
    });
  });

  it('allows explicit stale agent-web-ui attachment override for diagnostics', async () => {
    const siteRoot = tempSite();
    writeClosedSession(siteRoot);
    const launchRegistryPath = writeLaunchRegistry(siteRoot);
    const startAgentWebUiServer = vi.fn(async () => ({ url: 'http://127.0.0.1:9999/' }));

    const result = await agentWebUiAttachCommand({
      launchRegistryPath,
      site: 'sonar',
      session: 'carrier_closed_test',
      allowStaleSession: true,
      format: 'json',
    }, createMockContext(), { startAgentWebUiServer, openUrl: vi.fn(async () => undefined) });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.result).toMatchObject({
      operator_projection_open_request: {
        schema: 'narada.operator_projection_open_request.v1',
        status: 'opened',
        projection_kind: 'browser_url',
        target_ref: 'http://127.0.0.1:9999/',
        purpose: 'agent_web_ui_attach',
      },
    });
    expect(startAgentWebUiServer).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 0,
      eventEndpoint: 'ws://127.0.0.1:12345/events',
      healthEndpoint: 'http://127.0.0.1:12346/health',
      sessionId: 'carrier_closed_test',
      siteRoot,
      siteId: 'sonar',
      agentId: 'sonar.resident',
      authorityTransition: expect.objectContaining({ authority_runtime_host: 'local', authority_epoch: 3, input_policy: 'enabled' }),
      cloudflareApiBaseUrl: null,
    });
  });
});
