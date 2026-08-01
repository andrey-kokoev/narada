#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findHeadlessBrowser,
  openCdpPage,
  waitForPageText,
} from './lib/browser-smoke.js';
import { validateRemoteCloudflareApiBaseUrl } from './lib/live-boundary.js';

type AnyRecord = Record<string, any>;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

type LiveArgs = {
  live: boolean;
  quiet: boolean;
  help: boolean;
  url: string | null;
  accessClientId: string | null;
  accessClientSecretStdin: boolean;
  accessCookieStdin: boolean;
  evidencePath: string | null;
  timeoutMs: number;
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write([
    'Cloudflare Host Fleet read-only live browser smoke',
    '',
    'Planning mode (default):',
    '  pnpm --filter @narada2/cloudflare-nars-projection smoke:host-fleet-live',
    '',
    'Live mode with a Cloudflare Access service token:',
    '  Get-Secret -Name <temporary-access-secret> -AsPlainText | pnpm --filter @narada2/cloudflare-nars-projection smoke:host-fleet-live -- --live --url <worker-url> --access-client-id <id> --access-client-secret-stdin',
    '',
    'Live mode with an exported CF_Authorization cookie:',
    '  Get-Secret -Name <temporary-cookie> -AsPlainText | ... --live --url <worker-url> --access-cookie-stdin',
    '',
    'The lane is read-only: it performs inventory, health, session, target,',
    'page-render, and replay-subscription checks. It never submits operator input,',
    'changes host enrollment, or deploys a Worker.',
    '',
    'Credential values are accepted only from stdin and are never written to evidence or output.',
  ].join('\n') + '\n');
  process.exit(0);
}

const result = await run();
if (args.quiet) {
  process.stdout.write(JSON.stringify({
    status: result.status,
    code: result.code ?? null,
    evidence_path: result.evidence_path ?? null,
  }) + '\n');
} else {
  process.stdout.write('[cloudflare:host-fleet-live] ' + result.status + ': ' + (result.code ?? 'checks_complete') + '\n');
  if (result.evidence_path) process.stdout.write('evidence: ' + result.evidence_path + '\n');
}
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run(): Promise<AnyRecord> {
  const evidencePath = args.evidencePath
    ? resolve(args.evidencePath)
    : resolve(REPO_ROOT, '.narada/evidence/cloudflare-host-fleet-live-e2e.json');
  if (!args.live) {
    return persist({
      schema: 'narada.cloudflare.host_fleet.live_e2e.v1',
      status: 'planned',
      code: 'live_flag_required',
      required: ['--live', '--url', 'one Access credential mode'],
      credential_modes: ['service_token', 'cf_authorization_cookie'],
      mutating_actions: [],
    }, evidencePath);
  }

  const boundary = validateRemoteCloudflareApiBaseUrl(args.url);
  if (!boundary.ok) return persistRefusal(boundary.code, evidencePath);

  let headers: Record<string, string>;
  try {
    headers = await readAccessHeaders(args);
  } catch (error) {
    return persistRefusal(error instanceof Error ? error.message : String(error), evidencePath);
  }

  const evidence: AnyRecord = {
    schema: 'narada.cloudflare.host_fleet.live_e2e.v1',
    status: 'running',
    worker_url: boundary.origin,
    access_mode: headers['CF-Access-Client-Id'] ? 'service_token' : 'cf_authorization_cookie',
    mutating_actions: [],
    checks: {},
  };

  try {
    const unauthenticated = await request(boundary.origin, '/api/narada/fleet/hosts', {});
    assert.ok([302, 401, 403].includes(unauthenticated.response.status), compact(unauthenticated));
    evidence.checks.unauthenticated = { status: unauthenticated.response.status, passed: true };

    const overview = await requestJson(boundary.origin, '/api/narada/fleet/hosts', headers);
    assert.equal(overview.response.status, 200, compact(overview));
    assert.equal(overview.body?.schema, 'narada.cloudflare.host_fleet.overview.v1', compact(overview));
    assert.equal(overview.body?.status, 'success', compact(overview));
    assert.ok(Array.isArray(overview.body?.hosts), 'host fleet overview must contain hosts');
    const activeHosts = overview.body.hosts.filter((host: AnyRecord) => host?.lifecycle_state === 'active');
    assert.ok(activeHosts.length > 0, 'a live host fleet smoke requires at least one active host');
    evidence.checks.inventory = {
      status: overview.response.status,
      registry_revision: overview.body.registry_revision ?? null,
      host_count: overview.body.hosts.length,
      active_host_count: activeHosts.length,
      host_keys: activeHosts.map((host: AnyRecord) => `${host.host_id}@${host.host_instance_id}`),
      passed: true,
    };

    const preflightHost = activeHosts[0];
    const hostRevision = Number(preflightHost.revision);
    assert.ok(Number.isInteger(hostRevision) && hostRevision >= 1, 'a live host fleet smoke requires a host revision');
    const lifecyclePreflightQuery = new URLSearchParams({
      host_id: String(preflightHost.host_id),
      host_instance_id: String(preflightHost.host_instance_id),
      operation: 'revoke',
      expected_revision: String(hostRevision),
      request_id: 'cloudflare-host-fleet-live-preflight',
      confirmation: `${preflightHost.host_id}@${preflightHost.host_instance_id}`,
    });
    const lifecyclePreflight = await requestJson(
      boundary.origin,
      `/api/narada/fleet/hosts/lifecycle/preflight?${lifecyclePreflightQuery}`,
      headers,
    );
    assert.equal(lifecyclePreflight.response.status, 200, compact(lifecyclePreflight));
    assert.equal(lifecyclePreflight.body?.schema, 'narada.host_fleet.lifecycle_preflight.v1', compact(lifecyclePreflight));
    assert.equal(lifecyclePreflight.body?.status, 'ready', compact(lifecyclePreflight));
    assert.equal(lifecyclePreflight.body?.mutation_performed, false, compact(lifecyclePreflight));
    evidence.checks.lifecycle_preflight = {
      host_key: `${preflightHost.host_id}@${preflightHost.host_instance_id}`,
      operation: 'revoke',
      expected_revision: hostRevision,
      mutation_performed: false,
      passed: true,
    };

    const hostChecks: AnyRecord[] = [];
    const sessions: AnyRecord[] = [];
    for (const host of activeHosts) {
      const hostId = String(host.host_id);
      const hostInstanceId = String(host.host_instance_id);
      const prefix = `/api/narada/fleet/hosts/${encodeURIComponent(hostId)}/${encodeURIComponent(hostInstanceId)}`;
      const health = await requestJson(boundary.origin, `${prefix}/health`, headers);
      assert.equal(health.response.status, 200, compact(health));
      assert.equal(health.body?.schema, 'narada.host_fleet.gateway_health.v1', compact(health));
      assert.equal(health.body?.status, 'online', compact(health));
      const discovered = await requestJson(boundary.origin, `${prefix}/sessions`, headers);
      assert.equal(discovered.response.status, 200, compact(discovered));
      assert.equal(discovered.body?.schema, 'narada.cloudflare.host_fleet.sessions.v1', compact(discovered));
      assert.equal(discovered.body?.status, 'success', compact(discovered));
      assert.ok(Array.isArray(discovered.body?.sessions), compact(discovered));
      const activeSessions = discovered.body.sessions.filter((session: AnyRecord) => session?.state !== 'closed' && session?.health_status !== 'revoked');
      hostChecks.push({
        host_key: `${hostId}@${hostInstanceId}`,
        health_status: health.body.status,
        session_count: discovered.body.sessions.length,
        active_session_count: activeSessions.length,
      });
      for (const session of activeSessions) sessions.push({ host, session });
    }
    assert.ok(sessions.length > 0, 'a live host fleet browser smoke requires at least one active session');
    evidence.checks.hosts = { hosts: hostChecks, passed: true };

    const selected = sessions[0];
    const target = selected.session?.target as AnyRecord;
    assert.ok(target && typeof target.site_id === 'string' && typeof target.agent_id === 'string' && typeof target.runtime_session_id === 'string', 'session target must be qualified');
    const targetPrefix = `/api/narada/fleet/hosts/${encodeURIComponent(target.host_id)}/${encodeURIComponent(target.host_instance_id)}/target`;
    const targetQuery = new URLSearchParams({
      site_id: target.site_id,
      agent_id: target.agent_id,
      runtime_session_id: target.runtime_session_id,
    });
    const resolved = await requestJson(boundary.origin, `${targetPrefix}?${targetQuery}`, headers);
    assert.equal(resolved.response.status, 200, compact(resolved));
    assert.equal(resolved.body?.schema, 'narada.cloudflare.host_fleet.target.v1', compact(resolved));
    assert.equal(resolved.body?.status, 'resolved', compact(resolved));
    assert.deepEqual(resolved.body?.target, target, 'target resolution must preserve the qualified session target');
    evidence.checks.target = { target, passed: true };

    const browserPath = findHeadlessBrowser();
    assert.ok(browserPath, 'a supported headless browser is required for browser-level acceptance');
    const page = await openCdpPage({
      browserPath,
      url: boundary.origin + '/console/hosts',
      extraHeaders: headers,
      instrumentWebSocketClose: true,
      userDataPrefix: 'narada-host-fleet-live-',
    });
    try {
      const pageText = await waitForPageText(page, 'Host Fleet', args.timeoutMs);
      assert.equal(pageText.found, true, JSON.stringify(pageText));
      const registeredText = await waitForPageText(page, 'Registered', args.timeoutMs);
      assert.equal(registeredText.found, true, JSON.stringify(registeredText));
      const selectedHostKey = `${target.host_id}@${target.host_instance_id}`;
      const selectedHost = await page.evaluate(`(() => {
        const hostKey = ${JSON.stringify(selectedHostKey)};
        const row = [...document.querySelectorAll('tbody tr')].find((candidate) => candidate.textContent?.includes(hostKey));
        if (!row) return false;
        const button = [...row.querySelectorAll('button')].find((candidate) => ['Use host', 'Selected'].includes(candidate.textContent?.trim() ?? ''));
        if (!button) return false;
        if (button.textContent?.trim() === 'Use host') button.click();
        return true;
      })()`);
      assert.equal(selectedHost, true, 'Host Fleet page must expose the selected HostKey');
      const sessionText = await waitForPageText(page, target.runtime_session_id, args.timeoutMs);
      assert.equal(sessionText.found, true, JSON.stringify(sessionText));

      const eventPath = `/api/narada/fleet/hosts/${encodeURIComponent(target.host_id)}/${encodeURIComponent(target.host_instance_id)}/sessions/${encodeURIComponent(target.runtime_session_id)}/events?${new URLSearchParams({ site_id: target.site_id, agent_id: target.agent_id })}`;
      const eventEndpoint = new URL(eventPath, boundary.origin);
      eventEndpoint.protocol = 'wss:';
      const clicked = await page.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Attach'); if (!button) return false; button.click(); return true; })()`);
      assert.equal(clicked, true, 'Host Fleet page must expose an Attach action for the selected session');
      const replay = await page.waitForWebSocketFrame(
        (entry: AnyRecord) => String(entry.url ?? '') === eventEndpoint.toString()
          && String(entry.payload_data ?? '').includes('session_events_replay_completed'),
        args.timeoutMs,
      );
      assert.equal(replay.found, true, JSON.stringify({ replay, event_endpoint: eventEndpoint.toString() }));
      const sentFrames = page.webSocketFramesSent();
      const forbiddenInput = sentFrames.find((entry: AnyRecord) => {
        try {
          const payload = JSON.parse(String(entry.payload_data ?? ''));
          return payload?.method === 'conversation.send' || payload?.event === 'operator_input_submitted';
        } catch {
          return false;
        }
      });
      assert.equal(forbiddenInput, undefined, 'read-only smoke must not submit operator input');
      const state = await page.evaluate('({ href: location.href, title: document.title, bodyLength: document.body?.innerText?.length ?? 0 })');
      assert.ok(state.bodyLength > 100, JSON.stringify(state));
      assert.equal(page.runtimeDiagnostics().some((entry: AnyRecord) => entry.kind === 'exception'), false, JSON.stringify(page.runtimeDiagnostics()));
      evidence.checks.browser = {
        path: '/console/hosts',
        state,
        event_endpoint: eventEndpoint.toString(),
        replay_frame_observed: true,
        sent_frame_count: sentFrames.length,
        operator_input_submitted: false,
        websocket_records: (await page.webSocketInstrumentation()).slice(0, 8),
        runtime_diagnostics: page.runtimeDiagnostics().slice(0, 8),
        passed: true,
      };
    } finally {
      await page.close();
    }

    evidence.status = 'passed';
    return persist(evidence, evidencePath);
  } catch (error) {
    evidence.status = 'failed';
    evidence.code = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    return persist(evidence, evidencePath);
  }
}

async function request(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ response: Response; raw: string }> {
  const response = await fetch(new URL(path, baseUrl), {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  return { response, raw: (await response.text()).slice(0, 1_000_000) };
}

async function requestJson(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ response: Response; body: AnyRecord; raw: string }> {
  const result = await request(baseUrl, path, headers);
  let body: AnyRecord;
  try {
    body = JSON.parse(result.raw);
  } catch {
    body = { raw: result.raw.slice(0, 4000) };
  }
  return { ...result, body };
}

async function readAccessHeaders(input: LiveArgs): Promise<Record<string, string>> {
  if (input.accessClientId && input.accessCookieStdin) throw new Error('access_credential_modes_conflict');
  if (!input.accessClientId && input.accessClientSecretStdin) throw new Error('access_client_id_required_for_service_token');
  if (input.accessClientId) {
    if (!input.accessClientSecretStdin) throw new Error('access_client_secret_stdin_required');
    const secret = await readStdinSecret('access_client_secret');
    return {
      'CF-Access-Client-Id': input.accessClientId,
      'CF-Access-Client-Secret': secret,
    };
  }
  if (input.accessCookieStdin) {
    const value = await readStdinSecret('cf_authorization_cookie');
    return { Cookie: value.startsWith('CF_Authorization=') ? value : 'CF_Authorization=' + value };
  }
  throw new Error('access_service_token_or_cookie_stdin_required');
}

async function readStdinSecret(label: string): Promise<string> {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += String(chunk);
    if (raw.length > 16_384) throw new Error(`${label}_stdin_exceeds_limit`);
  }
  const value = raw.trim();
  if (!value) throw new Error(`${label}_stdin_empty`);
  return value;
}

function compact(value: AnyRecord): string {
  return JSON.stringify({
    status: value.response?.status,
    schema: value.body?.schema ?? null,
    semantic_status: value.body?.status ?? null,
    reason: value.body?.reason ?? null,
  });
}

function persist(value: AnyRecord, evidencePath: string): AnyRecord {
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify({ ...value, generated_at: new Date().toISOString() }, null, 2) + '\n', 'utf8');
  return { ...value, evidence_path: evidencePath };
}

function persistRefusal(code: string, evidencePath: string): AnyRecord {
  return persist({
    schema: 'narada.cloudflare.host_fleet.live_e2e.v1',
    status: 'refused',
    code,
  }, evidencePath);
}

function parseArgs(values: string[]): LiveArgs {
  const parsed: LiveArgs = {
    live: false,
    quiet: false,
    help: false,
    url: process.env.NARADA_HOST_FLEET_LIVE_E2E_URL ?? null,
    accessClientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID ?? null,
    accessClientSecretStdin: false,
    accessCookieStdin: false,
    evidencePath: process.env.NARADA_HOST_FLEET_LIVE_E2E_EVIDENCE_PATH ?? null,
    timeoutMs: 30_000,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--live') parsed.live = true;
    else if (value === '--quiet') parsed.quiet = true;
    else if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--url') parsed.url = values[++index] ?? null;
    else if (value === '--access-client-id') parsed.accessClientId = values[++index] ?? null;
    else if (value === '--access-client-secret-stdin') parsed.accessClientSecretStdin = true;
    else if (value === '--access-cookie-stdin') parsed.accessCookieStdin = true;
    else if (value === '--access-client-secret' || value === '--access-client-secret-file' || value === '--access-cookie-file') {
      index += 1;
      throw new Error(`${value.slice(2).replaceAll('-', '_')}_forbidden_use_stdin`);
    }
    else if (value === '--evidence-path') parsed.evidencePath = values[++index] ?? null;
    else if (value === '--timeout-ms') parsed.timeoutMs = Number(values[++index] ?? '30000');
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs < 1000) throw new Error('timeout_ms_invalid');
  return parsed;
}
