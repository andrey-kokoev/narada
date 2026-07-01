import { describe, expect, test } from 'vitest';
import {
  CLOUDFLARE_NARS_PROJECTION_ACCESS_SCHEMA,
  CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA,
  buildAgentWebUiCloudflareAuthorityConfig,
  buildAgentWebUiCloudflareProjectionConfig,
  buildProjectionRegistrationPlan,
  classifyCloudflareInputRelay,
  createArtifactProjectionCache,
  createBoundedProjectionCache,
  createCloudflareNarsProjectionWorkerService,
  createBridgeState,
  createCloudflareNarsProjectionIntent,
  createCloudflareNarsRemoteAccessRecord,
  planBridgeBackfill,
  projectNarsArtifactContentForCloudflare,
  projectNarsArtifactMetadataForCloudflare,
  projectNarsEventForCloudflare,
  revokeCredential,
  revokeProjection,
  validateProjectionCredential,
} from '../src/index.js';
import { createCloudflareNarsProjectionWorker, NarsProjectionState } from '../src/worker.js';

const now = '2026-06-30T21:00:00.000Z';

function sampleIntent() {
  return createCloudflareNarsProjectionIntent({
    projection_id: 'proj_sonar_resident_1',
    site_id: 'narada.sonar',
    site_root: 'D:/code/narada.sonar',
    nars_session_id: 'carrier_123',
    operator_input_policy: ['conversation.send', 'conversation.enqueue'],
    created_by: 'operator',
  }, now);
}

describe('Cloudflare NARS projection schemas', () => {
  test('creates local projection intent separately from remote access state', () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });

    expect(intent.schema).toBe(CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA);
    expect(access.schema).toBe(CLOUDFLARE_NARS_PROJECTION_ACCESS_SCHEMA);
    expect(intent.projection_id).toBe(access.projection_id);
    expect(intent.nars_session_id).toBe('carrier_123');
    expect(access.bridge_credential.kind).toBe('bridge');
    expect(access.browser_access_tokens[0].kind).toBe('browser');
    expect(JSON.stringify(access)).not.toContain('secret');
  });

  test('Worker registration from raw intent remains active and can publish/replay', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const intent = {
      schema: CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA,
      projection_id: 'proj_raw_intent_active',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_raw_intent',
      event_stream_policy: 'operator',
      artifact_projection_policy: { metadata: 'public_records', content: 'none' },
      operator_input_policy: ['conversation.send', 'conversation.enqueue'],
      replica_cache_policy: 'short_bounded',
    };
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    const registered = await jsonOf(worker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({ intent }),
    })));
    expect(registered.remote_access.lifecycle_state).toBe('active');

    expect(await jsonOf(worker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': registered.remote_access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ site_id: intent.site_id, nars_session_id: intent.nars_session_id, event: { event: 'user_message', event_sequence: 1, content: 'hello' } }),
    })))).toMatchObject({ status: 'published', projection_id: intent.projection_id });

    expect(await jsonOf(worker.fetch(new Request(`${base}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': registered.remote_access.browser_access_tokens[0].token_fingerprint },
    })))).toMatchObject({ status: 'ok', event_count: 1 });
  });

  test('Worker Durable Object routing keeps projection state across register publish and replay', async () => {
    const outerWorker = createCloudflareNarsProjectionWorker({ now: () => now });
    const objects = new Map<string, NarsProjectionState>();
    const env = {
      NARS_PROJECTION_STATE: {
        idFromName(name: string) { return name; },
        get(id: string) {
          if (!objects.has(id)) {
            const storage = new Map<string, unknown>();
            objects.set(id, new NarsProjectionState({
              storage: {
                get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
                put(key: string, value: unknown) { storage.set(key, value); },
              },
            }));
          }
          return objects.get(id)!;
        },
      },
    };
    const intent = sampleIntent();
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    const registered = await jsonOf(outerWorker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({ intent }),
    }), env));
    expect(registered).toMatchObject({ status: 'registered', projection_id: intent.projection_id });

    expect(await jsonOf(outerWorker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': registered.remote_access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ site_id: intent.site_id, nars_session_id: intent.nars_session_id, event: { event: 'assistant_message', event_sequence: 7, content: 'durable hello' } }),
    }), env))).toMatchObject({ status: 'published', projection_id: intent.projection_id });

    const replay = await jsonOf(outerWorker.fetch(new Request(`${base}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': registered.remote_access.browser_access_tokens[0].token_fingerprint },
    }), env));
    expect(replay).toMatchObject({ status: 'ok', event_count: 1 });
    expect(replay.events[0].payload.content).toBe('durable hello');
  });

  test('Worker Durable Object routing streams bridge-published events to subscribed browsers', async () => {
    const outerWorker = createCloudflareNarsProjectionWorker({ now: () => now });
    const objects = new Map<string, NarsProjectionState>();
    const env = {
      NARS_PROJECTION_STATE: {
        idFromName(name: string) { return name; },
        get(id: string) {
          if (!objects.has(id)) {
            const storage = new Map<string, unknown>();
            objects.set(id, new NarsProjectionState({
              storage: {
                get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
                put(key: string, value: unknown) { storage.set(key, value); },
              },
            }));
          }
          return objects.get(id)!;
        },
      },
    };
    const intent = sampleIntent();
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    const registered = await jsonOf(outerWorker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({ intent }),
    }), env));

    const streamResponse = await outerWorker.fetch(new Request(`${base}/events/stream?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': registered.remote_access.browser_access_tokens[0].token_fingerprint },
    }), env);
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get('content-type')).toContain('text/event-stream');
    const reader = streamResponse.body!.getReader();
    await readStreamUntil(reader, 'nars-stream-connected');

    expect(await jsonOf(outerWorker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': registered.remote_access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ site_id: intent.site_id, nars_session_id: intent.nars_session_id, event: { event: 'assistant_message', event_sequence: 9, content: 'streamed hello' } }),
    }), env))).toMatchObject({ status: 'published', projection_id: intent.projection_id });

    expect(await readStreamUntil(reader, 'streamed hello')).toContain('assistant_message');
    await reader.cancel();
  });

  test('Worker Durable Object routing pushes bridge-published events over projection WebSocket', async () => {
    const outerWorker = createCloudflareNarsProjectionWorker({ now: () => now });
    const objects = new Map<string, NarsProjectionState>();
    const env = {
      NARS_PROJECTION_STATE: {
        idFromName(name: string) { return name; },
        get(id: string) {
          if (!objects.has(id)) {
            const storage = new Map<string, unknown>();
            objects.set(id, new NarsProjectionState({
              storage: {
                get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
                put(key: string, value: unknown) { storage.set(key, value); },
              },
            }));
          }
          return objects.get(id)!;
        },
      },
    };
    const sockets: FakeWebSocketPair[] = [];
    const globalWithWebSocketPair = globalThis as typeof globalThis & { WebSocketPair?: unknown };
    const originalWebSocketPair = globalWithWebSocketPair.WebSocketPair;
    globalWithWebSocketPair.WebSocketPair = class {
      constructor() {
        const pair = createFakeWebSocketPair();
        sockets.push(pair);
        return pair;
      }
    };
    try {
      const intent = sampleIntent();
      const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
      const registered = await jsonOf(outerWorker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
        method: 'POST',
        body: JSON.stringify({ intent }),
      }), env));

      const response = await withCloudflareWebSocketResponse(() => outerWorker.fetch(new Request(`${base}/events/websocket?browser_token=${registered.remote_access.browser_access_tokens[0].token_fingerprint}&since_sequence=0`, {
        headers: { Upgrade: 'websocket' },
      }), env));
      expect(response.status).toBe(101);
      expect(sockets[0].client.messages.map(JSON.parse)).toContainEqual(expect.objectContaining({ event: 'websocket_connected' }));

      expect(await jsonOf(outerWorker.fetch(new Request(`${base}/events`, {
        method: 'POST',
        headers: { 'x-narada-bridge-token-fingerprint': registered.remote_access.bridge_credential.token_fingerprint },
        body: JSON.stringify({ site_id: intent.site_id, nars_session_id: intent.nars_session_id, event: { event: 'assistant_message', event_sequence: 10, content: 'websocket hello' } }),
      }), env))).toMatchObject({ status: 'published', projection_id: intent.projection_id });

      expect(sockets[0].client.messages.map(JSON.parse)).toContainEqual(expect.objectContaining({ event: 'assistant_message', content: 'websocket hello' }));
    } finally {
      if (originalWebSocketPair === undefined) delete globalWithWebSocketPair.WebSocketPair;
      else globalWithWebSocketPair.WebSocketPair = originalWebSocketPair;
    }
  });

  test('Worker Durable Object routing persists projection state across object instance restart', async () => {
    const outerWorker = createCloudflareNarsProjectionWorker({ now: () => now });
    const storage = new Map<string, unknown>();
    const env = {
      NARS_PROJECTION_STATE: {
        idFromName(name: string) { return name; },
        get(_id: string) {
          return new NarsProjectionState({
            storage: {
              get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
              put(key: string, value: unknown) { storage.set(key, value); },
            },
          });
        },
      },
    };
    const intent = sampleIntent();
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    const registered = await jsonOf(outerWorker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({ intent }),
    }), env));
    expect(registered).toMatchObject({ status: 'registered', projection_id: intent.projection_id });

    expect(await jsonOf(outerWorker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': registered.remote_access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ site_id: intent.site_id, nars_session_id: intent.nars_session_id, event: { event: 'assistant_message', event_sequence: 11, content: 'persisted durable hello' } }),
    }), env))).toMatchObject({ status: 'published', projection_id: intent.projection_id });

    const replay = await jsonOf(outerWorker.fetch(new Request(`${base}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': registered.remote_access.browser_access_tokens[0].token_fingerprint },
    }), env));
    expect(replay).toMatchObject({ status: 'ok', event_count: 1 });
    expect(replay.events[0].payload.content).toBe('persisted durable hello');
  });

  test('Worker registration resets stale projection cache for the same projection id', async () => {
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const intent = sampleIntent();
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    const first = await jsonOf(worker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({ intent }),
    })));
    await worker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': first.remote_access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ site_id: intent.site_id, nars_session_id: intent.nars_session_id, event: { event: 'assistant_message', event_sequence: 999001, content: 'stale diagnostic' } }),
    }));

    const second = await jsonOf(worker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({ intent }),
    })));
    const replay = await jsonOf(worker.fetch(new Request(`${base}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': second.remote_access.browser_access_tokens[0].token_fingerprint },
    })));
    expect(replay).toMatchObject({ status: 'ok', event_count: 0 });
  });

  test('publishes artifact metadata/content and refuses event-only credential misuse', () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const service = createCloudflareNarsProjectionWorkerService();
    service.register(access);
    const artifact = { artifact_id: 'art_1', kind: 'markdown', title: 'Report', content_type: 'text/markdown; charset=utf-8', lifecycle: { state: 'active' }, source_path: 'D:/secret/report.md' };

    const metadata = service.publishArtifactMetadata({ projection_id: intent.projection_id, bridge_token_fingerprint: access.bridge_credential.token_fingerprint, artifact, now });
    expect(metadata.status).toBe('published');
    expect(metadata.metadata?.source_path).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain('D:/secret');

    const content = service.publishArtifactContent({ projection_id: intent.projection_id, bridge_token_fingerprint: access.bridge_credential.token_fingerprint, artifact, content: '# Report', now });
    expect(content.status).toBe('published');

    const readMetadata = service.readArtifactMetadata({ projection_id: intent.projection_id, browser_token_fingerprint: access.browser_access_tokens[0].token_fingerprint });
    expect(readMetadata.status).toBe('ok');
    expect(readMetadata.artifacts[0].artifact_id).toBe('art_1');

    const readContent = service.readArtifactContent({ projection_id: intent.projection_id, browser_token_fingerprint: access.browser_access_tokens[0].token_fingerprint, artifact_id: 'art_1' });
    expect(readContent.status).toBe('ok');
    expect(readContent.content?.byte_length).toBeGreaterThan(0);

    expect(service.readArtifactContent({ projection_id: intent.projection_id, browser_token_fingerprint: access.bridge_credential.token_fingerprint, artifact_id: 'art_1' }).code).toBe('credential_not_found_for_kind');
  });

  test('builds a two-phase registration plan without treating Cloudflare as local authority', () => {
    const plan = buildProjectionRegistrationPlan({
      site_id: 'narada.sonar',
      site_root: 'D:/code/narada.sonar',
      nars_session_id: 'carrier_abc',
      dry_run: true,
    });

    expect(plan.status).toBe('planned');
    expect(plan.local_intent.schema).toBe(CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA);
    expect(plan.remote_access.schema).toBe(CLOUDFLARE_NARS_PROJECTION_ACCESS_SCHEMA);
    expect(plan.bridge_launch.args).toEqual([
      'nars',
      'projection',
      'bridge-start',
      '--site-root',
      'D:/code/narada.sonar',
      '--projection-id',
      plan.projection_id,
    ]);
  });
});

describe('artifact projection and cache', () => {
  test('projects public metadata without local source paths', () => {
    const projected = projectNarsArtifactMetadataForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      artifact: { artifact_id: 'art_1', kind: 'markdown', title: 'Report', source_path: 'D:/secret/report.md', lifecycle: { state: 'active' } },
      projected_at: now,
    });
    expect(projected.ok).toBe(true);
    if (projected.ok) {
      expect(projected.metadata.title).toBe('Report');
      expect(projected.metadata.source_path).toBeUndefined();
      expect(JSON.stringify(projected.metadata)).not.toContain('D:/secret');
    }
  });

  test('content policy admits selected text kinds and refuses default HTML/oversize content', () => {
    const markdown = projectNarsArtifactContentForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      artifact: { artifact_id: 'art_md', kind: 'markdown', lifecycle: { state: 'active' } },
      content: '# ok',
      projected_at: now,
    });
    expect(markdown.ok).toBe(true);

    const html = projectNarsArtifactContentForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      artifact: { artifact_id: 'art_html', kind: 'html', lifecycle: { state: 'active' } },
      content: '<h1>no</h1>',
      projected_at: now,
    });
    expect(html).toMatchObject({ ok: false, code: 'artifact_content_policy_refused' });

    const oversize = projectNarsArtifactContentForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      policy: { max_content_bytes: 2 },
      artifact: { artifact_id: 'art_txt', kind: 'text', lifecycle: { state: 'active' } },
      content: 'too large',
      projected_at: now,
    });
    expect(oversize).toMatchObject({ ok: false, code: 'artifact_content_too_large' });
  });

  test('artifact cache reads metadata and content independently', () => {
    const cache = createArtifactProjectionCache();
    const metadata = projectNarsArtifactMetadataForCloudflare({ projection_id: 'proj_1', site_id: 'site', nars_session_id: 's1', artifact: { artifact_id: 'art_1', kind: 'json', lifecycle: { state: 'active' } }, projected_at: now });
    const content = projectNarsArtifactContentForCloudflare({ projection_id: 'proj_1', site_id: 'site', nars_session_id: 's1', artifact: { artifact_id: 'art_1', kind: 'json', lifecycle: { state: 'active' } }, content: '{"ok":true}', projected_at: now });
    if (!metadata.ok || !content.ok) throw new Error('expected artifact projection');
    cache.putMetadata(metadata.metadata);
    cache.putContent(content.content);
    expect(cache.readMetadata('proj_1', null).artifact_count).toBe(1);
    expect(cache.readContent('proj_1', 'art_1').status).toBe('ok');
    expect(cache.readContent('proj_1', 'missing').code).toBe('artifact_content_cache_miss');
  });
});

describe('worker boundary service', () => {
  test('publishes bridge events, replays to browser, and relays input to NARS admission', async () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const service = createCloudflareNarsProjectionWorkerService({
      nars_input_relay: ({ method, payload }) => ({ status: 'accepted_by_nars', method, payload }),
    });
    service.register(access);

    const published = service.publishEvent({
      projection_id: intent.projection_id,
      bridge_token_fingerprint: access.bridge_credential.token_fingerprint,
      event: { event: 'assistant_message', event_sequence: 1, content: 'hello' },
      now,
    });
    expect(published.status).toBe('published');

    const replay = service.readEvents({
      projection_id: intent.projection_id,
      browser_token_fingerprint: access.browser_access_tokens[0].token_fingerprint,
      since_sequence: 0,
    });
    expect(replay.status).toBe('ok');
    expect(replay.events.map((event) => event.event_sequence)).toEqual([1]);

    const input = await service.submitInput({
      projection_id: intent.projection_id,
      browser_token_fingerprint: access.browser_access_tokens[0].token_fingerprint,
      method: 'conversation.enqueue',
      payload: { message: 'next' },
    });
    expect(input).toMatchObject({ ok: true, semantic_success_point: 'nars_admission', nars_admission: { status: 'accepted_by_nars' } });
  });

  test('worker boundary refuses wrong credentials and revoked projections', () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const service = createCloudflareNarsProjectionWorkerService();
    service.register(access);

    expect(service.publishEvent({
      projection_id: intent.projection_id,
      bridge_token_fingerprint: access.browser_access_tokens[0].token_fingerprint,
      event: { event: 'assistant_message', event_sequence: 1 },
    }).code).toBe('credential_not_found_for_kind');

    service.revokeProjection(intent.projection_id, now);
    expect(service.readEvents({
      projection_id: intent.projection_id,
      browser_token_fingerprint: access.browser_access_tokens[0].token_fingerprint,
    }).code).toBe('projection_revoked');
  });
});

describe('Cloudflare Worker routes', () => {
  test('Cloudflare-origin synthetic NARS authority session replays, streams live, admits input, reports health, and revokes', async () => {
    const outerWorker = createCloudflareNarsProjectionWorker({ now: () => now });
    const objects = new Map<string, NarsProjectionState>();
    const env = {
      NARS_PROJECTION_STATE: {
        idFromName(name: string) { return name; },
        get(id: string) {
          if (!objects.has(id)) {
            const storage = new Map<string, unknown>();
            objects.set(id, new NarsProjectionState({
              storage: {
                get<T = unknown>(key: string) { return storage.get(key) as T | undefined; },
                put(key: string, value: unknown) { storage.set(key, value); },
              },
            }));
          }
          return objects.get(id)!;
        },
      },
    };
    const sockets: FakeWebSocketPair[] = [];
    const globalWithWebSocketPair = globalThis as typeof globalThis & { WebSocketPair?: unknown };
    const originalWebSocketPair = globalWithWebSocketPair.WebSocketPair;
    globalWithWebSocketPair.WebSocketPair = class {
      constructor() {
        const pair = createFakeWebSocketPair();
        sockets.push(pair);
        return pair;
      }
    };
    try {
      const created = await jsonOf(outerWorker.fetch(new Request('https://projection.example.test/api/nars/authority/sessions', {
        method: 'POST',
        body: JSON.stringify({ session_id: 'cf_session_synthetic_1', site_id: 'narada.cloudflare.test', agent_id: 'cloudflare.resident' }),
      }), env));
      expect(created).toMatchObject({ status: 'created', session_id: 'cf_session_synthetic_1', session: { execution_mode: 'synthetic_no_provider_no_tools' } });

      const base = 'https://projection.example.test/api/nars/authority/sessions/cf_session_synthetic_1';
      expect(await jsonOf(outerWorker.fetch(new Request(`${base}/health`), env))).toMatchObject({ status: 'healthy', session_id: 'cf_session_synthetic_1' });

      const replay = await jsonOf(outerWorker.fetch(new Request(`${base}/events?since_sequence=0`), env));
      expect(replay).toMatchObject({ status: 'ok', event_count: 1 });
      expect(replay.events[0].payload).toMatchObject({ event: 'session_started' });

      const response = await withCloudflareWebSocketResponse(() => outerWorker.fetch(new Request(`${base}/events/websocket?since_sequence=0`, {
        headers: { Upgrade: 'websocket' },
      }), env));
      expect(response.status).toBe(101);
      const localOperatorSurface = sockets[0].client.messages.map(JSON.parse);
      expect(localOperatorSurface).toContainEqual(expect.objectContaining({ event: 'websocket_connected', transport: 'cloudflare_authority_websocket' }));
      expect(localOperatorSurface).toContainEqual(expect.objectContaining({ event: 'session_started' }));

      const input = await jsonOf(outerWorker.fetch(new Request(`${base}/input`, {
        method: 'POST',
        body: JSON.stringify({ method: 'conversation.send', payload: { message: 'hello from local operator surface' } }),
      }), env));
      expect(input).toMatchObject({ status: 'admitted', execution_kind: 'synthetic_no_provider_no_tools', method: 'conversation.send' });
      expect(JSON.stringify(input)).not.toContain('provider_call');
      expect(JSON.stringify(input)).not.toContain('tool_call');

      const liveMessages = sockets[0].client.messages.map(JSON.parse);
      expect(liveMessages).toContainEqual(expect.objectContaining({ event: 'user_message', content: 'hello from local operator surface' }));
      expect(liveMessages).toContainEqual(expect.objectContaining({ event: 'assistant_message', execution_kind: 'synthetic_no_provider_no_tools' }));
      expect(liveMessages).toContainEqual(expect.objectContaining({ event: 'turn_complete', terminal_state: 'completed_synthetic' }));

      const replayAfterInput = await jsonOf(outerWorker.fetch(new Request(`${base}/events?since_sequence=1`), env));
      expect(replayAfterInput).toMatchObject({ status: 'ok', event_count: 6 });
      expect(replayAfterInput.events.map((entry: { payload: { event: string } }) => entry.payload.event)).toContain('session_artifact_registered');

      expect(await jsonOf(outerWorker.fetch(new Request(base, { method: 'DELETE' }), env))).toMatchObject({ status: 'revoked', session_id: 'cf_session_synthetic_1' });
      expect(sockets[0].client.messages.map(JSON.parse)).toContainEqual(expect.objectContaining({ event: 'authority_session_revoked', code: 'session_revoked', session_id: 'cf_session_synthetic_1' }));
      expect(sockets[0].client.closed).toBe(true);
      expect(await jsonOf(outerWorker.fetch(new Request(`${base}/health`), env))).toMatchObject({ status: 'refused', code: 'session_revoked' });
      expect(await jsonOf(outerWorker.fetch(new Request(`${base}/events?since_sequence=0`), env))).toMatchObject({ status: 'refused', code: 'session_revoked' });
      expect(await jsonOf(outerWorker.fetch(new Request(`${base}/input`, {
        method: 'POST',
        body: JSON.stringify({ method: 'conversation.send', payload: { message: 'after revoke' } }),
      }), env))).toMatchObject({ status: 'refused', code: 'session_revoked' });
    } finally {
      if (originalWebSocketPair === undefined) delete globalWithWebSocketPair.WebSocketPair;
      else globalWithWebSocketPair.WebSocketPair = originalWebSocketPair;
    }
  });

  test('serves agent-web-ui static assets outside the projection API route space', async () => {
    const requested: string[] = [];
    const worker = createCloudflareNarsProjectionWorker();
    const response = await worker.fetch(new Request('https://projection.example.test/?cloudflare_projection_id=proj_1&cloudflare_api_base_url=https://projection.example.test'), {
      ASSETS: {
        fetch(request) {
          requested.push(request.url);
          return new Response('<!doctype html><div id="app"></div>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
        },
      },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="app"></div>');
    expect(requested[0]).toContain('cloudflare_projection_id=proj_1');
  });

  test('registers projection, publishes bridge events/artifacts, and serves browser routes', async () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;

    expect(await jsonOf(worker.fetch(new Request('https://projection.example.test/api/nars/projections/register', {
      method: 'POST',
      body: JSON.stringify({ remote_access: access }),
    })))).toMatchObject({ status: 'registered', projection_id: intent.projection_id });

    expect(await jsonOf(worker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ event: { event: 'assistant_message', event_sequence: 1, content: 'hello' } }),
    })))).toMatchObject({ status: 'published', projection_id: intent.projection_id });

    const replay = await jsonOf(worker.fetch(new Request(`${base}/events?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
    })));
    expect(replay).toMatchObject({ status: 'ok', event_count: 1 });
    expect(replay.events[0].event_sequence).toBe(1);
    expect(await jsonOf(worker.fetch(new Request(`${base}/events/cache?since_sequence=0`, {
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
    })))).toMatchObject({ status: 'ok', event_count: 1 });

    const artifact = { artifact_id: 'art_1', kind: 'markdown', title: 'Report', lifecycle: { state: 'active' } };
    expect(await jsonOf(worker.fetch(new Request(`${base}/artifacts`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ artifact }),
    })))).toMatchObject({ status: 'published', metadata: { artifact_id: 'art_1' } });
    expect(await jsonOf(worker.fetch(new Request(`${base}/artifacts/art_1/content`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ artifact, content: '# Report' }),
    })))).toMatchObject({ status: 'published', content: { artifact_id: 'art_1' } });

    const metadata = await jsonOf(worker.fetch(new Request(`${base}/artifacts/art_1`, {
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
    })));
    expect(metadata).toMatchObject({ status: 'ok', artifact: { artifact_id: 'art_1' } });

    const content = await worker.fetch(new Request(`${base}/artifacts/art_1/content`, {
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
    }));
    expect(content.status).toBe(200);
    expect(await content.text()).toBe('# Report');

    expect(await jsonOf(worker.fetch(new Request(`${base}/health`, {
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
    })))).toMatchObject({ status: 'healthy', projection_id: intent.projection_id });
    expect(await jsonOf(worker.fetch(new Request('https://projection.example.test/api/nars/projections/health')))).toMatchObject({
      schema: 'narada.cloudflare_nars_projection.service_health.v1',
      status: 'healthy',
    });
  });

  test('Worker routes refuse browser publish and bridge browser-read misuse', async () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    await worker.fetch(new Request('https://projection.example.test/api/nars/projections/register', { method: 'POST', body: JSON.stringify(access) }));

    expect(await jsonOf(worker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
      body: JSON.stringify({ event: { event: 'assistant_message', event_sequence: 1 } }),
    })))).toMatchObject({ status: 'refused', code: 'credential_not_found_for_kind' });

    expect(await jsonOf(worker.fetch(new Request(`${base}/events`, {
      headers: { 'x-narada-browser-token-fingerprint': access.bridge_credential.token_fingerprint },
    })))).toMatchObject({ status: 'refused', code: 'credential_not_found_for_kind' });
  });

  test('Worker revoke route invalidates browser and bridge access', async () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const worker = createCloudflareNarsProjectionWorker({ now: () => now });
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    await worker.fetch(new Request('https://projection.example.test/api/nars/projections/register', { method: 'POST', body: JSON.stringify(access) }));

    expect(await jsonOf(worker.fetch(new Request(base, { method: 'DELETE' })))).toMatchObject({ status: 'revoked', projection_id: intent.projection_id });
    expect(await jsonOf(worker.fetch(new Request(`${base}/events`, {
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
    })))).toMatchObject({ status: 'refused', code: 'projection_revoked' });
    expect(await jsonOf(worker.fetch(new Request(`${base}/events`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ event: { event: 'assistant_message', event_sequence: 1 } }),
    })))).toMatchObject({ status: 'refused', code: 'projection_revoked' });
  });

  test('Worker input route validates browser credentials and policy-listed verbs', async () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const service = createCloudflareNarsProjectionWorkerService({ nars_input_relay: ({ method }) => ({ status: 'accepted_by_nars', method }) });
    const worker = createCloudflareNarsProjectionWorker({ service, now: () => now });
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    service.register(access);

    expect(await jsonOf(worker.fetch(new Request(`${base}/input`, {
      method: 'POST',
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
      body: JSON.stringify({ method: 'conversation.enqueue', payload: { message: 'next' } }),
    })))).toMatchObject({ ok: true, semantic_success_point: 'nars_admission', nars_admission: { status: 'accepted_by_nars' } });

    expect(await jsonOf(worker.fetch(new Request(`${base}/input`, {
      method: 'POST',
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
      body: JSON.stringify({ method: 'conversation.steer', payload: { message: 'no' } }),
    })))).toMatchObject({ ok: false, code: 'operator_input_method_not_admitted' });
  });

  test('Worker queues browser input for bridge delivery and accepts bridge acknowledgements', async () => {
    const intent = sampleIntent();
    const access = createCloudflareNarsRemoteAccessRecord({ intent, created_at: now });
    const service = createCloudflareNarsProjectionWorkerService();
    const worker = createCloudflareNarsProjectionWorker({ service, now: () => now });
    const base = `https://projection.example.test/api/nars/projections/${intent.projection_id}`;
    service.register(access);

    const submitted = await jsonOf(worker.fetch(new Request(`${base}/input`, {
      method: 'POST',
      headers: { 'x-narada-browser-token-fingerprint': access.browser_access_tokens[0].token_fingerprint },
      body: JSON.stringify({ method: 'conversation.enqueue', payload: { message: 'next' } }),
    })));
    expect(submitted).toMatchObject({ ok: true, acknowledgement: 'pending_bridge_delivery' });

    const pending = await jsonOf(worker.fetch(new Request(`${base}/input/pending`, {
      headers: { 'x-narada-bridge-token-fingerprint': access.bridge_credential.token_fingerprint },
    })));
    expect(pending).toMatchObject({ status: 'ok', input_count: 1 });
    expect(pending.inputs[0]).toMatchObject({ input_id: submitted.input_id, status: 'delivered_to_bridge', method: 'conversation.enqueue' });

    expect(await jsonOf(worker.fetch(new Request(`${base}/input/${submitted.input_id}/ack`, {
      method: 'POST',
      headers: { 'x-narada-bridge-token-fingerprint': access.bridge_credential.token_fingerprint },
      body: JSON.stringify({ nars_admission: { status: 'accepted_by_nars' } }),
    })))).toMatchObject({ status: 'acknowledged', input_id: submitted.input_id });
  });
});

async function jsonOf(responsePromise: Promise<Response>) {
  return responsePromise.then((response) => response.json());
}

async function readStreamUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string) {
  const decoder = new TextDecoder();
  let seen = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => setTimeout(() => reject(new Error(`stream_timeout_waiting_for_${text}`)), 500)),
    ]);
    if (chunk.done) break;
    seen += decoder.decode(chunk.value, { stream: true });
    if (seen.includes(text)) return seen;
  }
  throw new Error(`stream_text_not_seen: ${text}; saw ${seen}`);
}

type FakeWebSocketEvent = 'close' | 'error' | 'message';

interface FakeWebSocket {
  messages: string[];
  peer: FakeWebSocket | null;
  closed: boolean;
  accept(): void;
  addEventListener(type: FakeWebSocketEvent, handler: (event?: { data?: string }) => void): void;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

interface FakeWebSocketPair {
  0: FakeWebSocket;
  1: FakeWebSocket;
  client: FakeWebSocket;
  server: FakeWebSocket;
}

function createFakeWebSocketPair(): FakeWebSocketPair {
  const createSocket = (): FakeWebSocket => ({
    messages: [],
    peer: null,
    closed: false,
    accept() {},
    addEventListener() {},
    send(message: string) {
      this.peer?.messages.push(message);
    },
    close() {
      this.closed = true;
      if (this.peer) this.peer.closed = true;
    },
  });
  const client = createSocket();
  const server = createSocket();
  client.peer = server;
  server.peer = client;
  return { 0: client, 1: server, client, server };
}

async function withCloudflareWebSocketResponse(run: () => Promise<Response>): Promise<Response> {
  const globalWithResponse = globalThis as typeof globalThis & { Response: typeof Response };
  const OriginalResponse = globalWithResponse.Response;
  globalWithResponse.Response = class extends OriginalResponse {
    constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
      if (init?.status === 101) {
        super(null, { ...init, status: 200 });
        Object.defineProperty(this, 'status', { value: 101 });
        Object.defineProperty(this, 'webSocket', { value: init.webSocket });
        return;
      }
      super(body, init);
    }
  } as typeof Response;
  try {
    return await run();
  } finally {
    globalWithResponse.Response = OriginalResponse;
  }
}

describe('credential authority split', () => {
  test('refuses browser tokens for bridge publish and bridge credentials for browser access', () => {
    const access = createCloudflareNarsRemoteAccessRecord({ intent: sampleIntent(), created_at: now });
    const browser = access.browser_access_tokens[0].token_fingerprint;
    const bridge = access.bridge_credential.token_fingerprint;

    expect(validateProjectionCredential(access, {
      credential_kind: 'browser',
      token_fingerprint: browser,
      action: 'publish_event',
      now,
    }).code).toBe('credential_kind_not_authorized_for_action');

    expect(validateProjectionCredential(access, {
      credential_kind: 'bridge',
      token_fingerprint: bridge,
      action: 'subscribe_events',
      now,
    }).code).toBe('credential_kind_not_authorized_for_action');
  });

  test('revokes projection and targeted credentials independently', () => {
    const access = createCloudflareNarsRemoteAccessRecord({ intent: sampleIntent(), created_at: now });
    const browser = access.browser_access_tokens[0];
    const browserRevoked = revokeCredential(access, browser.credential_id, now);

    expect(browserRevoked.browser_access_tokens[0].status).toBe('revoked');
    expect(browserRevoked.bridge_credential.status).toBe('active');
    expect(validateProjectionCredential(browserRevoked, {
      credential_kind: 'browser',
      token_fingerprint: browser.token_fingerprint,
      action: 'subscribe_events',
      now,
    }).code).toBe('credential_revoked');
    expect(validateProjectionCredential(browserRevoked, {
      credential_kind: 'bridge',
      token_fingerprint: browserRevoked.bridge_credential.token_fingerprint,
      action: 'publish_event',
      now,
    }).ok).toBe(true);

    const bridgeRevoked = revokeCredential(access, access.bridge_credential.credential_id, now);
    expect(validateProjectionCredential(bridgeRevoked, {
      credential_kind: 'bridge',
      token_fingerprint: access.bridge_credential.token_fingerprint,
      action: 'publish_event',
      now,
    }).code).toBe('credential_revoked');

    const projectionRevoked = revokeProjection(access, now);
    expect(projectionRevoked.lifecycle_state).toBe('revoked');
    expect(projectionRevoked.bridge_credential.status).toBe('revoked');
    expect(projectionRevoked.browser_access_tokens[0].status).toBe('revoked');
    expect(['publish_event', 'subscribe_events', 'serve_cache', 'submit_input'].map((action) => validateProjectionCredential(projectionRevoked, {
      credential_kind: action === 'publish_event' ? 'bridge' : 'browser',
      token_fingerprint: action === 'publish_event' ? access.bridge_credential.token_fingerprint : browser.token_fingerprint,
      action: action as 'publish_event' | 'subscribe_events' | 'submit_input' | 'serve_cache',
      method: action === 'submit_input' ? 'conversation.enqueue' : undefined,
      now,
    }).code)).toEqual(['projection_revoked', 'projection_revoked', 'projection_revoked', 'projection_revoked']);
  });
});

describe('event projection and cache', () => {
  test('filters and redacts event classes by policy', () => {
    const projected = projectNarsEventForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      policy: 'operator',
      projected_at: now,
      event: {
        event: 'tool_result',
        event_sequence: 10,
        event_id: 'evt_10',
        tool: 'fs_read_file',
        result: { path: 'D:/secret/file.txt', token: 'secret-token' },
      },
    });

    expect(projected).not.toBeNull();
    expect(projected?.event_class).toBe('operations');
    expect(projected?.redactions.length).toBeGreaterThan(0);
    expect(JSON.stringify(projected)).not.toContain('secret-token');
  });

  test('does not publish provider agent-message telemetry as conversation', () => {
    const providerMessage = {
      event_sequence: 12,
      agent_id: 'resident',
      session_id: 'carrier_123',
      event: { type: 'item.completed', item: { id: 'provider_intro', type: 'agent_message', text: 'I am hydrating context first.' } },
    };

    expect(projectNarsEventForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      policy: 'conversation',
      event: providerMessage,
    })).toBeNull();

    const diagnostic = projectNarsEventForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      policy: 'diagnostic',
      event: providerMessage,
    });

    expect(diagnostic).not.toBeNull();
    expect(diagnostic?.event_class).toBe('diagnostics');
  });

  test('suppresses diagnostic health noise in conversation policy', () => {
    const projected = projectNarsEventForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      policy: 'conversation',
      event: { event: 'session_health', event_sequence: 11, status: 'healthy' },
    });

    expect(projected).toBeNull();
  });

  test('retains bounded replay by cursor', () => {
    const cache = createBoundedProjectionCache(2);
    for (let i = 1; i <= 3; i += 1) {
      const event = projectNarsEventForCloudflare({
        projection_id: 'proj_1',
        site_id: 'narada.sonar',
        nars_session_id: 'carrier_123',
        policy: 'raw',
        event: { event: 'assistant_message', event_sequence: i, event_id: `evt_${i}`, text: `m${i}` },
      });
      if (event) cache.push(event);
    }

    const replay = cache.read('proj_1', { since_sequence: 1 });
    expect(replay.events.map((event) => event.event_sequence)).toEqual([2, 3]);
    expect(replay.truncated).toBe(false);
  });

  test('deduplicates overlapping bridge replay by sequence or event id', () => {
    const cache = createBoundedProjectionCache(10);
    const first = projectNarsEventForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      policy: 'raw',
      event: { event: 'assistant_message', event_sequence: 2, event_id: 'evt_2', content: 'first' },
      projected_at: now,
    });
    const replayed = projectNarsEventForCloudflare({
      projection_id: 'proj_1',
      site_id: 'narada.sonar',
      nars_session_id: 'carrier_123',
      policy: 'raw',
      event: { event: 'assistant_message', event_sequence: 2, event_id: 'evt_2', content: 'updated' },
      projected_at: now,
    });

    if (first) expect(cache.push(first)).toMatchObject({ status: 'cached' });
    if (replayed) expect(cache.push(replayed)).toMatchObject({ status: 'deduplicated' });

    const replay = cache.read('proj_1', { since_sequence: 0 });
    expect(replay.event_count).toBe(1);
    expect(replay.events[0].payload.content).toBe('updated');
  });
});

describe('bridge and input relay', () => {
  test('plans local NARS log backfill from bridge cursor', () => {
    const initial = createBridgeState({ projection_id: 'proj_1', site_id: 'narada.sonar', nars_session_id: 'carrier_123' }, now);
    expect(planBridgeBackfill(initial)).toMatchObject({ source: 'local_nars_events_log', from_sequence: 1, mode: 'initial' });

    const resumed = createBridgeState({ projection_id: 'proj_1', site_id: 'narada.sonar', nars_session_id: 'carrier_123', last_replicated_sequence: 42 }, now);
    expect(planBridgeBackfill(resumed)).toMatchObject({ from_sequence: 43, mode: 'resume' });
  });

  test('admits only policy-listed input methods and waits for NARS admission', () => {
    const access = createCloudflareNarsRemoteAccessRecord({ intent: sampleIntent(), created_at: now });
    const token = access.browser_access_tokens[0].token_fingerprint;

    const enqueue = classifyCloudflareInputRelay(access, { token_fingerprint: token, method: 'conversation.enqueue', now });
    expect(enqueue).toMatchObject({ ok: true, acknowledgement: 'requires_nars_admission', semantic_success_point: 'nars_admission' });

    const steer = classifyCloudflareInputRelay(access, { token_fingerprint: token, method: 'conversation.steer', now });
    expect(steer).toMatchObject({ ok: false, code: 'operator_input_method_not_admitted' });
  });
});

describe('agent-web-ui Cloudflare mode', () => {
  test('builds remote projection endpoints without local loopback assumptions', () => {
    const config = buildAgentWebUiCloudflareProjectionConfig({ projection_id: 'proj_1', api_base_url: 'https://projection.example.test/' });

    expect(config.mode).toBe('cloudflare_projection');
    expect(config.event_endpoint).toBe('https://projection.example.test/api/nars/projections/proj_1/events');
    expect(config.input_endpoint).toBe('https://projection.example.test/api/nars/projections/proj_1/input');
    expect(config.artifact_base_path).toBe('https://projection.example.test/api/nars/projections/proj_1/artifacts');
    expect(config.health_endpoint).not.toContain('127.0.0.1');
  });

  test('builds Cloudflare authority endpoints with HTTP replay plus POST input for browser surfaces', () => {
    const config = buildAgentWebUiCloudflareAuthorityConfig({ session_id: 'cf_session_1', api_base_url: 'https://projection.example.test/' });

    expect(config.mode).toBe('cloudflare_authority');
    expect(config.event_endpoint).toBe('https://projection.example.test/api/nars/authority/sessions/cf_session_1/events');
    expect(config.input_endpoint).toBe('https://projection.example.test/api/nars/authority/sessions/cf_session_1/input');
    expect(config.health_endpoint).toBe('https://projection.example.test/api/nars/authority/sessions/cf_session_1/health');
    expect(config.event_endpoint).not.toContain('127.0.0.1');
  });
});
