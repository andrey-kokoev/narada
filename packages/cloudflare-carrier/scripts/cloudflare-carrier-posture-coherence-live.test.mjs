import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPostureCoherenceLiveText,
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

test('formatPostureCoherenceLiveText surfaces direct workflow and read handoffs for checked sites', () => {
  const text = formatPostureCoherenceLiveText({
    worker_url: 'https://carrier.example.test',
    status: 'ok',
    checked_site_ids: ['site_alpha'],
    site_list: { route_next_action: 'focus_next_site', next_site_id: 'site_alpha' },
    sites: [
      {
        site_id: 'site_alpha',
        site_read: {
          health: 'attention',
          next_action: 'focus_next_operation',
        },
        operation_list: {
          operation_count: 3,
          next_operation_id: 'operation_alpha',
          route_next_action: 'focus_next_operation',
          next_action: 'use_focused_operation',
        },
      },
    ],
    issues: [],
  });

  assert.match(text, /Posture Coherence/);
  assert.match(text, /Status: ok/);
  assert.match(text, /Site Route: focus_next_site/);
  assert.match(text, /Operation Count Summary: site_alpha:3/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /- site_alpha: health=attention next=focus_next_operation operations=3/);
  assert.match(text, /  Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatPostureCoherenceLiveText suppresses focused site and operation links without concrete ids', () => {
  const text = formatPostureCoherenceLiveText({
    worker_url: 'https://carrier.example.test',
    status: 'ok',
    checked_site_ids: ['site_alpha'],
    site_list: { route_next_action: 'focus_next_site', next_site_id: null, route_target: null },
    sites: [
      {
        site_id: '',
        site_read: { health: 'attention', next_action: 'focus_next_operation' },
        operation_list: { operation_count: 3, next_operation_id: '', route_next_action: 'focus_next_operation', next_action: 'use_focused_operation' },
      },
    ],
    issues: [],
  });

  assert.doesNotMatch(text, /^Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Site Read:/m);
  assert.doesNotMatch(text, /^  Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Operation Review:/m);
  assert.doesNotMatch(text, /^  Operation Next Workflow:/m);
});

test('formatPostureCoherenceLiveText suppresses worker-scoped links without a real worker url', () => {
  const text = formatPostureCoherenceLiveText({
    status: 'ok',
    checked_site_ids: ['site_alpha'],
    site_list: { route_next_action: 'focus_next_site', next_site_id: 'site_alpha', route_target: 'site_alpha' },
    sites: [
      {
        site_id: 'site_alpha',
        site_read: { health: 'attention', next_action: 'focus_next_operation' },
        operation_list: { operation_count: 3, next_operation_id: 'operation_alpha', route_next_action: 'focus_next_operation', next_action: 'use_focused_operation' },
      },
    ],
    issues: [],
  });

  assert.doesNotMatch(text, /^Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Site Read:/m);
  assert.doesNotMatch(text, /^  Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Operation Review:/m);
  assert.doesNotMatch(text, /^  Operation Next Workflow:/m);
  assert.doesNotMatch(text, /<worker-url>/);
});

test('runPostureCoherenceLive accepts focused continuity review without refocus under monitor route', async () => {
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
          response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
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
            operation_count: 3,
            next_operation_id: 'operation_control',
            next_status: 'needs_attention',
            next_action: 'review_site_continuity_reconciliation_execution',
            route_next_action: 'monitor_operations',
            route_target: 'operation_control',
            health_counts: { ready: 2, needs_attention: 1 },
          },
          response: {
            focused_operation_lifecycle: {
              operation_id: 'operation_control',
              workflow_route: { next_action: 'review_site_continuity_reconciliation_execution' },
            },
          },
        });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.issues, []);
});

test('runPostureCoherenceLive accepts focused active workflow without refocus under monitor route', async () => {
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
          response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
        });
      }
      if (args.includes('site.read')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_id: 'site_alpha',
            health: 'attention',
            next_action: 'refresh_site_continuity_loop',
          },
        });
      }
      if (args.includes('operation.list')) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_id: 'site_alpha',
            operation_count: 3,
            next_operation_id: 'operation_control',
            next_status: 'needs_attention',
            next_action: 'refresh_site_continuity_loop',
            route_next_action: 'monitor_operations',
            route_target: 'operation_control',
            health_counts: { ready: 2, needs_attention: 1 },
          },
          response: {
            focused_operation_lifecycle: {
              operation_id: 'operation_control',
              workflow_route: { next_action: 'refresh_site_continuity_loop' },
            },
          },
        });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.issues, []);
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

test('runPostureCoherenceLive retries once on transient fetch failure from child read', async () => {
  const attempts = new Map();
  const result = await runPostureCoherenceLive({
    workerUrl: 'https://carrier.example.test',
    siteIds: ['site_alpha'],
    format: 'json',
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, {
    async runNodeScript(args) {
      const key = args.join(' ');
      attempts.set(key, (attempts.get(key) ?? 0) + 1);
      if (args.includes('site.read') && attempts.get(key) === 1) {
        const error = new Error('fetch failed');
        error.stderr = '{\n  "ok": false,\n  "code": "fetch failed"\n}\n';
        throw error;
      }
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
      if (args.includes('operation.list')) {
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
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    },
  });

  assert.equal(result.status, 'ok');
});
