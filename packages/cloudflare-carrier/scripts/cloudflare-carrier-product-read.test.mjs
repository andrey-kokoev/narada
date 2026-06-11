import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  authHeaders,
  formatProductSurfaceText,
  parseProductReadArgs,
  readProductSurface,
  resolveAuth,
  summarizeProductSurface,
} from './cloudflare-carrier-product-read.mjs';

test('parseProductReadArgs builds site.list request with bearer token', () => {
  const parsed = parseProductReadArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--limit', '5',
    '--request-id', 'request_fixture',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'site.list');
  assert.equal(parsed.requestId, 'request_fixture');
  assert.deepEqual(parsed.params, { limit: 5 });
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
});

test('parseProductReadArgs accepts operator text format', () => {
  const parsed = parseProductReadArgs([
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--format', 'text',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('parseProductReadArgs builds site.read operation.list and operation.read params', () => {
  const siteRead = parseProductReadArgs([
    'site.read',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_fixture',
  ], {});
  assert.equal(siteRead.operation, 'site.read');
  assert.deepEqual(siteRead.params, { site_id: 'site_fixture' });

  const operationList = parseProductReadArgs([
    '--operation', 'operation.list',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_fixture',
    '--limit', '3',
  ], {});
  assert.equal(operationList.operation, 'operation.list');
  assert.deepEqual(operationList.params, { site_id: 'site_fixture', limit: 3 });

  const operationRead = parseProductReadArgs([
    '--operation', 'operation.read',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_fixture',
    '--operation-id', 'operation_fixture',
  ], {});
  assert.equal(operationRead.operation, 'operation.read');
  assert.deepEqual(operationRead.params, { site_id: 'site_fixture', operation_id: 'operation_fixture' });
});

test('parseProductReadArgs refuses missing required operation identifiers', () => {
  assert.throws(
    () => parseProductReadArgs(['site.read', '--url', 'https://carrier.example.test', '--token', 'secret-token'], {}),
    /product_read_site\.read_requires_--site/,
  );
  assert.throws(
    () => parseProductReadArgs(['operation.list', '--url', 'https://carrier.example.test', '--token', 'secret-token'], {}),
    /product_read_operation\.list_requires_--site/,
  );
  assert.throws(
    () => parseProductReadArgs(['operation.read', '--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_fixture'], {}),
    /product_read_operation\.read_requires_--operation-id_or_--carrier-operation/,
  );
});

test('resolveAuth accepts captured operator session file without exposing cookie in headers source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'narada-product-read-'));
  const sessionFile = join(dir, 'operator-session.json');
  await writeFile(sessionFile, JSON.stringify({ cookie: 'narada_operator_session=cookie-value; Path=/' }), 'utf8');

  const auth = resolveAuth(['--operator-session-file', sessionFile], {});
  assert.deepEqual(auth, { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' });
  assert.deepEqual(authHeaders(auth), { cookie: 'narada_operator_session=cookie-value' });

  const explicitOperatorAuth = resolveAuth(['--operator-session-file', sessionFile], {
    CLOUDFLARE_CARRIER_TOKEN: 'ambient-token',
  });
  assert.deepEqual(explicitOperatorAuth, { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' });
});

test('readProductSurface posts operation envelope and redacts auth material from result envelope', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          sites: [{ site_id: 'site_alpha' }],
          site_product_overview: {
            site_count: 1,
            next_site_id: 'site_alpha',
            next_health: 'ready',
            next_action: 'monitor_sites',
            health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
          },
        });
      },
    };
  };

  const result = await readProductSurface({
    workerUrl: 'https://carrier.example.test',
    operation: 'site.list',
    requestId: 'request_fixture',
    params: { limit: 10 },
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, fetchImpl);

  assert.equal(calls[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.headers, {
    'content-type': 'application/json',
    authorization: 'Bearer secret-token',
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    operation: 'site.list',
    request_id: 'request_fixture',
    params: { limit: 10 },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    operation: 'site.list',
    site_count: 1,
    next_site_id: 'site_alpha',
    next_health: 'ready',
    next_action: 'monitor_sites',
    health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
  });
});

test('formatProductSurfaceText renders operator-readable summaries without auth material', () => {
  const siteListText = formatProductSurfaceText({
    operation: 'site.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      operation: 'site.list',
      site_count: 2,
      next_site_id: 'site_alpha',
      next_health: 'attention',
      next_action: 'bind_cloudflare_product_next_site_locally',
      health_counts: { ready: 1, attention: 1 },
    },
    auth: { kind: 'bearer', value: 'secret-token' },
  });
  assert.match(siteListText, /Product Read: site\.list/);
  assert.match(siteListText, /Sites: count=2 next=site_alpha health=attention/);
  assert.match(siteListText, /Next Action: bind_cloudflare_product_next_site_locally/);
  assert.equal(siteListText.includes('secret-token'), false);

  const siteReadText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      health: 'ready',
      next_action: 'monitor_sites',
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional',
      continuity_direction_missing: [],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 2,
      continuity_loop_report_count: 1,
      continuity_reconciliation_execution_count: 1,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 2,
      session_count: 3,
    },
  });
  assert.match(siteReadText, /Site: site_alpha \(Alpha Site\)/);
  assert.match(siteReadText, /Durability: persistence=durable recovery=reconstructable/);

  const operationListText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.list',
      site_id: 'site_alpha',
      operation_count: 1,
      active_operation_id: 'operation_live',
      next_operation_id: 'operation_live',
      next_status: 'needs_attention',
      next_action: 'review_operation',
      next_reason: 'operation_needs_review',
    },
  });
  assert.match(operationListText, /Operations: count=1 active=operation_live next=operation_live/);

  const operationReadText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'continuity_packet',
      session_count: 1,
      task_count: 3,
    },
  });
  assert.match(operationReadText, /Lifecycle: phase=inhabited health=attention/);
  assert.match(operationReadText, /Evidence Counts: sessions=1 tasks=3/);
});

test('summarizeProductSurface summarizes site and operation reads', () => {
  assert.deepEqual(summarizeProductSurface('site.read', {
    site: { site_id: 'site_fixture', display_name: 'Fixture Site' },
    site_product_status: {
      health: 'attention',
      next_action: 'return_local_windows_continuity_packet',
      session_count: 2,
      continuity_state: 'packet_observed',
      continuity_direction_state: 'local_windows_to_cloudflare_only',
      continuity_direction_missing: ['cloudflare_to_local_windows'],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      site_continuity_reconciliation_execution_status: { health: 'ready' },
      continuity_packet_count: 2,
      continuity_loop_report_count: 1,
      continuity_reconciliation_execution_count: 1,
    },
    cloudflare_persistence_posture: { state: 'durable' },
    cloudflare_recovery_posture: { state: 'reconstructable' },
    memberships: [{}, {}],
  }), {
    operation: 'site.read',
    site_id: 'site_fixture',
    display_name: 'Fixture Site',
    health: 'attention',
    next_action: 'return_local_windows_continuity_packet',
    continuity_state: 'packet_observed',
    continuity_direction_state: 'local_windows_to_cloudflare_only',
    continuity_direction_missing: ['cloudflare_to_local_windows'],
    continuity_loop_state: 'loop_report_observed',
    continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
    continuity_reconciliation_execution_health: 'ready',
    continuity_packet_count: 2,
    continuity_loop_report_count: 1,
    continuity_reconciliation_execution_count: 1,
    persistence_state: 'durable',
    recovery_state: 'reconstructable',
    membership_count: 2,
    session_count: 2,
  });

  assert.deepEqual(summarizeProductSurface('operation.list', {
    site_id: 'site_fixture',
    operations: [{ site_id: 'site_fixture', operation_id: 'operation_control' }],
    operation_posture_overview: {
      operation_count: 1,
      active_operation_id: 'operation_control',
      next_operation_id: 'operation_control',
      next_status: 'needs_attention',
      next_action: 'review_operation',
      next_reason: 'operation_needs_review',
      health_counts: { ready: 0, needs_attention: 1 },
    },
  }), {
    operation: 'operation.list',
    site_id: 'site_fixture',
    operation_count: 1,
    active_operation_id: 'operation_control',
    next_operation_id: 'operation_control',
    next_status: 'needs_attention',
    next_action: 'review_operation',
    next_reason: 'operation_needs_review',
    health_counts: { ready: 0, needs_attention: 1 },
  });

  assert.deepEqual(summarizeProductSurface('operation.read', {
    operation: { site_id: 'site_fixture', operation_id: 'operation_control' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'attention', next_action: 'continuity_packet', session_count: 1, task_count: 3 },
  }), {
    operation: 'operation.read',
    site_id: 'site_fixture',
    operation_id: 'operation_control',
    phase: 'inhabited',
    health: 'attention',
    next_action: 'continuity_packet',
    session_count: 1,
    task_count: 3,
  });
});
