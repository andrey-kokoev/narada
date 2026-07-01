import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentWebUiAttachCommand } from '../../src/commands/agent-web-ui.js';
import { narsAttachCommandCommand, narsSessionsCommand } from '../../src/commands/nars.js';
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

function writeSession(siteRoot: string, sessionId = 'carrier_cli_test'): void {
  const sessionDir = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'session-index-record.json'), `${JSON.stringify({
    schema: 'narada.nars.session_index_record.v1',
    session_id: sessionId,
    carrier_session_id: sessionId,
    derived_from_event: 'session_started',
    projection_generated_at: '2026-06-23T00:00:00.000Z',
    agent_id: 'sonar.resident',
    site_id: 'sonar',
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
    attached_projections: null,
    attached_projections_status: 'not_tracked',
    attach_commands: {
      agent_cli: 'narada-agent-cli --identity sonar.resident --session carrier_cli_test --attach',
      agent_web_ui: 'narada-agent-web-ui --event-endpoint ws://127.0.0.1:12345/events --health-endpoint http://127.0.0.1:12346/health',
    },
  }, null, 2)}\n`, 'utf8');
  writeFileSync(join(sessionDir, 'heartbeat.json'), `${JSON.stringify({ timestamp: new Date().toISOString() })}\n`, 'utf8');
}

function writeClosedSession(siteRoot: string, sessionId = 'carrier_closed_test'): void {
  writeSession(siteRoot, sessionId);
  const sessionDir = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId);
  const recordPath = join(sessionDir, 'session-index-record.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  record.terminal_state = 'closed';
  record.status_hint = 'closed';
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function retimeSession(siteRoot: string, sessionId: string, timestamp: string): void {
  const recordPath = join(siteRoot, '.narada', 'crew', 'nars-sessions', sessionId, 'session-index-record.json');
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
      agent_id: 'sonar.resident',
      display_state: 'starting_or_degraded',
    });
    expect(body.sessions[0].record).toBeUndefined();
    expect(body.sessions[0].heartbeat).toBeUndefined();
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

  it('ignores stale matching sessions during direct agent-web-ui discovery', async () => {
    const siteRoot = tempSite();
    writeSession(siteRoot, 'carrier_fresh');
    retimeSession(siteRoot, 'carrier_fresh', '2026-06-23T00:00:00.000Z');
    writeSession(siteRoot, 'carrier_stale_newer');
    retimeSession(siteRoot, 'carrier_stale_newer', '2026-06-23T00:10:00.000Z');
    rmSync(join(siteRoot, '.narada', 'crew', 'nars-sessions', 'carrier_stale_newer', 'heartbeat.json'), { force: true });
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
    expect(probes).toBe(3);
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
    }, createMockContext(), { startAgentWebUiServer });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(startAgentWebUiServer).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 0,
      eventEndpoint: 'ws://127.0.0.1:12345/events',
      healthEndpoint: 'http://127.0.0.1:12346/health',
      sessionId: 'carrier_closed_test',
      siteRoot,
      siteId: 'sonar',
      agentId: 'sonar.resident',
      cloudflareApiBaseUrl: null,
    });
  });
});
