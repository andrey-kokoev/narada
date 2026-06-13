import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDurabilityCoherenceLiveText,
  parseDurabilityCoherenceLiveArgs,
  runDurabilityCoherenceLive,
} from './cloudflare-carrier-durability-coherence-live.mjs';

test('durability coherence parse accepts operator-session-file and repeated sites', () => {
  const config = parseDurabilityCoherenceLiveArgs([
    '--url', 'https://worker.example',
    '--site', 'site_alpha',
    '--site', 'site_beta',
    '--operator-session-file', 'D:\\code\\narada\\.narada\\auth\\cloudflare-operator-session.json',
    '--format', 'text',
  ]);

  assert.equal(config.workerUrl, 'https://worker.example');
  assert.deepEqual(config.siteIds, ['site_alpha', 'site_beta']);
  assert.equal(config.operatorSessionFile, 'D:\\code\\narada\\.narada\\auth\\cloudflare-operator-session.json');
  assert.equal(config.format, 'text');
});

test('durability coherence returns ok for reconstructable durable sites and operations', async () => {
  const result = await runDurabilityCoherenceLive(
    {
      workerUrl: 'https://worker.example',
      siteIds: ['site_alpha'],
      auth: { kind: 'operator_session', value: 'session-fixture', source: 'operator-session-file' },
      tokenFile: null,
      operatorSessionFile: 'cloudflare-operator-session.json',
    },
    {
      runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
        'site.list': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { route_next_action: 'monitor_sites' },
          response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
        },
        'site.read:site_alpha': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { persistence_state: 'durable', recovery_state: 'reconstructable' },
        },
        'operation.list:site_alpha': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { operation_count: 1, route_target: 'operation_alpha' },
        },
        'operation.read:site_alpha:operation_alpha': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { recovery_state: 'reconstructable', recovery_gap_count: 0, recovery_gap_keys: [] },
        },
        'operation.recovery:site_alpha:operation_alpha': {
          schema: 'narada.cloudflare_carrier.operation_recovery_read.v1',
          summary: { recovery_state: 'reconstructable', recovery_gap_count: 0, recovery_gap_keys: [] },
        },
      })),
    },
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.issues.length, 0);
  assert.equal(result.sites[0].selected_operation_id, 'operation_alpha');
});

test('durability coherence preserves operator-session-file auth for child scripts', async () => {
  const seen = [];
  await runDurabilityCoherenceLive(
    {
      workerUrl: 'https://worker.example',
      siteIds: ['site_alpha'],
      auth: { kind: 'operator_session', value: 'session-fixture', source: 'operator-session-file' },
      tokenFile: null,
      operatorSessionFile: 'D:\\code\\narada\\.narada\\auth\\cloudflare-operator-session.json',
    },
    {
      runNodeScript: async (args) => {
        seen.push(args);
        return JSON.stringify(mockResponse(args, {
          'site.list': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { route_next_action: 'monitor_sites' },
            response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
          },
          'site.read:site_alpha': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { persistence_state: 'durable', recovery_state: 'reconstructable' },
          },
          'operation.list:site_alpha': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { operation_count: 1, route_target: 'operation_alpha' },
          },
          'operation.read:site_alpha:operation_alpha': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { recovery_state: 'reconstructable', recovery_gap_count: 0, recovery_gap_keys: [] },
          },
          'operation.recovery:site_alpha:operation_alpha': {
            schema: 'narada.cloudflare_carrier.operation_recovery_read.v1',
            summary: { recovery_state: 'reconstructable', recovery_gap_count: 0, recovery_gap_keys: [] },
          },
        }));
      },
    },
  );

  assert.ok(seen.every((args) => args.includes('--operator-session-file')));
});

test('durability coherence fails on recovery mismatch and site persistence drift', async () => {
  const result = await runDurabilityCoherenceLive(
    {
      workerUrl: 'https://worker.example',
      siteIds: ['site_alpha'],
      auth: { kind: 'operator_session', value: 'session-fixture', source: 'operator-session-file' },
      tokenFile: null,
      operatorSessionFile: 'cloudflare-operator-session.json',
    },
    {
      runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
        'site.list': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { route_next_action: 'monitor_sites' },
          response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
        },
        'site.read:site_alpha': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { persistence_state: 'degraded', recovery_state: 'reconstructable' },
        },
        'operation.list:site_alpha': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { operation_count: 1, route_target: 'operation_alpha' },
        },
        'operation.read:site_alpha:operation_alpha': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { recovery_state: 'reconstructable', recovery_gap_count: 0, recovery_gap_keys: [] },
        },
        'operation.recovery:site_alpha:operation_alpha': {
          schema: 'narada.cloudflare_carrier.operation_recovery_read.v1',
          summary: { recovery_state: 'degraded', recovery_gap_count: 2, recovery_gap_keys: ['session_snapshot'] },
        },
      })),
    },
  );

  assert.equal(result.status, 'failed');
  assert.deepEqual(
    result.issues.map((current) => current.code),
    [
      'site_persistence_not_durable',
      'operation_recovery_not_reconstructable',
      'operation_recovery_gaps_present',
      'operation_recovery_state_mismatch',
      'operation_recovery_gap_count_mismatch',
    ],
  );
  assert.match(formatDurabilityCoherenceLiveText(result), /Durability Coherence: failed/);
});

test('durability coherence retries once on transient fetch failure from child read', async () => {
  const attempts = new Map();
  const result = await runDurabilityCoherenceLive(
    {
      workerUrl: 'https://worker.example',
      siteIds: ['site_alpha'],
      auth: { kind: 'operator_session', value: 'session-fixture', source: 'operator-session-file' },
      tokenFile: null,
      operatorSessionFile: 'cloudflare-operator-session.json',
    },
    {
      runNodeScript: async (args) => {
        const key = args.join(' ');
        attempts.set(key, (attempts.get(key) ?? 0) + 1);
        if (args.includes('--operation') && args.includes('site.read') && attempts.get(key) === 1) {
          const error = new Error('fetch failed');
          error.stderr = '{\n  "ok": false,\n  "code": "fetch failed"\n}\n';
          throw error;
        }
        return JSON.stringify(mockResponse(args, {
          'site.list': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { route_next_action: 'monitor_sites' },
            response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
          },
          'site.read:site_alpha': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { persistence_state: 'durable', recovery_state: 'reconstructable' },
          },
          'operation.list:site_alpha': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { operation_count: 1, route_target: 'operation_alpha' },
          },
          'operation.read:site_alpha:operation_alpha': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { recovery_state: 'reconstructable', recovery_gap_count: 0, recovery_gap_keys: [] },
          },
          'operation.recovery:site_alpha:operation_alpha': {
            schema: 'narada.cloudflare_carrier.operation_recovery_read.v1',
            summary: { recovery_state: 'reconstructable', recovery_gap_count: 0, recovery_gap_keys: [] },
          },
        }));
      },
    },
  );

  assert.equal(result.status, 'ok');
});

function mockResponse(args, responses) {
  const key = classifyArgs(args);
  const response = responses[key];
  assert.ok(response, `missing mock response for ${key}`);
  return response;
}

function classifyArgs(args) {
  if (args.some((arg) => String(arg).endsWith('cloudflare-carrier-operation-recovery-read.mjs'))) {
    return `operation.recovery:${valueAfter(args, '--site')}:${valueAfter(args, '--operation-id')}`;
  }
  const operation = valueAfter(args, '--operation');
  if (operation === 'site.list') return 'site.list';
  if (operation === 'site.read') return `site.read:${valueAfter(args, '--site')}`;
  if (operation === 'operation.list') return `operation.list:${valueAfter(args, '--site')}`;
  if (operation === 'operation.read') return `operation.read:${valueAfter(args, '--site')}:${valueAfter(args, '--operation-id')}`;
  throw new Error(`unexpected_args:${args.join(' ')}`);
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}
