import { appendFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import { createCloudflareNarsProjectionWorker } from '../src/worker.js';
import { deliverRemoteProjectionInputsOnce, preflightCloudflareProjectionRegistration, publishWorkspaceRouteRemotely, registerProjectionRemotely, revokeWorkspaceRouteRemotely, writeProjectionRegistrationPlan, readProjectionRegistration, startLocalProjectionBridgeLoop, startLocalProjectionBridgeOnce, startLocalProjectionBridgeRunProcess } from '../src/node.js';

const now = '2026-06-30T21:30:00.000Z';

function createSiteWithSession() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-projection-site-'));
  const sessionId = 'carrier_test';
  const sitePaths = resolveNaradaSitePaths({ siteRoot, sessionId });
  const sessionDir = sitePaths.narsSessionDir;
  mkdirSync(sessionDir, { recursive: true });
  const eventsPath = join(sessionDir, 'events.jsonl');
  const sessionPath = join(sessionDir, 'session.jsonl');
  writeFileSync(sessionPath, '');
  writeFileSync(eventsPath, [
    JSON.stringify({ event: 'assistant_message', event_sequence: 1, content: 'first' }),
    JSON.stringify({ event: 'session_health', event_sequence: 2, status: 'healthy' }),
    JSON.stringify({ event: 'tool_call', event_sequence: 3, tool: 'x' }),
  ].join('\n'));
  const recordPath = join(sessionDir, 'session-index-record.json');
  writeFileSync(recordPath, `${JSON.stringify({
    schema: 'narada.nars.session_index_record.v1',
    session_id: sessionId,
    carrier_session_id: sessionId,
    agent_id: 'resident',
    site_id: 'narada.sonar',
    site_root: siteRoot,
    events_path: eventsPath,
    session_path: sessionPath,
    health_endpoint: 'http://127.0.0.1:9/health',
  }, null, 2)}\n`);
  writeFileSync(join(sitePaths.narsSessionsRoot, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.session_index.v1',
    site_root: siteRoot,
    sessions: [{ session_id: sessionId, carrier_session_id: sessionId, record_path: recordPath }],
  }, null, 2)}\n`);
  return { siteRoot, sessionId };
}

function addArtifacts(siteRoot, sessionId) {
  const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir;
  const artifactsDir = join(sessionDir, 'artifacts');
  const markdownPath = join(artifactsDir, 'report.md');
  const htmlPath = join(artifactsDir, 'preview.html');
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(markdownPath, '# Report', 'utf8');
  writeFileSync(htmlPath, '<h1>Preview</h1>', 'utf8');
  writeFileSync(join(artifactsDir, 'index.json'), `${JSON.stringify({
    schema: 'narada.nars.artifact_index.v1',
    session_id: sessionId,
    artifacts: [
      { schema: 'narada.nars.artifact_record.v1', artifact_id: 'art_md', session_id: sessionId, agent_id: 'resident', kind: 'markdown', title: 'Report', source_path: markdownPath, content_type: 'text/markdown; charset=utf-8', created_at: now, access: { scope: 'session', token_required: false }, render: { preferred: 'inline' }, lifecycle: { state: 'active', owner: 'nars-session' } },
      { schema: 'narada.nars.artifact_record.v1', artifact_id: 'art_html', session_id: sessionId, agent_id: 'resident', kind: 'html', title: 'Preview', source_path: htmlPath, content_type: 'text/html; charset=utf-8', created_at: now, access: { scope: 'session', token_required: false }, render: { preferred: 'inline', sandbox: { allow_scripts: true, allow_top_navigation: false } }, lifecycle: { state: 'active', owner: 'nars-session' } },
    ],
  }, null, 2)}\n`);
}

describe('node projection store and bridge', () => {
  test('persists local intent and remote access records for pending registration', () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const plan = writeProjectionRegistrationPlan({
      site_id: 'narada.sonar',
      site_root: siteRoot,
      nars_session_id: sessionId,
      dry_run: false,
      created_at: now,
    });
    const stored = readProjectionRegistration(siteRoot, plan.projection_id);
    expect(stored.intent?.nars_session_id).toBe(sessionId);
    expect(stored.remote_access?.bridge_credential.kind).toBe('bridge');
    expect(plan.status).toBe('registered_locally_pending_cloudflare_write');
  });

  test('bridge-run process launcher builds durable polling command without shell mediation', () => {
    const spawned = [];
    const result = startLocalProjectionBridgeRunProcess({
      site_root: 'D:/code/narada.sonar',
      projection_id: 'proj_process',
      cloudflare_api_base_url: 'https://projection.example.test',
      poll_interval_ms: 2500,
      spawn_impl: (command, args, options) => {
        spawned.push({ command, args, options });
        return { pid: 4242, unref() {} } as never;
      },
    });
    expect(result).toMatchObject({ status: 'launched', projection_id: 'proj_process', pid: 4242, detached: true });
    expect(spawned[0]).toMatchObject({
      command: process.execPath,
      args: [expect.stringMatching(/layers[\\/]cli[\\/]dist[\\/]main\.js$/), 'nars', 'projection', 'bridge-run', '--site-root', 'D:/code/narada.sonar', '--projection-id', 'proj_process', '--cloudflare-api-base-url', 'https://projection.example.test', '--poll-interval-ms', '2500'],
      options: { cwd: 'D:/code/narada.sonar', detached: true, stdio: 'ignore', windowsHide: true },
    });
  });

  test('bridge-run process launcher keeps explicit command override for packaged callers', () => {
    const spawned = [];
    startLocalProjectionBridgeRunProcess({
      site_root: 'D:/code/narada.sonar',
      projection_id: 'proj_process',
      command: 'narada',
      spawn_impl: (command, args, options) => {
        spawned.push({ command, args, options });
        return { pid: 4242, on() {}, unref() {} } as never;
      },
    });
    expect(spawned[0]).toMatchObject({
      command: 'narada',
      args: ['nars', 'projection', 'bridge-run', '--site-root', 'D:/code/narada.sonar', '--projection-id', 'proj_process'],
    });
  });

  test('remote registration preflight refuses before mutation when projection health is unavailable', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const seen = [];
    const result = await registerProjectionRemotely({
      site_id: 'narada.sonar',
      site_root: siteRoot,
      nars_session_id: sessionId,
      projection_id: 'proj_preflight_refusal',
      dry_run: false,
      created_at: now,
      cloudflare_api_base_url: 'https://projection.example.test',
      fetch_impl: async (input) => {
        seen.push(String(input));
        return new Response(JSON.stringify({ status: 'refused' }), { status: 503, headers: { 'content-type': 'application/json' } });
      },
    });
    expect(result).toMatchObject({ status: 'remote_registration_preflight_refused', preflight: { code: 'cloudflare_projection_health_unavailable' } });
    expect(seen).toEqual(['https://projection.example.test/api/nars/projections/health']);
  });

  test('operator session preflight reports stale cookie-backed site.read before live registration', async () => {
    const { siteRoot } = createSiteWithSession();
    const cookieFile = join(siteRoot, 'operator-cookie.txt');
    writeFileSync(cookieFile, 'narada_operator_session=stale');
    const preflight = await preflightCloudflareProjectionRegistration({
      cloudflare_api_base_url: 'https://projection.example.test',
      cloudflare_carrier_api_base_url: 'https://carrier.example.test',
      operator_cookie_file: cookieFile,
      require_operator_session: true,
      fetch_impl: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/nars/projections/health')) return new Response(JSON.stringify({ status: 'healthy' }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { 'content-type': 'application/json' } });
      },
    });
    expect(preflight).toMatchObject({ status: 'refused', code: 'cloudflare_operator_session_stale' });
  });

  test('remote registration posts local intent and persists returned Cloudflare access record', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const result = await registerProjectionRemotely({
      site_id: 'narada.sonar',
      site_root: siteRoot,
      nars_session_id: sessionId,
      projection_id: 'proj_remote_test',
      dry_run: false,
      created_at: now,
      source_ref: { kind: 'cloudflare_carrier', carrier_session_id: 'carrier_remote_test', operation_id: 'operation_remote_test' },
      cloudflare_api_base_url: 'https://projection.example.test',
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
    });
    expect(result.status).toBe('registered_remotely');
    expect(result.remote_registration_endpoint).toBe('https://projection.example.test/api/nars/projections/register');
    const stored = readProjectionRegistration(siteRoot, 'proj_remote_test');
    expect(stored.intent?.remote_registration).toMatchObject({ status: 'registered', endpoint: result.remote_registration_endpoint });
    expect(stored.remote_access?.projection_id).toBe('proj_remote_test');
    expect(stored.intent?.source_ref).toEqual({ kind: 'cloudflare_carrier', carrier_session_id: 'carrier_remote_test', operation_id: 'operation_remote_test' });
    expect(stored.intent?.projection_api_base_url).toBe('https://projection.example.test');
    expect(stored.remote_access?.source_ref).toEqual({ kind: 'cloudflare_carrier', carrier_session_id: 'carrier_remote_test', operation_id: 'operation_remote_test' });
    expect(stored.remote_access?.projection_api_base_url).toBe('https://projection.example.test');
    expect(stored.remote_access?.bridge_credential.kind).toBe('bridge');
    expect(stored.remote_access?.browser_access_tokens[0].kind).toBe('browser');
  });

  test('publishes and revokes a workspace route through the Cloudflare directory', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const registration = await registerProjectionRemotely({
      site_id: 'narada.sonar',
      site_root: siteRoot,
      nars_session_id: sessionId,
      projection_id: 'proj_workspace_node_test',
      dry_run: false,
      created_at: now,
      cloudflare_api_base_url: 'https://projection.example.test',
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
    });
    const browserToken = registration.remote_access.browser_access_tokens[0].token_fingerprint;
    const route = {
      id: 'session-detail',
      path: `/sessions/${sessionId}`,
      kind: 'page' as const,
      label: 'Session',
      target: { kind: 'session' as const, id: sessionId },
    };
    const published = await publishWorkspaceRouteRemotely({
      site_root: siteRoot,
      projection_id: 'proj_workspace_node_test',
      cloudflare_api_base_url: 'https://projection.example.test',
      lease_id: 'lease_workspace_node_test',
      surface_id: 'agent-sessions',
      route,
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
    });
    expect(published).toMatchObject({ status: 'published', lease_id: 'lease_workspace_node_test', response_status: 200 });

    const directory = await (await worker.fetch(new Request('https://projection.example.test/api/nars/workspace/routes?projection_id=proj_workspace_node_test', {
      headers: { 'x-narada-browser-token-fingerprint': browserToken },
    }))).json();
    expect(directory.surfaces.find((surface: { id: string }) => surface.id === 'agent-sessions').projectedRoutes)
      .toContainEqual(expect.objectContaining({ id: 'session-detail', availability: 'available' }));

    const revoked = await revokeWorkspaceRouteRemotely({
      site_root: siteRoot,
      projection_id: 'proj_workspace_node_test',
      cloudflare_api_base_url: 'https://projection.example.test',
      lease_id: 'lease_workspace_node_test',
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
    });
    expect(revoked).toMatchObject({ status: 'revoked', lease_id: 'lease_workspace_node_test', response_status: 200 });
  });

  test('delivers queued remote projection input to local NARS admission callback', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const registration = await registerProjectionRemotely({
      site_id: 'narada.sonar',
      site_root: siteRoot,
      nars_session_id: sessionId,
      projection_id: 'proj_input_delivery',
      dry_run: false,
      created_at: now,
      cloudflare_api_base_url: 'https://projection.example.test',
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
    });
    const browser = registration.remote_access.browser_access_tokens[0].token_fingerprint;
    await worker.fetch(new Request('https://projection.example.test/api/nars/projections/proj_input_delivery/input', {
      method: 'POST',
      headers: { 'x-narada-browser-token-fingerprint': browser },
      body: JSON.stringify({ method: 'conversation.enqueue', payload: { message: 'next' } }),
    }));
    const admitted = [];
    const result = await deliverRemoteProjectionInputsOnce({
      site_root: siteRoot,
      projection_id: 'proj_input_delivery',
      cloudflare_api_base_url: 'https://projection.example.test',
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
      submit_nars_input: (input) => {
        admitted.push(input);
        return { status: 'accepted_by_nars', method: input.method };
      },
    });
    expect(result).toMatchObject({ status: 'delivered', delivered_count: 1 });
    expect(admitted[0]).toMatchObject({ method: 'conversation.enqueue', payload: { message: 'next' } });
  });

  test('bridge verifies health, backfills local events, and reports connected state', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    addArtifacts(siteRoot, sessionId);
    const plan = writeProjectionRegistrationPlan({ site_id: 'narada.sonar', site_root: siteRoot, nars_session_id: sessionId, dry_run: false, created_at: now });
    const published = [];
    const publishedMetadata = [];
    const publishedContent = [];
    const result = await startLocalProjectionBridgeOnce({
      site_root: siteRoot,
      projection_id: plan.projection_id,
      health_probe: () => 'healthy',
      publish_event: (event) => published.push(event),
      publish_artifact_metadata: (artifact) => publishedMetadata.push(artifact),
      publish_artifact_content: (artifact) => publishedContent.push(artifact),
      now,
    });
    expect(result.status).toBe('connected');
    expect(result.projected_event_count).toBe(2);
    expect(result.projected_artifact_metadata_count).toBe(2);
    expect(result.projected_artifact_content_count).toBe(1);
    expect(result.bridge_state.status).toBe('connected');
    expect(result.bridge_state.artifact_metadata_status.status).toBe('connected');
    expect(result.bridge_state.artifact_content_status.status).toBe('degraded');
    expect(published.map((event) => event.event_sequence)).toEqual([1, 3]);
    expect(publishedMetadata.map((artifact) => artifact.artifact_id)).toEqual(['art_md', 'art_html']);
    expect(publishedContent.map((artifact) => artifact.artifact_id)).toEqual(['art_md']);
    expect(publishedMetadata.every((artifact) => artifact.source_path === undefined)).toBe(true);
    expect(JSON.stringify(publishedMetadata)).not.toContain('report.md');
  });

  test('bridge publishes projected events and artifacts to the registered Cloudflare projection', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    addArtifacts(siteRoot, sessionId);
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const registration = await registerProjectionRemotely({
      site_id: 'narada.sonar',
      site_root: siteRoot,
      nars_session_id: sessionId,
      projection_id: 'proj_bridge_remote_publish',
      dry_run: false,
      created_at: now,
      cloudflare_api_base_url: 'https://projection.example.test',
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
    });
    const result = await startLocalProjectionBridgeOnce({
      site_root: siteRoot,
      projection_id: 'proj_bridge_remote_publish',
      cloudflare_api_base_url: 'https://projection.example.test',
      fetch_impl: (input, init) => worker.fetch(new Request(input, init)),
      health_probe: () => 'healthy',
      now,
    });
    expect(result.status).toBe('connected');

    const browser = registration.remote_access.browser_access_tokens[0].token_fingerprint;
    const eventReplay = await worker.fetch(new Request('https://projection.example.test/api/nars/projections/proj_bridge_remote_publish/events?since_sequence=0', {
      headers: { 'x-narada-browser-token-fingerprint': browser },
    }));
    const events = await eventReplay.json();
    expect(events).toMatchObject({ status: 'ok', event_count: 2 });
    expect(events.events.map((event) => event.event_sequence)).toEqual([1, 3]);

    const metadataResponse = await worker.fetch(new Request('https://projection.example.test/api/nars/projections/proj_bridge_remote_publish/artifacts/art_md', {
      headers: { 'x-narada-browser-token-fingerprint': browser },
    }));
    expect(await metadataResponse.json()).toMatchObject({ status: 'ok', artifact: { artifact_id: 'art_md', kind: 'markdown' } });

    const contentResponse = await worker.fetch(new Request('https://projection.example.test/api/nars/projections/proj_bridge_remote_publish/artifacts/art_md/content', {
      headers: { 'x-narada-browser-token-fingerprint': browser },
    }));
    expect(contentResponse.status).toBe(200);
    expect(await contentResponse.text()).toBe('# Report');
  });

  test('bridge reconnect resumes from last replicated sequence without replaying old events', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const plan = writeProjectionRegistrationPlan({ site_id: 'narada.sonar', site_root: siteRoot, nars_session_id: sessionId, dry_run: false, created_at: now });
    await startLocalProjectionBridgeOnce({ site_root: siteRoot, projection_id: plan.projection_id, health_probe: () => 'healthy', now });
    const secondPublish = [];
    const second = await startLocalProjectionBridgeOnce({
      site_root: siteRoot,
      projection_id: plan.projection_id,
      health_probe: () => 'healthy',
      publish_event: (event) => secondPublish.push(event),
      now,
    });
    expect(second.status).toBe('connected');
    expect(second.backfill).toMatchObject({ from_sequence: 4, mode: 'resume' });
    expect(secondPublish).toEqual([]);
  });

  test('durable bridge loop reruns bridge passes and resumes from cursor', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const plan = writeProjectionRegistrationPlan({ site_id: 'narada.sonar', site_root: siteRoot, nars_session_id: sessionId, dry_run: false, created_at: now });
    const published = [];
    const sessionDir = resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionDir;
    const eventsPath = join(sessionDir, 'events.jsonl');
    const result = await startLocalProjectionBridgeLoop({
      site_root: siteRoot,
      projection_id: plan.projection_id,
      health_probe: () => 'healthy',
      publish_event: (event) => published.push(event),
      poll_interval_ms: 0,
      stop_after_iterations: 2,
      sleep_impl: () => appendFileSync(eventsPath, `\n${JSON.stringify({ event: 'assistant_message', event_sequence: 4, content: 'second pass' })}`),
      now,
    });
    expect(result.status).toBe('completed');
    expect(result.iteration_count).toBe(2);
    expect(published.map((event) => event.event_sequence)).toEqual([1, 3, 4]);
  });

  test('bridge reports degraded instead of failing local NARS when health is unavailable', async () => {
    const { siteRoot, sessionId } = createSiteWithSession();
    const plan = writeProjectionRegistrationPlan({ site_id: 'narada.sonar', site_root: siteRoot, nars_session_id: sessionId, dry_run: false, created_at: now });
    const result = await startLocalProjectionBridgeOnce({
      site_root: siteRoot,
      projection_id: plan.projection_id,
      health_probe: () => 'unavailable',
      now,
    });
    expect(result.status).toBe('degraded');
    expect(result.degraded_launch.local_nars_healthy).toBe(false);
    expect(result.bridge_state.status).toBe('degraded');
  });

  test('bridge refuses missing projection registration', async () => {
    const { siteRoot } = createSiteWithSession();
    const result = await startLocalProjectionBridgeOnce({ site_root: siteRoot, projection_id: 'missing', health_probe: () => 'healthy', now });
    expect(result).toMatchObject({ status: 'refused', reason: 'projection_registration_not_found' });
  });
});
