import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  carrierControlPathCommand,
  carrierDrainCommand,
  carrierReloadCommand,
  carrierStartCommand,
  carrierReadinessCommand,
  carrierStatusCommand,
} from '../../src/commands/carrier.js';
import {
  siteLoopDrainCommand,
  siteLoopStatusCommand,
} from '../../src/commands/site-loop.js';
import {
  schedulerSiteDaemonInstallCommand,
  schedulerSiteDaemonStatusCommand,
} from '../../src/commands/scheduler.js';
import { classifyAgentStartLaunchBindingResult, classifyAgentStartLaunchBindingStatus, isAgentStartAcceptedStatus, runAgentStartCommand, shouldDetachAgentStartProcess } from '../../src/lib/launcher-runtime.js';
import { getSchedulerSiteDaemonStatus } from '../../src/lib/launcher-runtime-scheduler.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { registerOperatorSurfaceCommands } from '../../src/commands/operator-surface-register.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const naradaProperRoot = resolve(__dirname, '..', '..', '..', '..', '..');

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

async function tempSite(): Promise<string> {
  const dir = join(process.cwd(), '.ai', 'tmp-tests', `carrier-launcher-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

async function writeLaunchResult(siteRoot: string, name: string, identity: string): Promise<string> {
  const resultDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
  await mkdir(resultDir, { recursive: true });
  const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_test' });
  const controlPath = sitePaths.narsControlPath!;
  await mkdir(sitePaths.narsSessionDir!, { recursive: true });
  await writeFile(controlPath, '', 'utf8');
  const path = join(resultDir, `${name}.result.json`);
  await writeFile(path, `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    agent_start_event: name,
    identity,
    agent_identity_ref: identity === 'resident'
      ? {
        schema: 'narada.agent_identity_ref.v2',
        identity_scope: { kind: 'narada_site', site_id: 'sonar' },
        local_agent_id: 'resident',
        role: 'resident',
        canonical_agent_id: 'sonar.resident',
        display: 'sonar.resident',
        legacy_agent_id: 'resident',
      }
      : undefined,
    carrier_kind: 'agent-cli',
    runtime: 'narada-agent-runtime-server',
    runtime_substrate_kind: 'narada-agent-runtime-server',
    handoff: {
      session_ref: { id: 'carrier_test', kind: 'carrier' },
    },
    target_site_root: siteRoot,
    required_environment: {
      NARADA_SITE_ROOT: siteRoot,
      NARADA_CARRIER_SESSION_ID: 'carrier_test',
    },
    nars_launch: {
      session_id: 'carrier_test',
      runtime_session_id: 'carrier_test',
      nars_session_id: 'carrier_test',
      control_path: controlPath,
      session_path: sitePaths.narsSessionPath,
    },
    carrier_session: {
      carrier_session_id: 'carrier_test',
      record: {
        started_at: '2026-06-20T00:00:00.000Z',
        parent_process: {
          pid: process.pid,
        },
      },
    },
  })}\n`, 'utf8');
  return controlPath;
}

async function writeLaunchResultWithoutControlFile(siteRoot: string, name: string): Promise<void> {
  const resultDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
  await mkdir(resultDir, { recursive: true });
  const controlPath = resolveNaradaSitePaths({ siteRoot, sessionId: 'carrier_missing_control' }).narsControlPath!;
  await writeFile(join(resultDir, `${name}.result.json`), `${JSON.stringify({
    schema: 'narada.agent_start.result.v0',
    status: 'materialized',
    agent_start_event: name,
    handoff: {
      session_ref: { id: 'carrier_missing_control', kind: 'carrier' },
    },
    required_environment: {
      NARADA_AGENT_ID: 'sonar.resident',
      NARADA_CARRIER_SESSION_ID: 'carrier_missing_control',
    },
    carrier_session: {
      carrier_session_id: 'carrier_missing_control',
    },
    runtime_args: [
      'agent-cli',
      '--control-jsonl',
      controlPath,
    ],
  })}\n`, 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('carrier launcher CLI commands', () => {
  it('admits target site id on the canonical operator-surface runtime start command', () => {
    const program = new Command();
    registerOperatorSurfaceCommands(program);
    const operatorSurface = program.commands.find((command) => command.name() === 'operator-surface');
    const runtime = operatorSurface?.commands.find((command) => command.name() === 'runtime');
    const start = runtime?.commands.find((command) => command.name() === 'start');
    expect(start?.helpInformation()).toContain('--target-site-id <id>');
  });

  it('reads latest carrier launch result and control path evidence', async () => {
    const siteRoot = await tempSite();
    const controlPath = await writeLaunchResult(siteRoot, 'evt-test', 'sonar.resident');

    const status = await carrierStatusCommand({
      siteRoot,
      agent: 'sonar.resident',
      format: 'json',
    }, createMockContext());

    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    expect((status.result as { latest: { carrier_session_id: string } }).latest.carrier_session_id).toBe('carrier_test');
    expect((status.result as { mutation_performed: boolean }).mutation_performed).toBe(false);

    const control = await carrierControlPathCommand({
      siteRoot,
      agent: 'sonar.resident',
      format: 'json',
    }, createMockContext());

    expect(control.exitCode).toBe(ExitCode.SUCCESS);
    expect((control.result as { control_path: string }).control_path).toBe(controlPath);
  });

  it('reconciles an invalid historical artifact at the status boundary', async () => {
    const siteRoot = await tempSite();
    const resultDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
    const invalidPath = join(resultDir, 'evt-invalid.result.json');
    await mkdir(resultDir, { recursive: true });
    await writeFile(invalidPath, JSON.stringify({
      schema: 'narada.agent_start.result.v0',
      status: 'materialized',
      carrier_session: { carrier_session_id: 'legacy_status' },
    }), 'utf8');

    const status = await carrierStatusCommand({
      siteRoot,
      agent: 'sonar.resident',
      format: 'json',
    }, createMockContext());

    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    expect((status.result as { status: string }).status).toBe('not_found');
    await expect(readFile(invalidPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const receipt = JSON.parse(await readFile(
      join(resultDir, '..', 'agent-start-reconciliation', 'v1.json'),
      'utf8',
    )) as { status: string; deleted_artifacts: Array<{ path: string }> };
    expect(receipt.status).toBe('completed');
    expect(receipt.deleted_artifacts[0]?.path).toBe(invalidPath);
  });

  it('renders carrier status identity through agent identity ref when available', async () => {
    const siteRoot = await tempSite();
    await writeLaunchResult(siteRoot, 'evt-test', 'resident');

    const status = await carrierStatusCommand({
      siteRoot,
      agent: 'sonar.resident',
      format: 'text',
    }, createMockContext());

    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    expect((status.result as { _formatted: string })._formatted).toContain('identity: sonar.resident');
    expect((status.result as { _formatted: string })._formatted).not.toContain('identity: resident');
  });

  it('returns bounded readiness from live parent process evidence', async () => {
    const siteRoot = await tempSite();
    await writeLaunchResult(siteRoot, 'evt-ready', 'sonar.resident');

    const readiness = await carrierReadinessCommand({
      siteRoot,
      agent: 'sonar.resident',
      timeout: 0,
      format: 'json',
    }, createMockContext());

    expect(readiness.exitCode).toBe(ExitCode.SUCCESS);
    expect((readiness.result as { status: string }).status).toBe('ready');
    expect((readiness.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
  });

  it('does not report readiness when the launch result only records a missing control path', async () => {
    const siteRoot = await tempSite();
    await writeLaunchResultWithoutControlFile(siteRoot, 'evt-missing-control');

    const readiness = await carrierReadinessCommand({
      siteRoot,
      agent: 'sonar.resident',
      timeout: 0,
      format: 'json',
    }, createMockContext());

    expect(readiness.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((readiness.result as { status: string }).status).toBe('not_ready');
    expect((readiness.result as { checks: { control_path_exists: boolean } }).checks.control_path_exists).toBe(false);
  });

  it('plans scheduler install as explicit non-mutating elevation packet', async () => {
    const siteRoot = await tempSite();
    await mkdir(join(siteRoot, 'scripts'), { recursive: true });
    await writeFile(join(siteRoot, 'scripts', 'supervisor.ps1'), 'param()\n', 'utf8');
    await writeFile(join(siteRoot, 'scripts', 'Run-Hidden.vbs'), "' noop\n", 'utf8');

    const install = await schedulerSiteDaemonInstallCommand({
      siteRoot,
      taskName: 'Narada-Test-Daemon',
      hidden: true,
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(install.exitCode).toBe(ExitCode.SUCCESS);
    expect((install.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((install.result as { elevation_required: boolean }).elevation_required).toBe(true);
    expect((install.result as { elevation_packet: { task_name: string } }).elevation_packet.task_name).toBe('Narada-Test-Daemon');
  });

  it('uses packaged agent-start for carrier start without fake live mutation', async () => {
    const siteRoot = await tempSite();

    const start = await carrierStartCommand({
      siteRoot,
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      mcpScope: 'none',
      format: 'json',
    }, createMockContext());

    expect([ExitCode.SUCCESS, ExitCode.GENERAL_ERROR]).toContain(start.exitCode);
    expect((start.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect(['success', 'not_available']).toContain((start.result as { status: string }).status);
    expect((start.result as { agent_start: { command: string[] } }).agent_start.command).toContain('--operator-surface');
    expect((start.result as { agent_start: { command: string[] } }).agent_start.command).not.toContain('--carrier');

    const siteLoop = await siteLoopStatusCommand({
      siteRoot,
      format: 'json',
    }, createMockContext());

    expect(siteLoop.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((siteLoop.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((siteLoop.result as { site_command: { status: string } }).site_command.status).toBe('not_available');
  });

  it('starts a fresh operator-surface session by default even when an old matching session is live', async () => {
    const siteRoot = await tempSite();
    await writeLaunchResult(siteRoot, 'evt_old_live', 'sonar.resident');

    const start = await carrierStartCommand({
      siteRoot,
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect((start.result as { status: string }).status).not.toBe('already_running');
    expect((start.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((start.result as { agent_start?: { command?: string[] } }).agent_start?.command).toContain('--operator-surface');
  });

  it('can explicitly reuse an already-running operator-surface session for diagnostic attachment', async () => {
    const siteRoot = await tempSite();
    await writeLaunchResult(siteRoot, 'evt_old_live', 'sonar.resident');

    const start = await carrierStartCommand({
      siteRoot,
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      reuseExistingSession: true,
      format: 'json',
    }, createMockContext());

    expect(start.exitCode).toBe(ExitCode.SUCCESS);
    expect((start.result as { status: string }).status).toBe('already_running');
    expect((start.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
  });

  it('requires explicit agent identity for carrier start', async () => {
    const siteRoot = await tempSite();

    await expect(carrierStartCommand({
      siteRoot,
      carrier: 'agent-cli',
      dryRun: true,
      format: 'json',
    }, createMockContext())).rejects.toThrow(/agent_required/);
  });

  it('passes workspace root and intelligence provider through canonical agent-start', async () => {
    const workspaceRoot = naradaProperRoot;
    const siteRoot = await tempSite();
    const agentStartPath = join(workspaceRoot, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
    const previousNaradaProperRoot = process.env.NARADA_PROPER_ROOT;
    process.env.NARADA_PROPER_ROOT = naradaProperRoot;

    let start;
    try {
      start = await carrierStartCommand({
        siteRoot,
        targetSiteId: 'narada-proper',
        workspaceRoot,
        agent: 'narada.architect',
        carrier: 'agent-cli',
        intelligenceProvider: 'codex-subscription',
        mcpScope: 'none',
        dryRun: true,
        format: 'json',
      }, createMockContext());
    } finally {
      if (previousNaradaProperRoot === undefined) delete process.env.NARADA_PROPER_ROOT;
      else process.env.NARADA_PROPER_ROOT = previousNaradaProperRoot;
    }

    expect(start.exitCode, JSON.stringify(start.result)).toBe(ExitCode.SUCCESS);
    expect((start.result as { workspace_root: string }).workspace_root).toBe(workspaceRoot);
    expect((start.result as { intelligence_provider: string }).intelligence_provider).toBe('codex-subscription');
    expect((start.result as { operator_surface_kind: string }).operator_surface_kind).toBe('agent-cli');
    expect((start.result as { runtime_host_kind: string }).runtime_host_kind).toBe('narada-agent-runtime-server');
    expect((start.result as { target_site_id: string }).target_site_id).toBe('narada-proper');
    const agentStart = (start.result as { agent_start: { command: string[]; result_handoff: string; parsed_result: unknown } }).agent_start;
    expect(agentStart.command).toContain(agentStartPath);
    expect(agentStart.command).toContain('--operator-surface');
    expect(agentStart.command).not.toContain('--carrier');
    expect(agentStart.command).toContain('--json-output-file');
    expect(agentStart.command).toContain('--target-site-id');
    expect(agentStart.command).toContain('narada-proper');
    expect(agentStart.command).toContain('--intelligence-provider');
    expect(agentStart.command).toContain('codex-subscription');
    expect(agentStart.result_handoff).toBe('json_output_file');
  });

  it('keeps machine JSON off inherited interactive carrier launches', async () => {
    const siteRoot = await tempSite();
    const workspaceRoot = join(siteRoot, 'missing-narada-proper');

    const interactive = runAgentStartCommand({
      siteRoot,
      workspaceRoot,
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      exec: true,
      wait: true,
      launchSource: 'test',
    });

    expect(interactive.status).toBe('not_available');
    expect(interactive.command).toContain('--json-output-file');
    expect(interactive.command).toContain('--exec');
    expect(interactive.command).toContain('--wait');
    expect(interactive.command).not.toContain('--json');

    const captured = runAgentStartCommand({
      siteRoot,
      workspaceRoot,
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      runtime: 'narada-agent-runtime-server',
      launchSource: 'test',
    });

    expect(captured.status).toBe('not_available');
    expect(captured.command).toContain('--json-output-file');
    expect(captured.command).toContain('--json');
  });

  it('treats materialized NARS handoff as ready even when wrapper execution reports failure', () => {
    const status = classifyAgentStartLaunchBindingStatus('failed', {
      schema: 'narada.agent_start.result.v0',
      status: 'materialized',
      handoff: {
        session_ref: { id: 'carrier_materialized', kind: 'nars' },
      },
      nars_launch: {
        nars_session_id: 'carrier_materialized',
      },
    });

    expect(status).toEqual({ status: 'ready', reason: null });
  });

  it('does not make legacy agent-start results ready through the launch binding', () => {
    expect(classifyAgentStartLaunchBindingStatus('success', {
      schema: 'narada.agent_start.result.v0',
      status: 'success',
      nars_launch: { nars_session_id: 'carrier_legacy_status' },
    })).toEqual({ status: 'failed', reason: 'agent_start_result_contract_invalid' });
    expect(classifyAgentStartLaunchBindingStatus('success', {
      schema: 'narada.agent_start.result.v1',
      status: 'materialized',
      nars_launch: { nars_session_id: 'carrier_legacy_schema' },
    })).toEqual({ status: 'failed', reason: 'agent_start_result_contract_invalid' });
  });

  it('keeps a slow detached handoff pending instead of failing the projection binding', () => {
    expect(classifyAgentStartLaunchBindingStatus('starting', null)).toEqual({
      status: 'waiting_for_agent_start',
      reason: 'agent_start_handoff_pending',
    });
    expect(classifyAgentStartLaunchBindingResult('starting', null, 'agent_start_result_contract_invalid')).toEqual({
      status: 'waiting_for_agent_start',
      reason: 'agent_start_handoff_pending',
    });
    expect(isAgentStartAcceptedStatus('starting')).toBe(true);
    expect(isAgentStartAcceptedStatus('failed')).toBe(false);
  });

  it('detaches long-lived NARS operator-surface exec launches unless wait requests inherited control', () => {
    expect(shouldDetachAgentStartProcess({
      exec: true,
      carrier: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
    })).toBe(true);
    expect(shouldDetachAgentStartProcess({
      exec: true,
      carrier: 'future-nars-surface',
      runtime: 'narada-agent-runtime-server',
    })).toBe(true);
    expect(shouldDetachAgentStartProcess({
      exec: true,
      wait: true,
      carrier: 'agent-web-ui',
      runtime: 'narada-agent-runtime-server',
    })).toBe(false);
    expect(shouldDetachAgentStartProcess({
      exec: true,
      carrier: 'codex',
      runtime: 'codex',
    })).toBe(false);
  });

  it('routes non-agent-cli carrier requests through canonical agent-start instead of the Site hardcoded launcher', async () => {
    const siteRoot = resolve(process.cwd(), '..', '..', 'mcp-fabric', 'test', 'fixtures', 'site-valid');

    const start = await carrierStartCommand({
      siteRoot,
      agent: 'sonar.resident',
      carrier: 'codex',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect([ExitCode.SUCCESS, ExitCode.GENERAL_ERROR]).toContain(start.exitCode);
    expect((start.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((start.result as { runtime: string }).runtime).toBe('codex');
    expect((start.result as { agent_start: { command: string[] } }).agent_start.command).toContain('--runtime');
    expect((start.result as { agent_start: { command: string[] } }).agent_start.command).toContain('codex');
    expect((start.result as { site_command?: unknown }).site_command).toBeUndefined();
  });

  it('exposes carrier reload as a restart-backed lifecycle operation for agent-cli', async () => {
    const siteRoot = await tempSite();

    const reload = await carrierReloadCommand({
      siteRoot,
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      format: 'json',
    }, createMockContext());

    expect([ExitCode.GENERAL_ERROR, ExitCode.INVALID_CONFIG]).toContain(reload.exitCode);
    expect((reload.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((reload.result as { strategy: string }).strategy).toBe('restart');
    expect((reload.result as { restart: { status: string } }).restart.status).toBe('carrier_operation_unavailable');
  });

  it('reports drain as canonical lifecycle-unavailable evidence without Site CLI mediation', async () => {
    const siteRoot = await tempSite();

    const carrierDrain = await carrierDrainCommand({
      siteRoot,
      agent: 'sonar.resident',
      carrier: 'agent-cli',
      format: 'json',
    }, createMockContext());
    const loopDrain = await siteLoopDrainCommand({
      siteRoot,
      format: 'json',
    }, createMockContext());

    expect(carrierDrain.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect((carrierDrain.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect((carrierDrain.result as { status: string }).status).toBe('carrier_operation_unavailable');
    expect((carrierDrain.result as { site_command?: unknown }).site_command).toBeUndefined();
    expect(loopDrain.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect((loopDrain.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
  });

  it('reports scheduler status without mutating platform state', async () => {
    const siteRoot = await tempSite();
    const status = await schedulerSiteDaemonStatusCommand({
      siteRoot,
      taskName: 'Narada-Test-Daemon',
      format: 'json',
    }, createMockContext());

    expect(status.exitCode).toBe(ExitCode.SUCCESS);
    expect((status.result as { mutation_performed: boolean }).mutation_performed).toBe(false);
    expect(['unsupported', 'not_found', 'ok', 'access_denied']).toContain((status.result as { status: string }).status);
  });

  it('classifies scheduler access failures separately from missing scheduled tasks', async () => {
    const siteRoot = await tempSite();
    const status = getSchedulerSiteDaemonStatus({
      siteRoot,
      taskName: 'Narada-Test-Daemon',
    }, () => {
      throw new Error('Access denied');
    });

    expect(status.status).toBe('access_denied');
    expect(status.mutation_performed).toBe(false);
  });
});
