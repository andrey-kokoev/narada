import assert from 'node:assert/strict';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-carrier-provider-liveness-refresh.mjs', import.meta.url));
const SCRIPT_CWD = fileURLToPath(new URL('..', import.meta.url));

function runRefresh(args = [], { env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnTestChild(process.execPath, [SCRIPT_PATH, ...args], {
      cwd: SCRIPT_CWD,
      env: {
        ...process.env,
        CLOUDFLARE_CARRIER_TOKEN: 'test-token',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function startCarrierMock(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    requests.push(body);
    const result = await handler(body, request);
    response.writeHead(result.status ?? 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise((closeResolve, closeReject) => server.close((error) => (error ? closeReject(error) : closeResolve()))),
      });
    });
  });
}

test('provider liveness refresh records local and repository heartbeats without claiming mutation authority', async () => {
  const localRoot = await mkdtemp(join(tmpdir(), 'narada-provider-liveness-'));
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'local_ingress.provider_heartbeat.put') {
      return {
        body: {
          ok: true,
          direct_cloudflare_filesystem_mutation_admission: body.params.direct_cloudflare_filesystem_mutation_admission,
          repository_publication_admission: body.params.repository_publication_admission,
          heartbeat: body.params,
        },
      };
    }
    if (body.operation === 'repository_publication.provider_heartbeat.put') {
      return { body: { ok: true, heartbeat: body.params } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runRefresh(['--url', mock.url, '--site', 'site_fixture', '--local-root', localRoot]);

    assert.equal(result.code, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.schema, 'narada.cloudflare_carrier.provider_liveness_refresh.v1');
    assert.equal(body.status, 'ok');
    assert.equal(body.site_id, 'site_fixture');
    assert.equal(body.local_root.ok, true);
    assert.equal(body.provider_count, 2);
    assert.equal(mock.requests.length, 2);
    assert.equal(mock.requests[0].operation, 'local_ingress.provider_heartbeat.put');
    assert.equal(mock.requests[1].operation, 'repository_publication.provider_heartbeat.put');

    const localIngressHeartbeat = mock.requests[0].params;
    assert.equal(localIngressHeartbeat.status, 'ready');
    assert.equal(localIngressHeartbeat.provider_authority, 'windows_local_ingress_executor');
    assert.equal(localIngressHeartbeat.provider_refresh_trigger, 'operator_refresh_unspecified');
    assert.equal(localIngressHeartbeat.scheduler_task_name, null);
    assert.equal(localIngressHeartbeat.scheduler_interval_minutes, null);
    assert.equal(localIngressHeartbeat.direct_cloudflare_filesystem_mutation_admission, 'not_admitted');
    assert.equal(localIngressHeartbeat.repository_publication_admission, 'not_admitted');
    assert.equal(localIngressHeartbeat.completed_execution_count, 0);
    assert.equal(localIngressHeartbeat.resolved_execution_count, 0);

    const repositoryHeartbeat = mock.requests[1].params;
    assert.equal(repositoryHeartbeat.status, 'ready');
    assert.equal(repositoryHeartbeat.provider_authority, 'windows_repository_publication_executor');
    assert.equal(repositoryHeartbeat.provider_refresh_trigger, 'operator_refresh_unspecified');
    assert.equal(repositoryHeartbeat.scheduler_task_name, null);
    assert.equal(repositoryHeartbeat.scheduler_interval_minutes, null);
    assert.equal(repositoryHeartbeat.cloudflare_git_push_admission, 'not_admitted');
    assert.equal(repositoryHeartbeat.direct_cloudflare_repository_mutation_admission, 'not_admitted');
    assert.equal(repositoryHeartbeat.completed_publication_count, 0);
    assert.equal(repositoryHeartbeat.resolved_publication_count, 0);
  } finally {
    await mock.close();
    await rm(localRoot, { recursive: true, force: true });
  }
});

test('provider liveness refresh can refresh only local ingress', async () => {
  const localRoot = await mkdtemp(join(tmpdir(), 'narada-provider-liveness-local-'));
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'local_ingress.provider_heartbeat.put') {
      return {
        body: {
          ok: true,
          direct_cloudflare_filesystem_mutation_admission: body.params.direct_cloudflare_filesystem_mutation_admission,
          repository_publication_admission: body.params.repository_publication_admission,
          heartbeat: body.params,
        },
      };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runRefresh(['--url', mock.url, '--site', 'site_fixture', '--local-root', localRoot, '--skip-repository']);

    assert.equal(result.code, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, 'ok');
    assert.equal(body.provider_count, 1);
    assert.equal(body.providers[0].provider, 'local_ingress');
    assert.equal(body.refresh_source.provider_refresh_trigger, 'operator_refresh_unspecified');
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].operation, 'local_ingress.provider_heartbeat.put');
  } finally {
    await mock.close();
    await rm(localRoot, { recursive: true, force: true });
  }
});
