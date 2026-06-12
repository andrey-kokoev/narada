import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parsePostureCoherenceLiveArgs,
  runPostureCoherenceLive,
} from './cloudflare-carrier-posture-coherence-live.mjs';

test('parsePostureCoherenceLiveArgs accepts operator session auth and repeated sites', () => {
  const parsed = parsePostureCoherenceLiveArgs([
    '--url', 'https://carrier.example.test',
    '--operator-session-cookie', 'narada_operator_session=session-value',
    '--site', 'site_alpha',
    '--site', 'site_beta',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.deepEqual(parsed.siteIds, ['site_alpha', 'site_beta']);
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'session-value',
    source: 'operator-session-cookie',
  });
});

test('runPostureCoherenceLive reports ok for coherent site and operation posture', async () => {
  const calls = [];
  const result = await runPostureCoherenceLive({
    workerUrl: 'https://carrier.example.test',
    siteIds: [],
    format: 'json',
    auth: { kind: 'operator_session', value: 'session-value', source: 'operator-session-cookie' },
  }, {
    async runNodeScript(args) {
      calls.push(args);
      if (args.includes('site.list')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            route_next_action: 'monitor_sites',
            next_action: 'monitor_sites',
            next_site_id: null,
            health_counts: { ready: 2, attention: 0, incomplete: 0, other: 0 },
          },
          response: {
            site_product_statuses: [
              { site_id: 'site_alpha' },
              { site_id: 'site_beta' },
            ],
          },
        });
      }
      if (args.includes('site.read')) {
        const siteId = args[args.indexOf('--site') + 1];
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_id: siteId,
            health: 'ready',
            next_action: 'monitor_site',
          },
        });
      }
      if (args.includes('operation.list')) {
        const siteId = args[args.indexOf('--site') + 1];
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_id: siteId,
            operation_count: 2,
            next_operation_id: `${siteId}_control`,
            next_action: 'monitor_operations',
            route_next_action: 'monitor_operations',
            route_target: `${siteId}_control`,
            health_counts: { ready: 2, needs_attention: 0 },
          },
          response: {
            focused_operation_lifecycle: {
              operation_id: `${siteId}_control`,
              workflow_route: { next_action: 'monitor_operation' },
            },
          },
        });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.posture_coherence_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.checked_site_ids, ['site_alpha', 'site_beta']);
  assert.equal(calls.length, 5);
});

test('runPostureCoherenceLive preserves operator session file for child product reads', async () => {
  const calls = [];
  const result = await runPostureCoherenceLive({
    workerUrl: 'https://carrier.example.test',
    siteIds: ['site_alpha'],
    format: 'json',
    auth: { kind: 'operator_session', value: 'session-value', source: 'operator-session-file' },
    operatorSessionFile: 'D:\\tmp\\operator-session.json',
    tokenFile: null,
  }, {
    async runNodeScript(args) {
      calls.push(args);
      if (args.includes('site.list')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            route_next_action: 'monitor_sites',
            next_action: 'monitor_sites',
            next_site_id: null,
            health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
          },
          response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
        });
      }
      if (args.includes('site.read')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { site_id: 'site_alpha', health: 'ready', next_action: 'monitor_site' },
        });
      }
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          site_id: 'site_alpha',
          operation_count: 1,
          next_operation_id: 'operation_control',
          next_action: 'monitor_operations',
          route_next_action: 'monitor_operations',
          route_target: 'operation_control',
          health_counts: { ready: 1, needs_attention: 0 },
        },
        response: {
          focused_operation_lifecycle: {
            operation_id: 'operation_control',
            workflow_route: { next_action: 'monitor_operation' },
          },
        },
      });
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(calls[0].includes('--operator-session-file'), true);
  assert.equal(calls[0][calls[0].indexOf('--operator-session-file') + 1], 'D:\\tmp\\operator-session.json');
});

test('runPostureCoherenceLive reports stale operation summary counts against monitor route', async () => {
  const result = await runPostureCoherenceLive({
    workerUrl: 'https://carrier.example.test',
    siteIds: ['site_alpha'],
    format: 'json',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, {
    async runNodeScript(args) {
      if (args.includes('site.list')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            route_next_action: 'monitor_sites',
            next_action: 'monitor_sites',
            next_site_id: null,
            health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
          },
          response: {
            site_product_statuses: [{ site_id: 'site_alpha' }],
          },
        });
      }
      if (args.includes('site.read')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_id: 'site_alpha',
            health: 'ready',
            next_action: 'monitor_site',
          },
        });
      }
      if (args.includes('operation.list')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_id: 'site_alpha',
            operation_count: 5,
            next_operation_id: 'operation_control',
            next_action: 'monitor_operations',
            route_next_action: 'monitor_operations',
            route_target: 'operation_control',
            health_counts: { ready: 1, needs_attention: 4 },
          },
          response: {
            focused_operation_lifecycle: {
              operation_id: 'operation_control',
              workflow_route: { next_action: 'monitor_operation' },
            },
          },
        });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    },
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.issues, [{
    scope: 'operation.list:site_alpha',
    code: 'operation_list_needs_attention_count_nonzero',
    details: { actual: 4 },
  }]);
});
