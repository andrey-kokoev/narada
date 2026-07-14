import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteTelemetryPublishCommand, siteTelemetryPullCommand } from '../../src/commands/site-telemetry.js';

function tempJson(name: string, value: unknown): string {
  const parent = tmpdir();
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'narada-site-telemetry-'));
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

function edgeFile(): string {
  return tempJson('edge.json', {
    schema: 'narada.site_telemetry.publication_edge.v0',
    edge_id: 'pubedge_test',
    publisher_site_id: 'narada-proper',
    owning_site_id: 'andrey-user',
    surface_id: 'surface_user-site-telemetry_awareness',
    surface_endpoint: { kind: 'https', url: 'https://registry.example' },
    accepted_event_families: ['site_health'],
    capability_refs: { publish: 'capability:publish' },
    secret_resolver_policy: {
      resolver_ref: 'test-resolver',
      stores_raw_secret_values: false,
      edge_record_contains_raw_secret_values: false,
    },
    trust_posture: { status: 'trusted', basis: 'fixture' },
    revocation_posture: { status: 'not_revoked' },
    rotation_posture: { credential_ref_status: 'fresh' },
    lifecycle_state: 'active',
    preflight_requirements: ['publish_capability_ref_present'],
    authority_limits: ['edge_cannot_grant_site_authority'],
    evidence_refs: ['fixture'],
  });
}

function eventFile(): string {
  return tempJson('event.json', {
    event_id: 'evt_1',
    idempotency_key: 'narada-proper:evt_1',
    source_site_id: 'narada-proper',
    subject_site_id: 'narada-proper',
    family: 'site_health',
    type: 'narada.site.health.snapshot.v0',
    observed_at: '2026-05-16T20:30:00.000Z',
    sent_at: '2026-05-16T20:30:01.000Z',
    payload_summary: { status: 'ok' },
    authority_limits: ['event_is_projection_only'],
  });
}

describe('site telemetry CLI wrappers', () => {
  it('dry-runs publish without network or capability resolution', async () => {
    let fetched = false;
    const result = await siteTelemetryPublishCommand({
      edgeFile: edgeFile(),
      eventFile: eventFile(),
      fetch: (async () => {
        fetched = true;
        throw new Error('should_not_fetch');
      }) as typeof fetch,
      resolveCapability: () => {
        throw new Error('should_not_resolve');
      },
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(result.result)).not.toContain('publish-token');
    expect((result.result as { schema: string }).schema).toBe('narada.site_telemetry.publish_plan.v0');
    expect((result.result as { mode: string }).mode).toBe('dry_run');
    expect((result.result as { network_publish_planned: boolean }).network_publish_planned).toBe(false);
    expect(fetched).toBe(false);
  });

  it('reports missing publish config without network', async () => {
    const result = await siteTelemetryPublishCommand({});

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({
      error: 'site_telemetry_publish_config_missing',
      live_network_performed: false,
      raw_secret_values_recorded: false,
    });
  });

  it('sends a prepared publish request only with explicit send and mocked capability', async () => {
    const requests: Request[] = [];
    const result = await siteTelemetryPublishCommand({
      edgeFile: edgeFile(),
      eventFile: eventFile(),
      send: true,
      resolveCapability: (ref) => {
        expect(ref).toBe('capability:publish');
        return 'publish-token';
      },
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ status: 'accepted' }), { status: 202 });
      }) as typeof fetch,
    });

    expect(result.exitCode).toBe(0);
    expect(requests[0].url).toBe('https://registry.example/webhook');
    expect(requests[0].headers.get('authorization')).toBe('Bearer publish-token');
    expect(JSON.stringify(result.result)).not.toContain('publish-token');
    expect((result.result as { schema: string }).schema).toBe('narada.site_telemetry.run_result.v0');
    expect((result.result as { transport_result: { live_network_performed: boolean } }).transport_result.live_network_performed).toBe(true);
  });

  it('pull preview dry-run avoids network and local mutation', async () => {
    let fetched = false;
    const result = await siteTelemetryPullCommand({
      registryUrl: 'https://registry.example',
      pollCapabilityRef: 'capability:poll',
      finalizeCapabilityRef: 'capability:finalize',
      fetch: (async () => {
        fetched = true;
        throw new Error('should_not_fetch');
      }) as typeof fetch,
      resolveCapability: () => {
        throw new Error('should_not_resolve');
      },
    });

    expect(result.exitCode).toBe(0);
    expect(fetched).toBe(false);
    expect(result.result).toMatchObject({
      schema: 'narada.site_telemetry.pull_plan.v0',
      mode: 'dry_run',
      network_pull_planned: false,
      remote_finalize_planned: false,
      local_admission_result: { local_inbox_mutated: false },
      raw_secret_values_recorded: false,
    });
  });

  it('pull import preview uses mocked fetch and does not finalize without local admission callback', async () => {
    const requests: Request[] = [];
    const result = await siteTelemetryPullCommand({
      registryUrl: 'https://registry.example',
      pollCapabilityRef: 'capability:poll',
      finalizeCapabilityRef: 'capability:finalize',
      importCandidates: true,
      resolveCapability: (ref) => {
        expect(ref).toBe('capability:poll');
        return 'poll-token';
      },
      fetch: (async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      }) as typeof fetch,
    });

    expect(result.exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://registry.example/api/messages/pending');
    expect(requests[0].headers.get('authorization')).toBe('Bearer poll-token');
    expect(JSON.stringify(result.result)).not.toContain('poll-token');
    expect((result.result as { schema: string }).schema).toBe('narada.site_telemetry.run_result.v0');
    expect((result.result as { pull_result: { remote_finalized: boolean } }).pull_result.remote_finalized).toBe(false);
  });
});
