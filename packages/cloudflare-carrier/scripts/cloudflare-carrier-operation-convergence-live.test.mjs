import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatOperationConvergenceLiveText,
  parseOperationConvergenceLiveArgs,
  runOperationConvergenceLive,
} from './cloudflare-carrier-operation-convergence-live.mjs';

test('operation convergence parse requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseOperationConvergenceLiveArgs([
      '--url', 'https://carrier.example',
      '--token', 'token-value',
    ], {}),
    /operation_convergence_live_requires_--execute-operation-convergence/,
  );
});

test('operation convergence parse accepts repeated sites and operator session auth', () => {
  const parsed = parseOperationConvergenceLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--site', 'site_beta',
    '--operator-session-cookie', 'session-cookie',
    '--execute-operation-convergence',
    '--max-operation-passes', '5',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.deepEqual(parsed.siteIds, ['site_alpha', 'site_beta']);
  assert.equal(parsed.maxOperationPasses, 5);
  assert.equal(parsed.format, 'text');
});

test('operation convergence returns ok immediately when operation routes already monitor', async () => {
  const result = await runOperationConvergenceLive({
    workerUrl: 'https://carrier.example',
    siteIds: ['site_alpha'],
    maxOperationPasses: 4,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
      'site.list': {
        schema: 'narada.cloudflare_carrier.product_read.v1',
        response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
      },
      'operation.list:site_alpha': {
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          route_next_action: 'monitor_operations',
          next_operation_id: 'operation_alpha',
          route_target: 'operation_alpha',
        },
      },
      'operation.read:site_alpha:operation_alpha': {
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: { workflow_next_action: 'monitor_operation' },
      },
      posture: {
        schema: 'narada.cloudflare_carrier.posture_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
      durability: {
        schema: 'narada.cloudflare_carrier.durability_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
    })),
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.site_results[0].pass_count, 0);
  assert.equal(result.site_results[0].final_route, 'monitor_operations');
});

test('operation convergence executes focused operation pass then proves monitoring state', async () => {
  let operationListReads = 0;
  const result = await runOperationConvergenceLive({
    workerUrl: 'https://carrier.example',
    siteIds: ['site_alpha'],
    maxOperationPasses: 4,
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
      'site.list': {
        schema: 'narada.cloudflare_carrier.product_read.v1',
        response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
      },
      'operation.list:site_alpha': () => {
        operationListReads += 1;
        if (operationListReads === 1) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'focus_next_operation',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          };
        }
        return {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            route_next_action: 'monitor_operations',
            next_operation_id: 'operation_alpha',
            route_target: 'operation_alpha',
          },
        };
      },
      'operation.next:site_alpha': {
        schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
        status: 'ok',
        delegated_workflow: 'continuity',
        delegated_route_action: 'refresh_site_continuity_loop',
        read_after_next: { workflow_next_action: 'monitor_operation' },
      },
      'operation.read:site_alpha:operation_alpha': {
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: { workflow_next_action: 'monitor_operation' },
      },
      posture: {
        schema: 'narada.cloudflare_carrier.posture_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
      durability: {
        schema: 'narada.cloudflare_carrier.durability_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
    })),
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.site_results[0].pass_count, 1);
  assert.equal(result.site_results[0].passes[0].delegated_workflow, 'continuity');
  assert.match(formatOperationConvergenceLiveText(result), /Operation Convergence: ok/);
});

test('operation convergence text surfaces direct workflow and read handoffs', () => {
  const text = formatOperationConvergenceLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    checked_site_ids: ['site_alpha'],
    posture_coherence: { status: 'ok', issue_count: 0 },
    durability_coherence: { status: 'ok', issue_count: 0 },
    site_results: [
      {
        site_id: 'site_alpha',
        initial_route: 'focus_next_operation',
        final_route: 'monitor_operations',
        pass_count: 1,
        focused_operation_id: 'operation_alpha',
      },
    ],
  });

  assert.match(text, /Site List: pnpm --filter @narada2\/cloudflare-carrier product:site:list:text -- --url https:\/\/carrier\.example --operator-session-file <operator-session-file>/);
  assert.match(text, /- site=site_alpha initial=focus_next_operation final=monitor_operations passes=1 focused=operation_alpha/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Operation List: pnpm --filter @narada2\/cloudflare-carrier product:operation:list:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('operation convergence retries delayed operation list lag before declaring convergence', async () => {
  let operationListReads = 0;
  let operationReadReads = 0;
  const result = await runOperationConvergenceLive({
    workerUrl: 'https://carrier.example',
    siteIds: ['site_alpha'],
    maxOperationPasses: 4,
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
      'site.list': {
        schema: 'narada.cloudflare_carrier.product_read.v1',
        response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
      },
      'operation.list:site_alpha': () => {
        operationListReads += 1;
        if (operationListReads === 1) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'focus_next_operation',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          };
        }
        if (operationListReads === 2) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'monitor_operations',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          };
        }
        if (operationListReads === 3) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'focus_next_operation',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          };
        }
        return {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            route_next_action: 'monitor_operations',
            next_operation_id: 'operation_alpha',
            route_target: 'operation_alpha',
          },
        };
      },
      'operation.next:site_alpha': {
        schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
        status: 'ok',
        delegated_workflow: 'continuity',
        delegated_route_action: 'refresh_site_continuity_loop',
        read_after_next: { workflow_next_action: 'monitor_operation' },
      },
      'operation.read:site_alpha:operation_alpha': () => {
        operationReadReads += 1;
        if (operationReadReads === 1) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { workflow_next_action: 'refresh_site_continuity_loop' },
          };
        }
        return {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { workflow_next_action: 'monitor_operation' },
        };
      },
      posture: {
        schema: 'narada.cloudflare_carrier.posture_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
      durability: {
        schema: 'narada.cloudflare_carrier.durability_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
    })),
    sleep: async () => {},
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.site_results[0].pass_count, 2);
  assert.equal(result.site_results[0].final_route, 'monitor_operations');
});

test('operation convergence continues from focused operation when delayed list stays passive', async () => {
  let operationListReads = 0;
  let operationReadReads = 0;
  let operationNextReads = 0;
  const result = await runOperationConvergenceLive({
    workerUrl: 'https://carrier.example',
    siteIds: ['site_alpha'],
    maxOperationPasses: 4,
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
      'site.list': {
        schema: 'narada.cloudflare_carrier.product_read.v1',
        response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
      },
      'operation.list:site_alpha': () => {
        operationListReads += 1;
        if (operationListReads === 1) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'focus_next_operation',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          };
        }
        if (operationListReads <= 3) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'monitor_operations',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          };
        }
        return {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            route_next_action: 'monitor_operations',
            next_operation_id: 'operation_alpha',
            route_target: 'operation_alpha',
          },
        };
      },
      'operation.next:site_alpha': () => {
        operationNextReads += 1;
        return {
          schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1',
          status: 'ok',
          delegated_workflow: 'continuity',
          delegated_route_action: operationNextReads === 1
            ? 'refresh_site_continuity_loop'
            : 'review_site_continuity_reconciliation_execution',
          read_after_next: {
            workflow_next_action: operationNextReads === 1
              ? 'monitor_operation'
              : 'monitor_operation',
          },
        };
      },
      'operation.read:site_alpha:operation_alpha': () => {
        operationReadReads += 1;
        if (operationReadReads === 1) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { workflow_next_action: 'refresh_site_continuity_loop' },
          };
        }
        if (operationReadReads === 2) {
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { workflow_next_action: 'review_site_continuity_reconciliation_execution' },
          };
        }
        return {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { workflow_next_action: 'monitor_operation' },
        };
      },
      posture: {
        schema: 'narada.cloudflare_carrier.posture_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
      durability: {
        schema: 'narada.cloudflare_carrier.durability_coherence_live.v1',
        status: 'ok',
        checked_site_ids: ['site_alpha'],
        issues: [],
      },
    })),
    sleep: async () => {},
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.site_results[0].pass_count, 2);
  assert.equal(result.site_results[0].passes[1].delegated_route_action, 'review_site_continuity_reconciliation_execution');
});

test('operation convergence rejects unsupported route actions', async () => {
  await assert.rejects(
    async () => {
      await runOperationConvergenceLive({
        workerUrl: 'https://carrier.example',
        siteIds: ['site_alpha'],
        maxOperationPasses: 2,
        auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
        executeAcknowledged: true,
      }, {
        runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
          'site.list': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            response: { site_product_statuses: [{ site_id: 'site_alpha' }] },
          },
          'operation.list:site_alpha': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { route_next_action: 'unsupported_route' },
          },
        })),
      });
    },
    /operation_convergence_live_route_unsupported:site_alpha:unsupported_route/,
  );
});

function mockResponse(args, responses) {
  const key = classifyArgs(args);
  const value = responses[key];
  assert.ok(value, `missing mock response for ${key}`);
  return typeof value === 'function' ? value() : value;
}

function classifyArgs(args) {
  const scriptName = args[0].split(/[\\/]/).pop();
  if (scriptName === 'cloudflare-carrier-posture-coherence-live.mjs') return 'posture';
  if (scriptName === 'cloudflare-carrier-durability-coherence-live.mjs') return 'durability';
  if (scriptName === 'cloudflare-carrier-operation-next-workflow-live.mjs') return `operation.next:${valueAfter(args, '--site')}`;
  const operation = valueAfter(args, '--operation');
  if (scriptName === 'cloudflare-carrier-product-read.mjs' && operation === 'site.list') return 'site.list';
  if (scriptName === 'cloudflare-carrier-product-read.mjs' && operation === 'operation.list') return `operation.list:${valueAfter(args, '--site')}`;
  if (scriptName === 'cloudflare-carrier-product-read.mjs' && operation === 'operation.read') {
    return `operation.read:${valueAfter(args, '--site')}:${valueAfter(args, '--operation-id')}`;
  }
  throw new Error(`unexpected_args:${args.join(' ')}`);
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}
