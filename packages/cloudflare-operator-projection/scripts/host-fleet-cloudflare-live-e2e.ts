#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  OPERATOR_CONSOLE_FLEET_API_PATH,
  OPERATOR_CONSOLE_FLEET_OBSERVATIONS_API_PATH,
} from '@narada-core/operator-console-contract';
import {
  HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
  validateHostFleetRuntimeConfig,
  type HostFleetRuntimeConfig,
} from '@narada-core/host-fleet-runtime/config';
import { validateRemoteCloudflareApiBaseUrl } from './lib/live-boundary.js';

type AnyRecord = Record<string, any>;

type LiveArgs = {
  live: boolean;
  help: boolean;
  cloudflareApiBaseUrl: string | null;
  membershipSecretFile: string | null;
  sshTarget: string | null;
  sshKey: string | null;
  remoteNodePath: string;
  remoteTempRoot: string;
  fleetId: string;
  hostId: string;
  authorityHostId: string;
  evidencePath: string | null;
  timeoutMs: number;
};

type ProcessResult = {
  status: number | null;
  timed_out: boolean;
  spawn_error: string | null;
  diagnostic_code: string | null;
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write([
    'Cloudflare Host Fleet live E2E',
    '',
    'Planning mode:',
    '  pnpm --filter @narada-core/cloudflare-operator-projection smoke:host-fleet-cloudflare-live',
    '',
    'Live mode from the authority host:',
    '  pnpm --filter @narada-core/cloudflare-operator-projection smoke:host-fleet-cloudflare-live --',
    '    --live --cloudflare-api-base-url https://<worker>',
    '    --membership-secret-file <authority-membership-secret>',
    '    --ssh-target <publisher-user>@<publisher-host>',
    '    --ssh-key <publisher-private-key>',
    '    --remote-node-path <publisher-node>',
    '',
    'The runner stages a unique temporary config, secret, and current publisher',
    'bundle, verifies the public Host Fleet read model',
    'shows a fresh heartbeat, and removes the remote staging directory.',
    '',
    'The membership secret is read only to stage the temporary remote credential.',
    'Its value, path, SSH output, and publisher output are never written to evidence.',
  ].join('\n') + '\n');
  process.exit(0);
}

const result = await run();
process.stdout.write(`[cloudflare:host-fleet-live] ${result.status}: ${result.code ?? 'checks_complete'}\n`);
if (result.evidence_path) process.stdout.write(`evidence: ${result.evidence_path}\n`);
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run(): Promise<AnyRecord> {
  const evidencePath = resolve(args.evidencePath ?? join(REPO_ROOT, '.narada', 'evidence', 'host-fleet-cloudflare-live-e2e.json'));
  if (!args.live) {
    return persist({
      schema: 'narada.host_fleet.cloudflare_live_e2e.v1',
      status: 'planned',
      code: 'live_flag_required',
      required: ['--live', '--cloudflare-api-base-url', '--membership-secret-file', '--ssh-target'],
      evidence_path: evidencePath,
    }, evidencePath);
  }

  const missing = [
    ['cloudflare-api-base-url', args.cloudflareApiBaseUrl],
    ['membership-secret-file', args.membershipSecretFile],
    ['ssh-target', args.sshTarget],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    return persist({
      schema: 'narada.host_fleet.cloudflare_live_e2e.v1',
      status: 'refused',
      code: 'missing_required_options',
      missing,
      evidence_path: evidencePath,
    }, evidencePath);
  }

  const boundary = validateRemoteCloudflareApiBaseUrl(args.cloudflareApiBaseUrl);
  if (!boundary.ok) {
    return persist({
      schema: 'narada.host_fleet.cloudflare_live_e2e.v1',
      status: 'refused',
      code: boundary.code,
      message: boundary.message,
      evidence_path: evidencePath,
    }, evidencePath);
  }

  let localTempRoot: string | null = null;
  let remoteTempRoot: string | null = null;
  let cleanup: AnyRecord = { status: 'not_attempted' };
  const checks: AnyRecord = {};
  const runId = `host-fleet-live-${Date.now()}-${randomBytes(6).toString('hex')}`;

  try {
    const secret = (await readFile(args.membershipSecretFile!, 'utf8')).trim();
    if (secret.length < 32) throw new Error('membership_secret_invalid');
    checks.secret = { status: 'loaded', length_class: secret.length <= 128 ? 'short' : 'long' };

    localTempRoot = await mkdtemp(join(tmpdir(), 'narada-host-fleet-cloudflare-live-'));
    const localSecretPath = join(localTempRoot, 'membership.secret');
    const localConfigPath = join(localTempRoot, 'config.json');
    const localBundlePath = join(dirname(fileURLToPath(import.meta.url)), 'host-fleet-publisher-bundle.mjs');
    await readFile(localBundlePath).catch(() => { throw new Error('publisher_bundle_missing'); });
    const remoteRoot = args.remoteTempRoot.replace(/\/+$/, '');
    if (!remoteRoot.startsWith('/')) throw new Error('remote_temp_root_must_be_absolute');
    remoteTempRoot = `${remoteRoot}/${runId}`;
    const remoteSecretPath = `${remoteTempRoot}/membership.secret`;
    const remoteConfigPath = `${remoteTempRoot}/config.json`;
    const remoteBundlePath = `${remoteTempRoot}/publisher.mjs`;
    const config = publisherConfig({
      ingressUrl: `${boundary.origin}${OPERATOR_CONSOLE_FLEET_OBSERVATIONS_API_PATH}`,
      secretPath: remoteSecretPath,
      keyId: `live-${randomBytes(8).toString('hex')}`,
    });
    await writeFile(localSecretPath, secret, { encoding: 'utf8', mode: 0o600 });
    await writeFile(localConfigPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

    const created = await remoteShell(`umask 077; mkdir -p ${shellQuote(remoteTempRoot)}`);
    checks.staging_steps = { mkdir: processSummary(created) };
    if (!successful(created)) throw new Error('remote_staging_directory_create_failed');
    const copiedSecret = await remoteCopy(localSecretPath, remoteSecretPath);
    checks.staging_steps.secret_copy = processSummary(copiedSecret);
    if (!successful(copiedSecret)) throw new Error('remote_secret_stage_failed');
    const copiedConfig = await remoteCopy(localConfigPath, remoteConfigPath);
    checks.staging_steps.config_copy = processSummary(copiedConfig);
    if (!successful(copiedConfig)) throw new Error('remote_config_stage_failed');
    const copiedBundle = await remoteCopy(localBundlePath, remoteBundlePath);
    checks.staging_steps.bundle_copy = processSummary(copiedBundle);
    if (!successful(copiedBundle)) throw new Error('remote_bundle_stage_failed');
    const permissions = await remoteShell(`chmod 600 ${shellQuote(remoteSecretPath)} ${shellQuote(remoteConfigPath)}; chmod 700 ${shellQuote(remoteBundlePath)}`);
    checks.staging_steps.permissions = processSummary(permissions);
    if (!successful(permissions)) throw new Error('remote_staging_permissions_failed');
    checks.staging = { status: 'completed', remote_files: 3 };

    const published = await remoteShell(remotePublishCommand(remoteConfigPath, remoteBundlePath), true);
    checks.publisher = {
      status: successful(published) ? 'published' : 'failed',
      exit_code: published.status,
      timed_out: published.timed_out,
      spawn_error: published.spawn_error,
      diagnostic_code: published.diagnostic_code,
    };

    checks.public_read = successful(published)
      ? await waitForFreshHost(boundary.origin, args.hostId, args.timeoutMs)
      : { status: 'skipped', reason: 'publisher_failed' };
  } catch (error) {
    checks.error = {
      code: error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : 'live_runner_failed',
    };
  } finally {
    if (remoteTempRoot) {
      const removed = await remoteShell(`rm -rf ${shellQuote(remoteTempRoot)}`);
      cleanup = {
        status: successful(removed) ? 'completed' : 'failed',
        ...processSummary(removed),
      };
    } else {
      cleanup = { status: 'not_created' };
    }
    if (localTempRoot) await rm(localTempRoot, { recursive: true, force: true });
  }

  const passed = checks.publisher?.status === 'published'
    && checks.public_read?.status === 'fresh'
    && cleanup.status === 'completed';
  return persist({
    schema: 'narada.host_fleet.cloudflare_live_e2e.v1',
    status: passed ? 'passed' : 'failed',
    code: passed ? 'host_fleet_cloudflare_path_verified' : 'host_fleet_cloudflare_path_failed',
    run_id: runId,
    deployment_boundary: boundary.deployment_boundary,
    cloudflare_origin: boundary.origin,
    fleet_id: args.fleetId,
    host_id: args.hostId,
    authority_host_id: args.authorityHostId,
    publisher_execution: 'remote_ssh_temporary_bundle',
    checks,
    cleanup,
    evidence_path: evidencePath,
  }, evidencePath);
}

function publisherConfig(input: { ingressUrl: string; secretPath: string; keyId: string }): HostFleetRuntimeConfig {
  // Validate the schema on the authority host, but preserve the publisher
  // host's POSIX credential path when serializing the cross-host config.
  const validated = validateHostFleetRuntimeConfig({
    schema: HOST_FLEET_RUNTIME_CONFIG_SCHEMA,
    mode: 'publisher',
    fleet_id: args.fleetId,
    host_id: args.hostId,
    authority_host_id: args.authorityHostId,
    ingress_url: input.ingressUrl,
    allow_insecure_ingress: false,
    local_health_url: null,
    listener: { host: '127.0.0.1', port: 65_535 },
    credentials: {
      active: { key_id: input.keyId, file: join(tmpdir(), 'narada-host-fleet-live-credential.secret'), accept_until: null },
      previous: null,
    },
    heartbeat: {
      interval_ms: 15_000,
      stale_after_ms: 45_000,
      max_clock_skew_ms: 60_000,
      max_body_bytes: 4_096,
    },
    probe: { interval_ms: 15_000, timeout_ms: 3_000 },
    roster: [],
  });
  return {
    ...validated,
    credentials: {
      ...validated.credentials,
      active: { ...validated.credentials.active, file: input.secretPath },
    },
  };
}

async function waitForFreshHost(origin: string, hostId: string, timeoutMs: number): Promise<AnyRecord> {
  const deadline = Date.now() + timeoutMs;
  let last: AnyRecord = { status: 'unavailable' };
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(`${origin}${OPERATOR_CONSOLE_FLEET_API_PATH}/hosts`, {
        signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000)),
      });
      const body = await response.json().catch(() => null) as AnyRecord | null;
      const hosts = Array.isArray(body?.snapshot?.hosts) ? body.snapshot.hosts : Array.isArray(body?.hosts) ? body.hosts : [];
      const host = hosts.find((entry: AnyRecord) => entry?.identity?.host_id === hostId) as AnyRecord | undefined;
      const freshness = host?.reachability?.publisher_freshness ?? null;
      last = {
        status: response.status === 200 && freshness === 'fresh' ? 'fresh' : 'waiting',
        http_status: response.status,
        runtime_status: body?.runtime?.status ?? null,
        host_present: Boolean(host),
        publisher_freshness: freshness,
        host_health_status: host?.health?.status ?? null,
      };
      if (last.status === 'fresh') return last;
    } catch {
      last = { status: 'unavailable' };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last;
}

async function remoteCopy(localPath: string, remotePath: string): Promise<ProcessResult> {
  return runProcess('scp', [...sshOptions(), '-q', localPath, `${args.sshTarget!}:${remotePath}`]);
}

async function remoteShell(command: string, captureDiagnostic = false): Promise<ProcessResult> {
  // OpenSSH joins all arguments after the target into one remote command. Keep
  // the shell program as one quoted argument so its own arguments survive.
  return runProcess('ssh', [...sshOptions(), args.sshTarget!, `sh -lc ${shellQuote(command)}`], captureDiagnostic);
}

function remotePublishCommand(remoteConfigPath: string, remoteBundlePath: string): string {
  return `${shellQuote(args.remoteNodePath)} ${shellQuote(remoteBundlePath)} ${shellQuote(remoteConfigPath)}`;
}

function sshOptions(): string[] {
  return [
    ...(args.sshKey ? ['-i', args.sshKey] : []),
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=15',
  ];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function successful(result: ProcessResult): boolean {
  return result.status === 0 && !result.timed_out && result.spawn_error === null;
}

function processSummary(result: ProcessResult): AnyRecord {
  return {
    exit_code: result.status,
    timed_out: result.timed_out,
    spawn_error: result.spawn_error,
    diagnostic_code: result.diagnostic_code,
  };
}

function runProcess(command: string, commandArgs: string[], captureDiagnostic = false): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: captureDiagnostic ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      windowsHide: true,
    });
    let diagnosticOutput = '';
    const collectDiagnostic = (chunk: Buffer | string): void => {
      if (diagnosticOutput.length < 4096) diagnosticOutput += chunk.toString().slice(0, 4096 - diagnosticOutput.length);
    };
    if (captureDiagnostic) {
      child.stdout?.on('data', collectDiagnostic);
      child.stderr?.on('data', collectDiagnostic);
    }
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      resolve({ status: null, timed_out: true, spawn_error: null, diagnostic_code: extractDiagnosticCode(diagnosticOutput) });
    }, args.timeoutMs);
    child.once('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        status: null,
        timed_out: false,
        spawn_error: error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'spawn_error',
        diagnostic_code: extractDiagnosticCode(diagnosticOutput),
      });
    });
    child.once('exit', (status) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ status, timed_out: false, spawn_error: null, diagnostic_code: extractDiagnosticCode(diagnosticOutput) });
    });
  });
}

function extractDiagnosticCode(output: string): string | null {
  const match = output.match(/\b(?:host_fleet|publisher|membership)_[a-z0-9_]+/)?.[0];
  return match?.replace(/_+$/, '') ?? null;
}

async function persist(result: AnyRecord, evidencePath: string): Promise<AnyRecord> {
  return writeEvidence({ ...result, evidence_path: evidencePath }, evidencePath);
}

async function writeEvidence(result: AnyRecord, evidencePath: string): Promise<AnyRecord> {
  const evidence = { ...result, observed_at: new Date().toISOString() };
  return mkdir(dirname(evidencePath), { recursive: true })
    .then(() => writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }))
    .then(() => evidence)
    .catch(() => ({ ...evidence, evidence_write_status: 'failed' }));
}

function parseArgs(values: string[]): LiveArgs {
  const parsed: LiveArgs = {
    live: false,
    help: false,
    cloudflareApiBaseUrl: null,
    membershipSecretFile: null,
    sshTarget: null,
    sshKey: null,
    remoteNodePath: 'node',
    remoteTempRoot: '/tmp',
    fleetId: 'desktop-fleet',
    hostId: 'zima',
    authorityHostId: 'desktop',
    evidencePath: null,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--') continue;
    if (value === '--live') parsed.live = true;
    else if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--cloudflare-api-base-url') parsed.cloudflareApiBaseUrl = values[++index] ?? null;
    else if (value === '--membership-secret-file') parsed.membershipSecretFile = values[++index] ?? null;
    else if (value === '--ssh-target') parsed.sshTarget = values[++index] ?? null;
    else if (value === '--ssh-key') parsed.sshKey = values[++index] ?? null;
    else if (value === '--remote-node-path') parsed.remoteNodePath = values[++index] ?? parsed.remoteNodePath;
    else if (value === '--remote-temp-root') parsed.remoteTempRoot = values[++index] ?? parsed.remoteTempRoot;
    else if (value === '--fleet-id') parsed.fleetId = values[++index] ?? parsed.fleetId;
    else if (value === '--host-id') parsed.hostId = values[++index] ?? parsed.hostId;
    else if (value === '--authority-host-id') parsed.authorityHostId = values[++index] ?? parsed.authorityHostId;
    else if (value === '--evidence-path') parsed.evidencePath = values[++index] ?? null;
    else if (value === '--timeout-ms') parsed.timeoutMs = Number(values[++index] ?? parsed.timeoutMs);
    else throw new Error(`unknown_option:${value}`);
  }
  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 1_000 || parsed.timeoutMs > 300_000) {
    throw new Error('timeout_ms_invalid');
  }
  return parsed;
}
