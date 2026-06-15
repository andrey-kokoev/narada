import assert from 'node:assert/strict';
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  createSiteContinuityBinding,
  createSiteContinuityExchangePacket,
  SITE_CONTINUITY_EMBODIMENT_KINDS,
} from '../../site-continuity/src/site-continuity.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-site-continuity-sync.mjs', import.meta.url));
const SCRIPT_CWD = fileURLToPath(new URL('..', import.meta.url));
const execFile = promisify(execFileCallback);

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
  const requestHeaders = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
    requests.push(body);
    requestHeaders.push({
      authorization: request.headers.authorization ?? null,
      cookie: request.headers.cookie ?? null,
    });
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
        requestHeaders,
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
  assert.match(result.stdout, /reconciliation-execution-put/);
  assert.match(result.stdout, /sync-once/);
  assert.match(result.stdout, /repository-publication-execute-pending/);
  assert.match(result.stdout, /repository-publication-evidence-put/);
  assert.match(result.stdout, /operator-session-file/);
  assert.match(result.stdout, /--format json\|text/);
});

test('site continuity sync accepts operator session auth for Cloudflare transport', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'cloudflare-test-cursor',
      },
    ],
  });
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'site.read') {
      return {
        body: {
          ok: true,
          site_continuity: { exchange_packet: packet },
        },
      };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runSync(['pull-cloudflare', '--site', 'site_fixture', '--url', mock.url], {
      env: {
        CLOUDFLARE_CARRIER_TOKEN: '',
        CLOUDFLARE_OPERATOR_SESSION_COOKIE: 'narada_operator_session=session-fixture',
      },
    });

    assert.equal(result.code, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.auth_source, 'env:CLOUDFLARE_OPERATOR_SESSION_COOKIE');
    assert.equal(mock.requestHeaders.length, 1);
    assert.equal(mock.requestHeaders[0].authorization, null);
    assert.equal(mock.requestHeaders[0].cookie, 'narada_operator_session=session-fixture');
  } finally {
    await mock.close();
  }
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

test('site continuity sync refuses packet site mismatch before network', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_packet' });
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
  });

  const pushResult = await runSync(['push-cloudflare', '--site', 'site_other'], {
    input: JSON.stringify({ packet }),
  });
  assert.equal(pushResult.code, 1);
  assert.equal(pushResult.stdout, '');
  const pushBody = JSON.parse(pushResult.stderr);
  assert.equal(pushBody.ok, false);
  assert.equal(pushBody.code, 'site_continuity_push_site_id_mismatch');
  assert.equal(pushBody.site_id, 'site_other');
  assert.equal(pushBody.packet_site_id, 'site_packet');

  const syncResult = await runSync(['sync-once', '--site', 'site_other'], {
    input: JSON.stringify({ packet }),
  });
  assert.equal(syncResult.code, 1);
  assert.equal(syncResult.stdout, '');
  const syncBody = JSON.parse(syncResult.stderr);
  assert.equal(syncBody.ok, false);
  assert.equal(syncBody.code, 'site_continuity_sync_once_site_id_mismatch');
  assert.equal(syncBody.site_id, 'site_other');
  assert.equal(syncBody.packet_site_id, 'site_packet');
});

test('site continuity sync pulls Cloudflare exchange packet before local import', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    decisions: [
      {
        action: 'refuse',
        reason: 'site_continuity_cross_embodiment_mutation_execution_refused',
        exchange_class: 'cross_embodiment_mutation_execution',
      },
    ],
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'cloudflare-test-cursor',
      },
    ],
  });
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'site.read') {
      return {
        body: {
          ok: true,
          site_continuity: { exchange_packet: packet },
        },
      };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runSync(['pull-cloudflare', '--site', 'site_fixture', '--url', mock.url]);

    assert.equal(result.code, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.schema, 'narada.site_continuity_cloudflare_pull.v1');
    assert.equal(body.status, 'ok');
    assert.equal(body.site_id, 'site_fixture');
    assert.equal(body.auth_source, 'env:CLOUDFLARE_CARRIER_TOKEN');
    assert.equal(body.site_continuity_packet_admission.action, 'projection_only');
    assert.equal(body.site_continuity_packet_admission.reason, 'site_continuity_exchange_packet_projection_admitted');
    assert.equal(body.packet.packet_id, packet.packet_id);
    assert.equal(body.packet.source_embodiment_kind, SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER);
    assert.equal(body.packet.target_embodiment_kind, SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS);
    assert.ok(body.packet.decisions.some((decision) => (
      decision.action === 'refuse'
      && decision.reason === 'site_continuity_cross_embodiment_mutation_execution_refused'
      && decision.exchange_class === 'cross_embodiment_mutation_execution'
    )));
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].operation, 'site.read');
    assert.equal(mock.requests[0].params.site_id, 'site_fixture');
  } finally {
    await mock.close();
  }
});

test('site continuity sync cycle pushes local packet and returns Cloudflare packet', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const localPacket = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'local-sync-cursor',
      },
    ],
  });
  const cloudflarePacket = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    decisions: [
      {
        action: 'refuse',
        reason: 'site_continuity_cross_embodiment_mutation_execution_refused',
        exchange_class: 'cross_embodiment_mutation_execution',
      },
    ],
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'cloudflare-sync-cursor',
      },
    ],
  });
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'site.continuity.packet.put') {
      return { body: {
        ok: true,
        status: 'imported',
        packet_record: {
          packet_id: body.params.packet.packet_id,
          imported_at: '2026-06-11T09:00:00.000Z',
          durability_action: 'refreshed_existing_packet',
          previous_imported_at: '2026-06-11T08:59:00.000Z',
        },
      } };
    }
    if (body.operation === 'site.read') {
      return {
        body: {
          ok: true,
          site_continuity: { exchange_packet: cloudflarePacket },
        },
      };
    }
    if (body.operation === 'site.continuity.loop.report.put') {
      return { body: { ok: true, status: 'recorded', report_record: body.params.report } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-sync-out-'));
  const outputPath = join(root, 'nested', 'cloudflare-sync-last.json');
  const inboundDirectory = join(root, 'inbound');
  try {
    const result = await runSync(['sync-once', '--site', 'site_fixture', '--url', mock.url, '--out', outputPath, '--local-inbound-dir', inboundDirectory], {
      input: JSON.stringify({ packet: localPacket }),
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    const body = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(body.schema, 'narada.site_continuity_cloudflare_sync_once.v1');
    assert.equal(body.status, 'ok');
    assert.equal(body.site_id, 'site_fixture');
    assert.equal(body.local_packet_admission.action, 'projection_only');
    assert.equal(body.cloudflare_packet_admission.action, 'projection_only');
    assert.equal(body.pushed_packet_id, localPacket.packet_id);
    assert.equal(body.pulled_packet_id, cloudflarePacket.packet_id);
    assert.equal(body.local_to_cloudflare_recorded, true);
    assert.equal(body.cloudflare_to_local_windows_returned, true);
    assert.equal(body.cloudflare_to_local_windows_local_artifact_written, true);
    assert.equal(body.continuity_loop_report_recorded, true);
    assert.equal(body.continuity_loop_report_local_artifact_written, true);
    assert.equal(body.local_inbound_artifact.schema, 'narada.site_continuity_cloudflare_to_local_windows_inbound_packet.v1');
    assert.equal(body.local_inbound_artifact.status, 'ok');
    assert.equal(body.local_inbound_artifact.written, true);
    assert.equal(body.local_inbound_artifact.site_id, 'site_fixture');
    assert.equal(body.local_inbound_artifact.packet_id, cloudflarePacket.packet_id);
    assert.equal(body.local_inbound_artifact.packet_source_embodiment_kind, SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER);
    assert.equal(body.local_inbound_artifact.packet_target_embodiment_kind, SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS);
    const inboundArtifact = JSON.parse(await readFile(body.local_inbound_artifact.artifact_path, 'utf8'));
    assert.equal(inboundArtifact.schema, 'narada.site_continuity_cloudflare_to_local_windows_inbound_packet.v1');
    assert.equal(inboundArtifact.packet.packet_id, cloudflarePacket.packet_id);
    assert.equal(inboundArtifact.filesystem_mutation_admission, 'local_inbound_packet_artifact_write_only');
    assert.equal(body.continuity_loop_report_artifact.schema, 'narada.site_continuity_cloudflare_loop_report_local_artifact.v1');
    assert.equal(body.continuity_loop_report_artifact.status, 'ok');
    assert.equal(body.continuity_loop_report_artifact.written, true);
    assert.equal(body.continuity_loop_report_artifact.site_id, 'site_fixture');
    assert.equal(body.continuity_loop_report.schema, 'narada.site_continuity_productized_loop.v1');
    assert.match(body.continuity_loop_report.loop_report_id, /^site-continuity-loop:site_fixture:/);
    assert.equal(body.continuity_loop_report_artifact.continuity_loop_report_id, body.continuity_loop_report.loop_report_id);
    const loopReportArtifact = JSON.parse(await readFile(body.continuity_loop_report_artifact.artifact_path, 'utf8'));
    assert.equal(loopReportArtifact.schema, 'narada.site_continuity_cloudflare_loop_report_local_artifact.v1');
    assert.equal(loopReportArtifact.continuity_loop_report.loop_report_id, body.continuity_loop_report.loop_report_id);
    assert.equal(loopReportArtifact.filesystem_mutation_admission, 'local_continuity_loop_report_artifact_write_only');
    assert.equal(body.continuity_loop_report.site_id, 'site_fixture');
    assert.equal(body.continuity_loop_report.status, 'ok');
    assert.equal(body.continuity_loop_report.cloudflare_push.status, 'imported');
    assert.equal(body.continuity_loop_report.cloudflare_push.pushed_packet_id, localPacket.packet_id);
    assert.equal(body.continuity_loop_report.cloudflare_push.returned_packet_id, cloudflarePacket.packet_id);
    assert.equal(body.continuity_loop_report.cloudflare_push.durability_action, 'refreshed_existing_packet');
    assert.equal(body.continuity_loop_report.cloudflare_push.imported_at, '2026-06-11T09:00:00.000Z');
    assert.equal(body.continuity_loop_report.cloudflare_push.previous_imported_at, '2026-06-11T08:59:00.000Z');
    assert.equal(body.continuity_loop_report.cloudflare_push.packet_record.packet_id, localPacket.packet_id);
    assert.equal(body.continuity_loop_report.windows_packet_count, 1);
    assert.equal(body.continuity_loop_report.authority_boundary.executable_cross_embodiment_mutation, 'refused_by_site_continuity_classifier');
    assert.equal(body.packet.packet_id, cloudflarePacket.packet_id);
    assert.equal(mock.requests.length, 3);
    assert.equal(mock.requests[0].operation, 'site.continuity.packet.put');
    assert.equal(mock.requests[0].params.site_id, 'site_fixture');
    assert.equal(mock.requests[0].params.packet.packet_id, localPacket.packet_id);
    assert.equal(mock.requests[1].operation, 'site.read');
    assert.equal(mock.requests[1].params.site_id, 'site_fixture');
    assert.equal(mock.requests[2].operation, 'site.continuity.loop.report.put');
    assert.equal(mock.requests[2].params.site_id, 'site_fixture');
    assert.equal(mock.requests[2].params.report.schema, 'narada.site_continuity_productized_loop.v1');
  } finally {
    await mock.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity read-cloudflare emits operator text handoff when using operator session file', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'cloudflare-read-text-cursor',
      },
    ],
  });
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'site.read') {
      return {
        body: {
          ok: true,
          site_continuity: { exchange_packet: packet },
          site_continuity_packets: [packet],
        },
      };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-read-text-'));
  const sessionFile = join(root, 'operator-session.json');
  try {
    await writeFile(sessionFile, JSON.stringify({ cookie: 'narada_operator_session=session-fixture' }), 'utf8');
    const result = await runSync([
      'read-cloudflare',
      '--site', 'site_fixture',
      '--url', mock.url,
      '--operator-session-file', sessionFile,
      '--format', 'text',
    ], {
      env: {
        CLOUDFLARE_CARRIER_TOKEN: '',
        CLOUDFLARE_OPERATOR_SESSION_COOKIE: '',
      },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Site Continuity Sync/);
    assert.match(result.stdout, /Command: read-cloudflare/);
    assert.match(result.stdout, /Exchange Packet:/);
    assert.match(result.stdout, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
    assert.match(result.stdout, /Operation List: pnpm --filter @narada2\/cloudflare-carrier product:operation:list:text/);
    assert.match(result.stdout, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url \S+ --site site_fixture --operator-session-file \S+ --execute-site-next/);
    assert.match(result.stdout, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url \S+ --site site_fixture --operator-session-file \S+/);
    assert.match(result.stdout, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url \S+ --site site_fixture --operator-session-file \S+/);
  } finally {
    await mock.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity sync-once emits operator text handoff when using operator session file', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const localPacket = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'local-sync-text-cursor',
      },
    ],
  });
  const cloudflarePacket = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'cloudflare-sync-text-cursor',
      },
    ],
  });
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'site.continuity.packet.put') {
      return { body: { ok: true, status: 'imported', packet_record: { packet_id: body.params.packet.packet_id, durability_action: 'refreshed_existing_packet' } } };
    }
    if (body.operation === 'site.read') {
      return { body: { ok: true, site_continuity: { exchange_packet: cloudflarePacket } } };
    }
    if (body.operation === 'site.continuity.loop.report.put') {
      return { body: { ok: true, status: 'recorded' } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-sync-text-'));
  const sessionFile = join(root, 'operator-session.json');
  const inboundDirectory = join(root, 'inbound');
  try {
    await writeFile(sessionFile, JSON.stringify({ cookie: 'narada_operator_session=session-fixture' }), 'utf8');
    const result = await runSync([
      'sync-once',
      '--site', 'site_fixture',
      '--url', mock.url,
      '--operator-session-file', sessionFile,
      '--local-inbound-dir', inboundDirectory,
      '--format', 'text',
    ], {
      input: JSON.stringify({ packet: localPacket }),
      env: {
        CLOUDFLARE_CARRIER_TOKEN: '',
        CLOUDFLARE_OPERATOR_SESSION_COOKIE: '',
      },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Command: sync-once/);
    assert.match(result.stdout, /Push Recorded: yes/);
    assert.match(result.stdout, /Return Observed: yes/);
    assert.match(result.stdout, /Loop Report Artifact: written/);
    assert.match(result.stdout, /Loop Report: site-continuity-loop:site_fixture:/);
    assert.match(result.stdout, /Loop Report Artifact Path: .*site-continuity-loop-report\.json/);
    assert.match(result.stdout, /Durability Action: refreshed_existing_packet/);
    assert.match(result.stdout, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
    assert.match(result.stdout, /Operation List: pnpm --filter @narada2\/cloudflare-carrier product:operation:list:text/);
    assert.match(result.stdout, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url \S+ --site site_fixture --operator-session-file \S+ --execute-site-next/);
    assert.match(result.stdout, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url \S+ --site site_fixture --operator-session-file \S+/);
    assert.match(result.stdout, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url \S+ --site site_fixture --operator-session-file \S+/);
    assert.match(result.stdout, /Loop Report Publish: pnpm --filter @narada2\/cloudflare-carrier product:site-continuity:loop-report:text -- --url \S+ --site site_fixture --operator-session-file \S+ --report-file .*site-continuity-loop-report\.json/);
  } finally {
    await mock.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity sync records reconciliation execution evidence in Cloudflare', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconciliation-put-'));
  const executionPath = join(root, 'reconciliation-execution.json');
  const outputPath = join(root, 'reconciliation-push.json');
  const execution = {
    schema: 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1',
    status: 'completed',
    generated_at: '2026-06-11T12:30:00.000Z',
    persisted_at: '2026-06-11T12:30:01.000Z',
    reconciliation_plan_status: 'ready',
    selected_site_count: 1,
    executed_site_count: 1,
    completed_site_count: 1,
    failed_site_count: 0,
    results: [{ site_id: 'site_fixture', status: 'completed' }],
  };
  await writeFile(executionPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'site.continuity.reconciliation_execution.put') {
      return { body: { ok: true, status: 'recorded', execution_record: { site_id: body.params.site_id, status: body.params.execution.status } } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runSync(['reconciliation-execution-put', '--site', 'site_fixture', '--execution', executionPath, '--url', mock.url, '--out', outputPath]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    const body = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(body.schema, 'narada.site_continuity_cloudflare_reconciliation_execution_push.v1');
    assert.equal(body.status, 'ok');
    assert.equal(body.site_id, 'site_fixture');
    assert.equal(body.reconciliation_execution_recorded, true);
    assert.equal(body.execution_status, 'completed');
    assert.equal(body.cloudflare_response.status, 'recorded');
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].operation, 'site.continuity.reconciliation_execution.put');
    assert.equal(mock.requests[0].params.site_id, 'site_fixture');
    assert.equal(mock.requests[0].params.execution.schema, 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1');
    assert.equal(mock.requests[0].params.execution.completed_site_count, 1);
  } finally {
    await mock.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity reconciliation execution emits operator text handoff when using operator session file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-reconciliation-text-'));
  const executionPath = join(root, 'execution.json');
  const sessionFile = join(root, 'operator-session.json');
  const execution = {
    schema: 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1',
    site_id: 'site_fixture',
    status: 'completed',
    generated_at: '2026-06-14T06:00:00.000Z',
  };
  await writeFile(executionPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  await writeFile(sessionFile, JSON.stringify({ cookie: 'narada_operator_session=session-fixture' }), 'utf8');
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'site.continuity.reconciliation_execution.put') {
      return { body: { ok: true, status: 'recorded' } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runSync([
      'reconciliation-execution-put',
      '--site', 'site_fixture',
      '--execution', executionPath,
      '--url', mock.url,
      '--operator-session-file', sessionFile,
      '--format', 'text',
    ], {
      env: {
        CLOUDFLARE_CARRIER_TOKEN: '',
        CLOUDFLARE_OPERATOR_SESSION_COOKIE: '',
      },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Command: reconciliation-execution-put/);
    assert.match(result.stdout, /Execution Recorded: yes/);
    assert.match(result.stdout, /Execution Status: completed/);
    assert.match(result.stdout, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
    assert.match(result.stdout, /Operation List: pnpm --filter @narada2\/cloudflare-carrier product:operation:list:text/);
  } finally {
    await mock.close();
    await rm(root, { recursive: true, force: true });
  }
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

test('site continuity publication evidence emits operator text handoff when using operator session file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-publication-evidence-text-'));
  const sessionFile = join(root, 'operator-session.json');
  await writeFile(sessionFile, JSON.stringify({ cookie: 'narada_operator_session=session-fixture' }), 'utf8');
  const evidence = {
    repository_publication_request_id: 'repository-publication-request-fixture',
    publication_execution_id: 'repository-publication-execution-fixture',
    repository_ref: 'github:andrey-kokoev/narada',
    branch_ref: 'main',
    source_change_ref: 'git:commit:fixture',
    windows_admission_action: 'refuse',
    publication_status: 'refused',
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: 'not_admitted',
  };
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'repository_publication.evidence.put') {
      return { body: { ok: true, status: 'recorded' } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runSync([
      'repository-publication-evidence-put',
      '--site', 'site_fixture',
      '--url', mock.url,
      '--operator-session-file', sessionFile,
      '--format', 'text',
    ], {
      input: JSON.stringify({ evidence }),
      env: {
        CLOUDFLARE_CARRIER_TOKEN: '',
        CLOUDFLARE_OPERATOR_SESSION_COOKIE: '',
      },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Command: repository-publication-evidence-put/);
    assert.match(result.stdout, /Request: repository-publication-request-fixture/);
    assert.match(result.stdout, /Execution: repository-publication-execution-fixture/);
    assert.match(result.stdout, /Publication Request Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text/);
    assert.match(result.stdout, /Publication Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text/);
  } finally {
    await mock.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity sync executes pending repository publication requests by returning local refusal evidence without implicit push', async () => {
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'repository_publication.request.next') {
      return {
        body: {
          ok: true,
          status: 'selected',
          admission: {
            repository_publication_admission_id: 'repository-publication-admission-fixture',
            admission_action: 'admit',
            repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
          },
          request: {
            repository_publication_request_id: 'repository-publication-request-fixture',
            publication_ref: 'repository-publication:fixture',
            requested_action_ref: 'repository-publication-action:fixture',
            repository_ref: 'github:andrey-kokoev/narada',
            branch_ref: 'main',
            source_change_ref: 'git:commit:fixture-source',
            cloudflare_repository_publication_admission: {
              repository_publication_admission_id: 'repository-publication-admission-fixture',
              admission_action: 'admit',
              repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
            },
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

test('site continuity pending publication execution emits operator text handoff when using operator session file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-continuity-publication-pending-text-'));
  const sessionFile = join(root, 'operator-session.json');
  await writeFile(sessionFile, JSON.stringify({ cookie: 'narada_operator_session=session-fixture' }), 'utf8');
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'repository_publication.request.next') {
      return {
        body: {
          ok: true,
          status: 'selected',
          admission: {
            repository_publication_admission_id: 'repository-publication-admission-fixture',
            admission_action: 'admit',
            repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
          },
          request: {
            repository_publication_request_id: 'repository-publication-request-fixture',
            publication_ref: 'repository-publication:fixture',
            requested_action_ref: 'repository-publication-action:fixture',
            repository_ref: 'github:andrey-kokoev/narada',
            branch_ref: 'main',
            source_change_ref: 'git:commit:fixture-source',
            cloudflare_repository_publication_admission: {
              repository_publication_admission_id: 'repository-publication-admission-fixture',
              admission_action: 'admit',
              repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
            },
            repository_publication_admission: 'pending_windows_publication_admission',
            cloudflare_git_push_admission: 'not_admitted',
            direct_cloudflare_repository_mutation_admission: 'not_admitted',
          },
        },
      };
    }
    if (body.operation === 'repository_publication.evidence.put') {
      return { body: { ok: true, status: 'recorded' } };
    }
    if (body.operation === 'repository_publication.provider_heartbeat.put') {
      return { body: { ok: true, status: 'recorded' } };
    }
    return { status: 400, body: { ok: false, code: 'unexpected_operation' } };
  });
  try {
    const result = await runSync([
      'repository-publication-execute-pending',
      '--site', 'site_fixture',
      '--repo', SCRIPT_CWD,
      '--url', mock.url,
      '--operator-session-file', sessionFile,
      '--format', 'text',
    ], {
      env: {
        CLOUDFLARE_CARRIER_TOKEN: '',
        CLOUDFLARE_OPERATOR_SESSION_COOKIE: '',
      },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Command: repository-publication-execute-pending/);
    assert.match(result.stdout, /Selection: selected requests=1/);
    assert.match(result.stdout, /Publication Request Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text/);
    assert.match(result.stdout, /Publication Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text/);
    assert.match(result.stdout, /Publication Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider-liveness:text/);
  } finally {
    await mock.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('site continuity sync executes pending repository publication requests with explicit Windows push evidence', async () => {
  const fixture = await createPublishableGitFixture();
  const mock = await startCarrierMock((body) => {
    if (body.operation === 'repository_publication.request.next') {
      return {
        body: {
          ok: true,
          status: 'selected',
          admission: {
            repository_publication_admission_id: 'repository-publication-admission-push-fixture',
            admission_action: 'admit',
            repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
          },
          request: {
            repository_publication_request_id: 'repository-publication-request-push-fixture',
            publication_ref: 'repository-publication:push-fixture',
            requested_action_ref: 'repository-publication-action:push-fixture',
            repository_ref: 'github:andrey-kokoev/narada',
            branch_ref: 'main',
            source_change_ref: `git:commit:${fixture.head}`,
            cloudflare_repository_publication_admission: {
              repository_publication_admission_id: 'repository-publication-admission-push-fixture',
              admission_action: 'admit',
              repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
            },
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
    const result = await runSync([
      'repository-publication-execute-pending',
      '--site', 'site_fixture',
      '--repo', fixture.repo,
      '--url', mock.url,
      '--push',
      '--remote', 'origin',
    ]);

    assert.equal(result.code, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.schema, 'narada.repository_publication_cloudflare_pending_execution.v1');
    assert.equal(body.status, 'ok');
    assert.equal(body.push_enabled, true);
    assert.equal(body.request_count, 1);
    assert.equal(body.evidence_recorded_count, 1);
    assert.equal(mock.requests.length, 3);
    assert.equal(mock.requests[1].operation, 'repository_publication.evidence.put');
    const evidence = mock.requests[1].params.source_payload;
    assert.equal(evidence.repository_publication_request_id, 'repository-publication-request-push-fixture');
    assert.equal(evidence.windows_admission_action, 'admit', JSON.stringify(body, null, 2));
    assert.equal(evidence.windows_admission_reason, 'governed_repository_publication_request_admitted');
    assert.equal(evidence.publication_status, 'completed');
    assert.equal(evidence.published_commit_ref, `git:commit:${fixture.head}`);
    assert.equal(evidence.cloudflare_git_push_admission, 'not_admitted');
    assert.equal(evidence.direct_cloudflare_repository_mutation_admission, 'not_admitted');
    const heartbeat = mock.requests[2].params;
    assert.equal(heartbeat.completed_publication_count, 1);
    assert.equal(heartbeat.refused_publication_count, 0);
    assert.equal(heartbeat.resolved_publication_count, 1);
    const remoteHead = await git(fixture.repo, ['ls-remote', fixture.remote, 'refs/heads/main']);
    assert.match(remoteHead.stdout, new RegExp(`^${fixture.head}\\trefs/heads/main`));
  } finally {
    await mock.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createPublishableGitFixture() {
  const root = await mkdtemp(join(tmpdir(), 'narada-repository-publication-'));
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  await git(root, ['init', '--bare', remote]);
  await git(root, ['init', repo]);
  await git(repo, ['checkout', '-b', 'main']);
  await writeFile(join(repo, 'README.md'), 'publication fixture\n', 'utf8');
  await git(repo, ['add', 'README.md']);
  await git(repo, ['-c', 'user.name=Narada Test', '-c', 'user.email=narada-test@example.invalid', 'commit', '-m', 'initial publication fixture']);
  await git(repo, ['remote', 'add', 'origin', remote]);
  const head = (await git(repo, ['rev-parse', 'HEAD'])).stdout.trim();
  return { root, remote, repo, head };
}

async function git(cwd, args) {
  const result = await execFile('git', args, { cwd, timeout: 30000, windowsHide: true });
  return result;
}
