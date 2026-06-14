import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatProviderLivenessRefreshText,
  parseProviderLivenessRefreshArgs,
  runProviderLivenessRefresh,
} from './cloudflare-carrier-provider-liveness-refresh.mjs';

test('parseProviderLivenessRefreshArgs supports operator session auth and text format', () => {
  const parsed = parseProviderLivenessRefreshArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatProviderLivenessRefreshText emits downstream reads', () => {
  const text = formatProviderLivenessRefreshText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    local_root: { path: 'D:/site_alpha', state: 'directory_available', ok: true },
    refresh_source: { provider_refresh_trigger: 'operator_refresh_unspecified', scheduler_task_name: null, scheduler_interval_minutes: null },
    provider_count: 2,
    providers: [
      { provider: 'local_ingress', status: 'ready', http_status: 200 },
      { provider: 'repository_publication', status: 'ready', http_status: 200 },
    ],
  });

  assert.match(text, /Provider Liveness Refresh: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Local Ingress Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:provider-liveness:text/);
  assert.match(text, /Repository Publication Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider-liveness:text/);
});

test('runProviderLivenessRefresh returns summarized provider state with operator session auth', async () => {
  const result = await runProviderLivenessRefresh({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    localRoot: process.cwd(),
    refreshTrigger: 'operator_refresh_unspecified',
    schedulerTaskName: null,
    schedulerIntervalMinutes: null,
    includeLocalIngress: true,
    includeRepository: true,
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'local_ingress.provider_heartbeat.put') {
        return responseJson(200, {
          ok: true,
          direct_cloudflare_filesystem_mutation_admission: body.params.direct_cloudflare_filesystem_mutation_admission,
          repository_publication_admission: body.params.repository_publication_admission,
          heartbeat: { ...body.params, status: 'ready' },
        });
      }
      if (body.operation === 'repository_publication.provider_heartbeat.put') {
        return responseJson(200, {
          ok: true,
          heartbeat: { ...body.params, status: 'ready' },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}:${body.request_id}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.provider_count, 2);
  assert.equal(result.providers[0].provider, 'local_ingress');
  assert.equal(result.providers[1].provider, 'repository_publication');
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
