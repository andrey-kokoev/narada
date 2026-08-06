import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
  type HostFleetRuntimeConfig,
} from '@narada-core/host-fleet-runtime/config';
import { HOST_FLEET_RUNTIME_HEALTH_SCHEMA } from '@narada-core/host-fleet-runtime/health';
import type {
  HostFleetServiceCommand,
  HostFleetServicePlan,
} from '@narada-core/host-fleet-runtime/service-plan';
import {
  hostFleetInstallCommand,
  hostFleetReloadCommand,
  hostFleetStatusCommand,
  hostFleetUninstallCommand,
} from '../../src/commands/host-fleet.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(mode: 'authority' | 'publisher' = 'authority'): Promise<{
  root: string;
  sourceConfig: string;
  config: HostFleetRuntimeConfig;
  plan: HostFleetServicePlan;
}> {
  const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-cli-'));
  roots.push(root);
  const secret = join(root, 'fleet.secret');
  const sourceConfig = join(root, 'source.json');
  await writeFile(secret, 'host-fleet-membership-secret-with-more-than-32-bytes', 'utf8');
  const config: HostFleetRuntimeConfig = {
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode,
    fleet_id: 'home',
    host_id: mode === 'authority' ? 'desktop' : 'zima',
    authority_host_id: 'desktop',
    ingress_url: mode === 'authority' ? null : 'https://fleet.example.test/api/fleet/observations',
    allow_insecure_ingress: false,
    local_health_url: null,
    listener: { host: '127.0.0.1', port: 61_732 },
    credentials: { active: { key_id: 'active', file: secret, accept_until: null }, previous: null },
    heartbeat: { interval_ms: 15_000, stale_after_ms: 45_000, max_clock_skew_ms: 60_000, max_body_bytes: 4_096 },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: mode === 'authority'
      ? [{ host_id: 'desktop', display_name: 'Desktop', platform: 'windows', operator_console_url: null, operator_console_health_url: null }]
      : [],
  };
  await writeFile(sourceConfig, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const plan: HostFleetServicePlan = {
    schema: 'narada.host_fleet.service_plan.v1',
    platform: 'linux',
    requires_elevation: true,
    config_path: join(root, 'machine', 'config.json'),
    state_path: join(root, 'machine', 'state.sqlite'),
    files: [{ path: join(root, 'machine', 'narada-host-fleet.service'), content: '[Service]\n', mode: 0o644 }],
    binary_copies: [],
    install_commands: [{ command: 'fleet-service', args: ['install'] }],
    restart_commands: [{ command: 'fleet-service', args: ['restart'] }],
    registration_status_commands: [{ command: 'fleet-service', args: ['registered'] }],
    status_commands: [{ command: 'fleet-service', args: ['status'] }],
    uninstall_commands: [{ command: 'fleet-service', args: ['uninstall'] }],
    uninstall_finalize_commands: [{ command: 'fleet-service', args: ['reconcile'] }],
  };
  return { root, sourceConfig, config, plan };
}

function outcome(status: number, stdout = ''): { status: number; stdout: string; stderr: string } {
  return { status, stdout, stderr: '' };
}

function cliSourceInvocation(entrypoint: string, args: string[]): string[] {
  return process.versions.bun
    ? [entrypoint, ...args]
    : ['--import', 'tsx', entrypoint, ...args];
}

describe('Host Fleet service lifecycle', () => {
  it('keeps missing-config CLI refusals bounded without eagerly loading SQLite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-host-fleet-cli-missing-'));
    roots.push(root);
    const missingConfig = join(root, 'missing.json');
    const cliEntrypoint = fileURLToPath(new URL('../../src/main.ts', import.meta.url));
    const result = spawnSync(process.execPath, [
      ...cliSourceInvocation(cliEntrypoint, []),
      'host-fleet',
      'plan',
      '--config',
      missingConfig,
      '--format',
      'json',
    ], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'error',
      command: 'host-fleet plan',
      error: 'host_fleet_runtime_config_unavailable',
      retryable: false,
    });
    expect(result.stderr).not.toContain('ExperimentalWarning');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(missingConfig);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(' at ');
  });

  it('installs validated machine config and starts an absent service idempotently', async () => {
    const { sourceConfig, plan } = await fixture();
    const calls: HostFleetServiceCommand[] = [];
    const result = await hostFleetInstallCommand(
      { config: sourceConfig },
      (command) => {
        calls.push(command);
        return outcome(command.args[0] === 'registered' ? 1 : 0);
      },
      { service_plan: plan },
    );
    expect(result.exitCode).toBe(0);
    expect(result.result.service_previously_installed).toBe(false);
    expect(calls.map((call) => call.args[0])).toEqual(['registered', 'install']);
    expect(JSON.parse(await readFile(plan.config_path, 'utf8')).fleet_id).toBe('home');
    expect(await readFile(plan.files[0]!.path, 'utf8')).toBe('[Service]\n');
  });

  it('restores the prior valid config when service activation fails', async () => {
    const { sourceConfig, config, plan } = await fixture();
    const prior = { ...config, roster: [{ ...config.roster[0]!, display_name: 'Prior desktop' }] };
    await mkdir(join(plan.config_path, '..'), { recursive: true });
    await writeFile(plan.config_path, `${JSON.stringify(prior, null, 2)}\n`, 'utf8');
    let restartCount = 0;
    await expect(hostFleetReloadCommand(
      { config: sourceConfig },
      (command) => command.args[0] === 'restart' && ++restartCount === 1 ? outcome(1) : outcome(0),
      { service_plan: plan },
    )).rejects.toThrow('host_fleet_reload_failed_config_restored');
    expect(JSON.parse(await readFile(plan.config_path, 'utf8')).roster[0].display_name).toBe('Prior desktop');
    expect(restartCount).toBe(2);
  });

  it('restores prior config when install updates an existing service and activation fails', async () => {
    const { sourceConfig, config, plan } = await fixture();
    const prior = { ...config, roster: [{ ...config.roster[0]!, display_name: 'Installed desktop' }] };
    await mkdir(join(plan.config_path, '..'), { recursive: true });
    await writeFile(plan.config_path, `${JSON.stringify(prior, null, 2)}\n`, 'utf8');
    let restartCount = 0;
    await expect(hostFleetInstallCommand(
      { config: sourceConfig },
      (command) => {
        if (command.args[0] === 'registered') return outcome(0);
        if (command.args[0] === 'restart') return outcome(++restartCount === 1 ? 1 : 0);
        return outcome(0);
      },
      { service_plan: plan },
    )).rejects.toThrow('host_fleet_install_failed_config_restored');
    expect(JSON.parse(await readFile(plan.config_path, 'utf8')).roster[0].display_name).toBe('Installed desktop');
    expect(restartCount).toBe(2);
  });

  it('treats uninstall of an absent service as an idempotent success', async () => {
    const { plan } = await fixture();
    const calls: HostFleetServiceCommand[] = [];
    const result = await hostFleetUninstallCommand(
      {},
      (command) => { calls.push(command); return outcome(command.args[0] === 'registered' ? 1 : 0); },
      { service_plan: plan },
    );
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([plan.registration_status_commands[0], plan.uninstall_finalize_commands[0]]);
  });

  it('uninstalls service artifacts while retaining machine config and state paths', async () => {
    const { config, plan } = await fixture();
    await mkdir(join(plan.config_path, '..'), { recursive: true });
    await writeFile(plan.config_path, JSON.stringify(config), 'utf8');
    await writeFile(plan.files[0]!.path, plan.files[0]!.content, 'utf8');
    const result = await hostFleetUninstallCommand({}, () => outcome(0), { service_plan: plan });
    expect(result.exitCode).toBe(0);
    await expect(access(plan.files[0]!.path)).rejects.toThrow();
    await expect(access(plan.config_path)).resolves.toBeUndefined();
    expect(result.result.retained_state_path).toBe(plan.state_path);
  });

  it('reports a healthy publisher without requiring an authority snapshot', async () => {
    const { sourceConfig, config, plan } = await fixture('publisher');
    plan.platform = 'windows';
    const server = createServer((_req, res) => {
      const payload = JSON.stringify({
        schema: HOST_FLEET_RUNTIME_HEALTH_SCHEMA,
        status: 'healthy',
        mode: 'publisher',
        fleet_id: config.fleet_id,
        host_id: config.host_id,
        authority_host_id: config.authority_host_id,
        checked_at: '2026-08-01T12:00:00.000Z',
        last_publish_attempt_at: '2026-08-01T12:00:00.000Z',
        last_publish_success_at: '2026-08-01T12:00:00.000Z',
        last_publish_failure_code: null,
      });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
      res.end(payload);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    config.listener.port = typeof address === 'object' && address ? address.port : 0;
    await writeFile(sourceConfig, JSON.stringify(config), 'utf8');
    try {
      const result = await hostFleetStatusCommand(
        { config: sourceConfig },
        () => outcome(0, 'STATE              : 4  RUNNING'),
        { service_plan: plan },
      );
      expect(result.exitCode).toBe(0);
      expect(result.result.status).toBe('healthy');
      expect(result.result.mode).toBe('publisher');
      expect(result.result.host_count).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
