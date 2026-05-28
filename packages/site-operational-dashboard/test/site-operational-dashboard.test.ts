import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildSiteRegistryProjectionSection,
  createDashboardServer,
  escapeHtml,
  renderDashboardHtml,
  safeJsonForHtml,
  summarizeDashboardSections,
  validateDashboardSnapshot,
  type DashboardSnapshot,
} from '../src/index.js';

const relationFixture = JSON.parse(
  readFileSync(new URL('../../site-registry-cloudflare/fixtures/relation-lifecycle-smoke.v0.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    schema: 'narada.site_operational_dashboard.snapshot.v0',
    snapshot_id: 'dash_fixture_1',
    generated_at: '2026-05-17T12:00:00.000Z',
    title: 'Operational Posture',
    subtitle: 'Reusable dashboard fixture',
    sections: [
      {
        id: 'runtime',
        title: 'Runtime',
        summary: 'Current runtime observations',
        rows: [
          {
            id: 'daemon',
            label: 'Daemon health',
            state: 'ok',
            basis: 'Heartbeat received inside freshness threshold.',
            observed_at: '2026-05-17T11:59:00.000Z',
            freshness: { status: 'fresh', basis: 'observed_at_within_threshold' },
            evidence_refs: [{ ref: 'event:daemon-health', label: 'daemon health event' }],
            evidence_paths: ['.ai/evidence/daemon-health.json'],
            next_action: 'continue_observation',
            detail: { pid_seen: true, checks: ['heartbeat', 'queue'] },
            authority_limits: ['dashboard_is_projection_only'],
          },
          {
            id: 'queue',
            label: 'Queue pressure',
            state: 'attention',
            basis: 'Backlog exceeds local threshold.',
            next_action: 'inspect_admitted_queue',
            detail: { pending: 4 },
            authority_limits: ['dashboard_does_not_mutate_queue'],
          },
        ],
      },
      {
        id: 'handoffs',
        title: 'Handoffs',
        rows: [
          {
            id: 'review',
            label: 'Review handoff',
            state: 'blocked',
            basis: 'Reviewer evidence missing.',
            next_action: 'route_review_request',
            detail: 'Waiting on review result',
          },
        ],
      },
    ],
    authority_limits: [
      'dashboard_cannot_assign_work',
      'dashboard_cannot_grant_capability',
      'dashboard_cannot_mutate_site_state',
    ],
    evidence_refs: ['fixture:dashboard'],
    ...overrides,
  };
}

describe('site operational dashboard renderer', () => {
  it('escapes HTML in visible rows and embeds safe bounded JSON', () => {
    const html = renderDashboardHtml(snapshot({
      title: '<script>alert("x")</script>',
      sections: [
        {
          id: 'unsafe',
          title: 'Unsafe <Title>',
          rows: [
            {
              id: 'row-1',
              label: '<img src=x onerror=alert(1)>',
              state: 'warning',
              basis: 'Observed <b>markup</b> and closing script marker.',
              detail: { marker: '</script><script>alert(1)</script>' },
            },
          ],
        },
      ],
    }));

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('<script id="dashboard-data" type="application/json">');
    expect(html).toContain('\\u003c/script\\u003e');
  });

  it('renders object details as JSON instead of leaking [object Object]', () => {
    const html = renderDashboardHtml(snapshot());

    expect(html).not.toContain('[object Object]');
    expect(html).toContain('&quot;pid_seen&quot;:true');
    expect(html).toContain('&quot;pending&quot;:4');
  });

  it('rejects raw secret marker patterns before rendering', () => {
    const invalid = snapshot({
      sections: [
        {
          id: 'secrets',
          title: 'Secrets',
          rows: [
            {
              id: 'token',
              label: 'Token observation',
              state: 'error',
              basis: 'secret_token appeared in a payload summary',
              detail: { redaction_failure: 'api_key' },
            },
          ],
        },
      ],
    });

    const validation = validateDashboardSnapshot(invalid);
    expect(validation.status).toBe('invalid');
    expect(validation.errors).toContain('dashboard_raw_secret_marker_found');
    expect(() => renderDashboardHtml(invalid)).toThrow(/dashboard_raw_secret_marker_found/);
  });

  it('computes section summaries and marks attention rows for filtering', () => {
    const source = snapshot();
    const summaries = summarizeDashboardSections(source);
    const html = renderDashboardHtml(source);

    expect(summaries).toEqual([
      expect.objectContaining({ section_id: 'runtime', total_rows: 2, attention_rows: 1 }),
      expect.objectContaining({ section_id: 'handoffs', total_rows: 1, attention_rows: 1 }),
    ]);
    expect(summaries[0]?.states.ok).toBe(1);
    expect(summaries[0]?.states.attention).toBe(1);
    expect(html).toContain('id="attention-only"');
    expect(html).toContain('data-attention="true"');
    expect(html).toContain('data-state="blocked"');
  });

  it('keeps embedded JSON parseable and bounded', () => {
    const source = snapshot();
    const html = renderDashboardHtml(source);
    const match = html.match(/<script id="dashboard-data" type="application\/json">([^<]*)<\/script>/);
    expect(match?.[1]).toBeDefined();
    const embedded = JSON.parse(match?.[1] ?? '{}') as {
      snapshot: DashboardSnapshot;
      bounds: { embedded_json_bytes: number; raw_secret_markers_found: boolean };
    };

    expect(embedded.snapshot.snapshot_id).toBe('dash_fixture_1');
    expect(embedded.bounds.embedded_json_bytes).toBeGreaterThan(0);
    expect(embedded.bounds.raw_secret_markers_found).toBe(false);
  });

  it('validates required row shape without domain-specific fields', () => {
    const validation = validateDashboardSnapshot({
      schema: 'narada.site_operational_dashboard.snapshot.v0',
      snapshot_id: 'dash_bad',
      generated_at: '2026-05-17T12:00:00.000Z',
      title: 'Bad',
      sections: [
        {
          id: 'section',
          title: 'Section',
          rows: [{ id: 'row', label: 'Row', state: 'not-a-state', basis: '' }],
        },
      ],
    });

    expect(validation.status).toBe('invalid');
    expect(validation.errors).toEqual(expect.arrayContaining([
      'dashboard_section_0_row_0_state_invalid',
      'dashboard_section_0_row_0_basis_required',
    ]));
  });

  it('escapes standalone values and safe JSON for HTML script contexts', () => {
    expect(escapeHtml(`"<&>'`)).toBe('&quot;&lt;&amp;&gt;&#39;');
    expect(safeJsonForHtml({ value: '</script>&' })).toBe('{"value":"\\u003c/script\\u003e\\u0026"}');
  });

  it('serves read-only live HTML and JSON snapshots with attention payload', async () => {
    const contexts: unknown[] = [];
    const server = createDashboardServer({
      siteRoot: '/fixture/site',
      refreshMs: 250,
      now: () => new Date('2026-05-17T12:00:00.000Z'),
      loadSnapshot: (context) => {
        contexts.push(context);
        return snapshot();
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server_address_unavailable');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const html = await fetch(`${baseUrl}/`).then((response) => response.text());
      const jsonResponse = await fetch(`${baseUrl}/snapshot.json`);
      const json = await jsonResponse.json() as {
        schema: string;
        snapshot: DashboardSnapshot;
        attention: Array<{ id: string }>;
        refresh_ms: number;
        site_root: string;
      };
      const post = await fetch(`${baseUrl}/snapshot.json`, { method: 'POST' });

      expect(html).toContain('Site Operational Dashboard');
      expect(jsonResponse.headers.get('cache-control')).toBe('no-store');
      expect(json.schema).toBe('narada.site_operational_dashboard.live_snapshot_response.v0');
      expect(json.snapshot.snapshot_id).toBe('dash_fixture_1');
      expect(json.attention.map((row) => row.id)).toEqual(['queue', 'review']);
      expect(json.refresh_ms).toBe(250);
      expect(json.site_root).toBe('/fixture/site');
      expect(post.status).toBe(405);
      expect(JSON.stringify(json)).not.toMatch(/secret_token|api_key|Bearer\s+/i);
      expect(contexts).toEqual([
        { siteRoot: '/fixture/site', generatedAt: '2026-05-17T12:00:00.000Z', refreshMs: 250 },
        { siteRoot: '/fixture/site', generatedAt: '2026-05-17T12:00:00.000Z', refreshMs: 250 },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('guards sensitive live dashboard reads with operator-entered bearer tokens', async () => {
    const contexts: unknown[] = [];
    const server = createDashboardServer({
      accessToken: 'fixture-access-token',
      tokenStorageKey: 'fixture-dashboard-token',
      siteRoot: '/fixture/site',
      refreshMs: 250,
      now: () => new Date('2026-05-17T12:00:00.000Z'),
      loadSnapshot: (context) => {
        contexts.push(context);
        return snapshot();
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server_address_unavailable');
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const shell = await fetch(`${baseUrl}/`).then((response) => response.text());
      const missing = await fetch(`${baseUrl}/snapshot.json`);
      const wrong = await fetch(`${baseUrl}/api/snapshot`, { headers: { authorization: 'Bearer wrong-token' } });
      const ok = await fetch(`${baseUrl}/api/snapshot`, { headers: { authorization: 'Bearer fixture-access-token' } });
      const okJson = await ok.json() as { snapshot: DashboardSnapshot; authority_limits: string[] };
      const post = await fetch(`${baseUrl}/api/snapshot`, {
        method: 'POST',
        headers: { authorization: 'Bearer fixture-access-token' },
      });
      const refusalText = `${await missing.text()} ${await wrong.text()}`;

      expect(shell).toContain('localStorage.setItem(storageKey, token)');
      expect(shell).toContain('localStorage.removeItem(storageKey)');
      expect(shell).toContain("headers: { authorization: 'Bearer ' + token");
      expect(shell).toContain('fixture-dashboard-token');
      expect(shell).not.toContain('fixture-access-token');
      expect(shell).not.toContain('dash_fixture_1');
      expect(missing.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(missing.headers.get('www-authenticate')).toContain('Bearer');
      expect(refusalText).not.toContain('fixture-access-token');
      expect(refusalText).not.toContain('wrong-token');
      expect(ok.status).toBe(200);
      expect(okJson.snapshot.snapshot_id).toBe('dash_fixture_1');
      expect(okJson.authority_limits).toContain('dashboard_server_is_read_only');
      expect(post.status).toBe(405);
      expect(contexts).toEqual([
        { siteRoot: '/fixture/site', generatedAt: '2026-05-17T12:00:00.000Z', refreshMs: 250 },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('builds Site Registry projection rows from fixture data without live fetch', () => {
    const section = buildSiteRegistryProjectionSection({
      source: relationFixture,
      evidenceRef: 'fixture:relation-lifecycle-smoke',
      now: '2026-05-16T23:55:00.000Z',
      maxFreshAgeSeconds: 900,
    });
    const snapshotWithRegistry = snapshot({ sections: [section] });
    const validation = validateDashboardSnapshot(snapshotWithRegistry);

    expect(validation.status).toBe('valid');
    expect(section.rows.find((row) => row.id === 'site-registry-freshness')?.freshness?.status).toBe('fresh');
    expect(section.rows.find((row) => row.id === 'site-registry-publication-edge')?.state).toBe('attention');
    expect(section.rows.find((row) => row.id === 'site-registry-live-fetch-posture')?.state).toBe('ok');
    expect(section.rows.every((row) => row.authority_limits?.includes('site_registry_rows_are_projection_only'))).toBe(true);
    expect(JSON.stringify(section)).not.toMatch(/Bearer\s+|api_key|secret_token/i);
  });

  it('marks missing and stale Site Registry projections without treating live fetch as default', () => {
    const missing = buildSiteRegistryProjectionSection();
    const stale = buildSiteRegistryProjectionSection({
      source: relationFixture,
      evidenceRef: 'fixture:relation-lifecycle-smoke',
      now: '2026-05-17T01:00:00.000Z',
      maxFreshAgeSeconds: 900,
      liveFetch: { enabled: true, url: 'https://registry.example/api/sites', boundedOutput: true },
    });

    expect(missing.rows.find((row) => row.id === 'site-registry-freshness')?.state).toBe('unknown');
    expect(missing.rows.find((row) => row.id === 'site-registry-live-fetch-posture')?.state).toBe('ok');
    expect(stale.rows.find((row) => row.id === 'site-registry-freshness')?.freshness?.status).toBe('stale');
    expect(stale.rows.find((row) => row.id === 'site-registry-live-fetch-posture')?.state).toBe('attention');
    expect(stale.rows.find((row) => row.id === 'site-registry-live-fetch-posture')?.authority_limits).toContain('live_fetch_requires_explicit_caller_configuration');
  });
});
