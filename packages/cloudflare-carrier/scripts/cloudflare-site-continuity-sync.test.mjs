import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createSiteContinuityBinding,
  createSiteContinuityExchangePacket,
  SITE_CONTINUITY_EMBODIMENT_KINDS,
} from '../../site-continuity/src/site-continuity.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-site-continuity-sync.mjs', import.meta.url));
const SCRIPT_CWD = fileURLToPath(new URL('..', import.meta.url));

function runSync(args = [], { input = '', env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      cwd: SCRIPT_CWD,
      env: {
        ...process.env,
        CLOUDFLARE_CARRIER_URL: 'http://127.0.0.1:9',
        CLOUDFLARE_CARRIER_TOKEN: 'test-token',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
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
    child.stdin.end(input);
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

test('site continuity sync help describes supported transports', async () => {
  const result = await runSync(['help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /pull-cloudflare/);
  assert.match(result.stdout, /push-cloudflare/);
  assert.match(result.stdout, /read-cloudflare/);
  assert.match(result.stdout, /repository-publication-execute-pending/);
  assert.match(result.stdout, /repository-publication-evidence-put/);
});

test('site continuity sync refuses malformed packets before push', async () => {
  const result = await runSync(['push-cloudflare'], {
    input: JSON.stringify({ packet: { schema: 'wrong' } }),
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'site_continuity_packet_refused_before_push');
  assert.equal(body.admission.action, 'refuse');
  assert.equal(body.admission.reason, 'site_continuity_exchange_packet_invalid');
  assert.ok(body.admission.validation_errors.includes('site_continuity_exchange_packet_schema_mismatch'));
});

test('site continuity sync refuses executable mutation packets before network', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'local-test-cursor',
      },
    ],
    executable_mutation_requests: [
      {
        mutation_class: 'local_repository_filesystem_mutation',
      },
    ],
  });

  const result = await runSync(['push-cloudflare'], {
    input: JSON.stringify({ packet }),
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'site_continuity_packet_refused_before_push');
  assert.equal(body.admission.action, 'refuse');
  assert.equal(body.admission.reason, 'site_continuity_exchange_packet_executable_mutation_refused');
  assert.ok(body.admission.evidence_required.includes('authority_route_refusal'));
  assert.ok(body.admission.confirmation_required.includes('mutation_requests_not_imported'));
});

test('site continuity sync refuses direct Cloudflare repository publication evidence before network', async () => {
  const result = await runSync(['repository-publication-evidence-put', '--site', 'site_fixture'], {
    input: JSON.stringify({
      evidence: {
        repository_publication_request_id: 'repository-publication-request-fixture',
        publication_execution_id: 'repository-publication-execution-fixture',
        repository_ref: 'github:andrey-kokoev/narada.sonar',
        branch_ref: 'master',
        source_change_ref: 'local-ingress-execution:fixture',
        windows_admission_action: 'admit',
        publication_status: 'completed',
        published_commit_ref: 'git:commit:fixture',
        cloudflare_git_push_admission: 'admitted',
      },
    }),
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'repository_publication_evidence_refused_before_push');
  assert.equal(body.admission.action, 'refuse');
  assert.equal(body.admission.reason, 'repository_publication_evidence_invalid');
  assert.ok(body.admission.validation_errors.includes('repository_publication_evidence_cloudflare_git_push_admission_invalid'));
});

test('site continuity sync executes pending repository publication requests by returning local refusal evidence without implicit push', async () => {
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'repository_publication.request.next') {
      return {
        body: {
          ok: true,
          status: 'selected',
          request: {
            repository_publication_request_id: 'repository-publication-request-fixture',
            publication_ref: 'repository-publication:fixture',
            requested_action_ref: 'repository-publication-action:fixture',
            repository_ref: 'github:andrey-kokoev/narada',
            branch_ref: 'main',
            source_change_ref: 'git:commit:fixture-source',
            repository_publication_admission: 'pending_windows_publication_admission',
            cloudflare_git_push_admission: 'not_admitted',
            direct_cloudflare_repository_mutation_admission: 'not_admitted',
          },
        },
      };
    }
    if (body.operation === 'repository_publication.evidence.put') {
      return { body: { ok: true, status: 'recorded', evidence: body.params.source_payload } };
    }
    if (body.operation === 'repository_publication.provider_heartbeat.put') {
      return { body: { ok: true, status: 'recorded', heartbeat: body.params } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runSync(['repository-publication-execute-pending', '--site', 'site_fixture', '--repo', SCRIPT_CWD, '--url', mock.url]);

    assert.equal(result.code, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.schema, 'narada.repository_publication_cloudflare_pending_execution.v1');
    assert.equal(body.status, 'ok');
    assert.equal(body.request_count, 1);
    assert.equal(body.request_selection_status, 'selected');
    assert.equal(body.evidence_recorded_count, 1);
    assert.equal(body.provider_heartbeat_recorded, true);
    assert.equal(body.results[0].status, 'evidence_recorded');
    assert.equal(mock.requests.length, 3);
    assert.equal(mock.requests[0].operation, 'repository_publication.request.next');
    assert.equal(mock.requests[1].operation, 'repository_publication.evidence.put');
    assert.equal(mock.requests[2].operation, 'repository_publication.provider_heartbeat.put');
    const evidence = mock.requests[1].params.source_payload;
    assert.equal(evidence.repository_publication_request_id, 'repository-publication-request-fixture');
    assert.equal(evidence.windows_admission_action, 'refuse');
    assert.equal(evidence.windows_admission_reason, 'repository_publication_push_not_enabled');
    assert.equal(evidence.publication_status, 'refused');
    assert.equal(evidence.cloudflare_git_push_admission, 'not_admitted');
    assert.equal(evidence.direct_cloudflare_repository_mutation_admission, 'not_admitted');
    const heartbeat = mock.requests[2].params;
    assert.equal(heartbeat.site_id, 'site_fixture');
    assert.equal(heartbeat.provider_authority, 'windows_repository_publication_executor');
    assert.equal(heartbeat.status, 'ready');
    assert.equal(heartbeat.iteration_count, 1);
    assert.equal(heartbeat.refused_publication_count, 1);
    assert.equal(heartbeat.resolved_publication_count, 1);
    assert.equal(heartbeat.cloudflare_git_push_admission, 'not_admitted');
    assert.equal(heartbeat.direct_cloudflare_repository_mutation_admission, 'not_admitted');
  } finally {
    await mock.close();
  }
});
