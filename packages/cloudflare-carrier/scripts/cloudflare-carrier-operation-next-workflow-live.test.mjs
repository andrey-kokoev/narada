import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseOperationNextWorkflowLiveArgs,
  runOperationNextWorkflowLive,
} from './cloudflare-carrier-operation-next-workflow-live.mjs';

test('parseOperationNextWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseOperationNextWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_live_smoke',
      '--token', 'token-value',
    ], {}),
    /operation_next_workflow_live_requires_--execute-operation-next/,
  );
});

test('runOperationNextWorkflowLive delegates local ingress request route to local ingress request read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example.test',
    siteId: 'site_alpha',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-file' },
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'monitor_operations',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'review_local_ingress_request',
            posture_next_action: 'focus_next_operation',
            posture_target: 'operation_alpha',
          },
        });
      }
      return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', status: 'ok', summary: { request_count: 1 } });
    },
  });

  assert.equal(result.delegated_workflow, 'local_ingress_request');
  assert.ok(invocations.some((args) => /cloudflare-carrier-local-ingress-request-read\.mjs$/.test(args[0])));
});

test('runOperationNextWorkflowLive delegates local ingress evidence route to local ingress evidence read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example.test',
    siteId: 'site_alpha',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-file' },
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'monitor_operations',
              next_operation_id: 'operation_alpha',
              route_target: 'operation_alpha',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'review_local_ingress_evidence',
            posture_next_action: 'focus_next_operation',
            posture_target: 'operation_alpha',
          },
        });
      }
      return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', status: 'ok', summary: { evidence_count: 1 } });
    },
  });

  assert.equal(result.delegated_workflow, 'local_ingress_evidence');
  assert.ok(invocations.some((args) => /cloudflare-carrier-local-ingress-evidence-read\.mjs$/.test(args[0])));
});

test('parseOperationNextWorkflowLiveArgs supports operator session auth', () => {
  const parsed = parseOperationNextWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_live_smoke',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-operation-next',
  ], {});

  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
  assert.equal(parsed.expectedListRouteAction, null);
});

test('runOperationNextWorkflowLive selects the next operation and delegates to session workflow', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: 'operation_control',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'start_or_select_session',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
            session_count: 1,
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-session-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_session_workflow_live.v1',
          status: 'ok',
          operation_id: 'operation_control',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.operation_next_workflow_live.v1');
  assert.equal(result.status, 'ok');
  assert.equal(result.selected_operation_id, 'operation_control');
  assert.equal(result.delegated_workflow, 'session');
  assert.equal(result.delegated_route_action, 'start_or_select_session');
  assert.equal(result.read_after_next.workflow_next_action, 'monitor_operation');
  assert.equal(invocations.length, 4);
  assert.equal(invocations[0][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[1][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-session-workflow-live.mjs');
  assert.equal(invocations[3][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
});

test('runOperationNextWorkflowLive forwards continuation inputs and executes continuation workflow', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: 'focus_next_operation',
    expectedOperationId: 'operation_continuation',
    agentId: 'agent.operator',
    siteRoot: 'D:\\code\\narada',
    continuationReason: 'operator_resuming_continuation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_continuation',
              route_next_action: 'focus_next_operation',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_continuation',
              workflow_next_action: 'resume_operation_continuation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_continuation',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-continuation-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_continuation_workflow_live.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_continuation',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_operation_id, 'operation_continuation');
  assert.equal(result.delegated_workflow, 'continuation');
  assert.equal(result.delegated_route_action, 'resume_operation_continuation');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-continuation-workflow-live.mjs');
  assert.equal(invocations[2][invocations[2].indexOf('--agent-id') + 1], 'agent.operator');
  assert.equal(invocations[2][invocations[2].indexOf('--site-root') + 1], 'D:\\code\\narada');
  assert.equal(invocations[2][invocations[2].indexOf('--continuation-reason') + 1], 'operator_resuming_continuation');
});

test('runOperationNextWorkflowLive delegates inspect_operation_evidence into focus review when a reviewable focus is pending', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
              next_action: 'inspect_operation_evidence',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-evidence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_alpha',
            carrier_event_count: 2,
            reviewable_focus_kind: 'site_continuity_reconciliation_execution',
            reviewable_focus_ref: 'reconciliation_1',
            latest_focus_review: null,
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-focus-review.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_focus_review.v1',
          status: 'ok',
          summary: {
            operation: 'operation_focus_review.acknowledge',
            operation_id: 'operation_alpha',
            focus_kind: 'site_continuity_reconciliation_execution',
            focus_ref: 'reconciliation_1',
            review_status: 'acknowledged',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'focus_review');
  assert.equal(result.delegated_route_action, 'inspect_operation_evidence');
  assert.equal(result.evidence_result.schema, 'narada.cloudflare_carrier.operation_evidence_read.v1');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_focus_review.v1');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-evidence-read.mjs');
  assert.equal(invocations[3][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-focus-review.mjs');
});

test('runOperationNextWorkflowLive delegates continuity reconciliation review route into focus review', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: 'operation_control',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'review_site_continuity_reconciliation_execution',
              workflow_focus_kind: 'site_continuity_reconciliation_execution',
              workflow_focus_ref: 'reconciliation_execution_2',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-focus-review.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_focus_review.v1',
          status: 'ok',
          summary: {
            operation: 'operation_focus_review.acknowledge',
            operation_id: 'operation_control',
            focus_kind: 'site_continuity_reconciliation_execution',
            focus_ref: 'reconciliation_execution_2',
            review_status: 'acknowledged',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_operation_id, 'operation_control');
  assert.equal(result.delegated_workflow, 'focus_review');
  assert.equal(result.delegated_route_action, 'review_site_continuity_reconciliation_execution');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_focus_review.v1');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-focus-review.mjs');
  assert.equal(invocations[2][invocations[2].indexOf('--focus-kind') + 1], 'site_continuity_reconciliation_execution');
  assert.equal(invocations[2][invocations[2].indexOf('--focus-ref') + 1], 'reconciliation_execution_2');
});

test('runOperationNextWorkflowLive infers continuity reconciliation focus kind from the review ref when the read summary omits it', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'review_site_continuity_reconciliation_execution',
              workflow_focus_ref: 'site-continuity-reconciliation-execution:site_live_smoke:2026-06-13T02:39:38.447Z:completed',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-focus-review.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_focus_review.v1',
          status: 'ok',
          summary: {
            operation: 'operation_focus_review.acknowledge',
            operation_id: 'operation_control',
            focus_kind: 'site_continuity_reconciliation_execution',
            focus_ref: 'site-continuity-reconciliation-execution:site_live_smoke:2026-06-13T02:39:38.447Z:completed',
            review_status: 'acknowledged',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'focus_review');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-focus-review.mjs');
  assert.equal(invocations[2][invocations[2].indexOf('--focus-kind') + 1], 'site_continuity_reconciliation_execution');
  assert.equal(
    invocations[2][invocations[2].indexOf('--focus-ref') + 1],
    'site-continuity-reconciliation-execution:site_live_smoke:2026-06-13T02:39:38.447Z:completed',
  );
});

test('runOperationNextWorkflowLive retargets to posture target when the initially selected operation only reports focused-operation posture', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: 'operation_focus',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const operationId = args.includes('--operation-id') ? args[args.indexOf('--operation-id') + 1] : null;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
              next_action: 'inspect_operation_evidence',
            },
          });
        }
        if (operationId === 'operation_control') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'monitor_operation',
              posture_next_status: 'needs_attention',
              posture_next_action: 'focus_next_operation',
              posture_target: 'operation_focus',
              posture_reason: 'use_focused_operation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_focus',
            workflow_next_action: 'start_or_select_session',
            posture_next_status: 'needs_attention',
            posture_next_action: 'focus_next_operation',
            posture_target: 'operation_focus',
            posture_reason: 'use_focused_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-session-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_session_workflow_live.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_focus',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_operation_id, 'operation_focus');
  assert.equal(result.delegated_workflow, 'session');
  assert.equal(result.delegated_route_action, 'start_or_select_session');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-product-read.mjs');
  assert.equal(invocations[2][invocations[2].indexOf('--operation-id') + 1], 'operation_focus');
  assert.equal(invocations[3][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-session-workflow-live.mjs');
  assert.equal(invocations[3][invocations[3].indexOf('--operation-id') + 1], 'operation_focus');
});

test('runOperationNextWorkflowLive treats a retargeted monitor_operation route as a clean no-op success', async () => {
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: 'operation_focus',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName !== 'cloudflare-carrier-product-read.mjs') {
        throw new Error(`unexpected_script:${scriptName}`);
      }
      const operation = args[args.indexOf('--operation') + 1];
      const operationId = args.includes('--operation-id') ? args[args.indexOf('--operation-id') + 1] : null;
      if (operation === 'operation.list') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            next_operation_id: 'operation_control',
            route_next_action: 'monitor_operations',
            next_action: 'inspect_operation_evidence',
          },
        });
      }
      if (operationId === 'operation_control') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
            posture_next_status: 'needs_attention',
            posture_next_action: 'focus_next_operation',
            posture_target: 'operation_focus',
            posture_reason: 'use_focused_operation',
          },
        });
      }
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          operation_id: 'operation_focus',
          workflow_next_action: 'monitor_operation',
          posture_next_status: 'needs_attention',
          posture_next_action: 'focus_next_operation',
          posture_target: 'operation_focus',
          posture_reason: 'use_focused_operation',
        },
      });
    },
  });

  assert.equal(result.selected_operation_id, 'operation_focus');
  assert.equal(result.delegated_workflow, 'monitor_operation');
  assert.equal(result.delegated_route_action, 'monitor_operation');
  assert.equal(result.delegated_result, null);
});

test('runOperationNextWorkflowLive follows the posture target chain until it reaches the actionable operation', async () => {
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: 'operation_final',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const operationId = args.includes('--operation-id') ? args[args.indexOf('--operation-id') + 1] : null;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
              next_action: 'inspect_operation_evidence',
            },
          });
        }
        if (operationId === 'operation_control') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'monitor_operation',
              posture_next_status: 'needs_attention',
              posture_next_action: 'focus_next_operation',
              posture_target: 'operation_focus',
              posture_reason: 'use_focused_operation',
            },
          });
        }
        if (operationId === 'operation_focus') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_focus',
              workflow_next_action: 'monitor_operation',
              posture_next_status: 'needs_attention',
              posture_next_action: 'focus_next_operation',
              posture_target: 'operation_final',
              posture_reason: 'use_focused_operation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_final',
            workflow_next_action: 'start_or_select_session',
            posture_next_status: 'needs_attention',
            posture_next_action: 'focus_next_operation',
            posture_target: 'operation_final',
            posture_reason: 'use_focused_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-session-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_session_workflow_live.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_final',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_operation_id, 'operation_final');
  assert.equal(result.delegated_workflow, 'session');
  assert.equal(result.delegated_route_action, 'start_or_select_session');
});

test('runOperationNextWorkflowLive does not retarget away from an already actionable focused operation', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: 'operation_focus',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const operationId = args.includes('--operation-id') ? args[args.indexOf('--operation-id') + 1] : null;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_focus',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        if (operationId === 'operation_focus') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_focus',
              workflow_next_action: 'refresh_site_continuity_loop',
              posture_next_status: 'needs_attention',
              posture_next_action: 'focus_next_operation',
              posture_target: 'operation_control',
              posture_reason: 'use_focused_operation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-continuity-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_focus',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.selected_operation_id, 'operation_focus');
  assert.equal(result.read_before_next.operation_id, 'operation_focus');
  assert.equal(result.delegated_workflow, 'continuity');
  assert.equal(result.delegated_route_action, 'refresh_site_continuity_loop');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-continuity-workflow-live.mjs');
  assert.equal(invocations[2][invocations[2].indexOf('--operation-id') + 1], 'operation_focus');
});

test('runOperationNextWorkflowLive stops retargeting cleanly on a posture cycle and keeps the last distinct operation selected', async () => {
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: 'operation_focus',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName !== 'cloudflare-carrier-product-read.mjs') {
        throw new Error(`unexpected_script:${scriptName}`);
      }
      const operation = args[args.indexOf('--operation') + 1];
      const operationId = args.includes('--operation-id') ? args[args.indexOf('--operation-id') + 1] : null;
      if (operation === 'operation.list') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            next_operation_id: 'operation_control',
            route_next_action: 'monitor_operations',
            next_action: 'inspect_operation_evidence',
          },
        });
      }
      if (operationId === 'operation_control') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
            posture_next_status: 'needs_attention',
            posture_next_action: 'focus_next_operation',
            posture_target: 'operation_focus',
            posture_reason: 'use_focused_operation',
          },
        });
      }
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          operation_id: 'operation_focus',
          workflow_next_action: 'monitor_operation',
          posture_next_status: 'needs_attention',
          posture_next_action: 'focus_next_operation',
          posture_target: 'operation_control',
          posture_reason: 'use_focused_operation',
        },
      });
    },
  });

  assert.equal(result.selected_operation_id, 'operation_focus');
  assert.equal(result.read_before_next.operation_id, 'operation_focus');
  assert.equal(result.delegated_workflow, 'monitor_operation');
});

test('runOperationNextWorkflowLive keeps inspect_operation_evidence read-only when no reviewable focus is present', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
              next_action: 'inspect_operation_evidence',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-evidence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_alpha',
            carrier_event_count: 2,
            reviewable_focus_kind: null,
            reviewable_focus_ref: null,
            latest_focus_review: null,
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'evidence');
  assert.equal(result.delegated_route_action, 'inspect_operation_evidence');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_evidence_read.v1');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-evidence-read.mjs');
});

test('runOperationNextWorkflowLive delegates read_operation_evidence directly to operation evidence read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'focus_next_operation',
              next_action: 'read_operation_evidence',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'read_operation_evidence',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-evidence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_alpha',
            carrier_event_count: 0,
            reviewable_focus_kind: null,
            reviewable_focus_ref: null,
            latest_focus_review: null,
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'evidence');
  assert.equal(result.delegated_route_action, 'read_operation_evidence');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_evidence_read.v1');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-evidence-read.mjs');
});

test('runOperationNextWorkflowLive delegates review_carrier_evidence_replay to operation evidence read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'focus_next_operation',
              next_action: 'review_carrier_evidence_replay',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'review_carrier_evidence_replay',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-evidence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_alpha',
            carrier_event_count: 0,
            reviewable_focus_kind: null,
            reviewable_focus_ref: null,
            latest_focus_review: null,
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'evidence');
  assert.equal(result.delegated_route_action, 'review_carrier_evidence_replay');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_evidence_read.v1');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-evidence-read.mjs');
});


test('runOperationNextWorkflowLive delegates site file change proposal review route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'review_site_file_change_proposal',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-site-file-change-proposal-review.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.site_file_change_proposal_review.v1',
          status: 'ok',
          summary: {
            focused_proposal_id: 'site_file_change_proposal_live_1',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_file_change_proposal');
  assert.equal(result.delegated_route_action, 'review_site_file_change_proposal');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.site_file_change_proposal_review.v1');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-site-file-change-proposal-review.mjs');
});

test('runOperationNextWorkflowLive delegates Windows fallback resident dispatch request route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'request_windows_fallback_resident_dispatch',
            workflow_focus_ref: 'resident_dispatch_alpha',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-resident-dispatch-windows-fallback-request.mjs') {
        assert.deepEqual(args.slice(1), [
          '--url', 'https://carrier.example',
          '--site', 'site_live_smoke',
          '--operation-id', 'operation_alpha',
          '--dispatch-decision-id', 'resident_dispatch_alpha',
          '--token', 'token-value',
        ]);
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_request.v1',
          status: 'ok',
          summary: { fallback_request_id: 'resident_fallback_request_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'resident_dispatch_windows_fallback_request');
  assert.equal(result.delegated_route_action, 'request_windows_fallback_resident_dispatch');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_request.v1');
});

test('runOperationNextWorkflowLive delegates Windows fallback resident dispatch evidence route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'review_windows_fallback_resident_dispatch_evidence',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-resident-dispatch-windows-fallback-evidence-review.mjs') {
        assert.deepEqual(args.slice(1), [
          '--url', 'https://carrier.example',
          '--site', 'site_live_smoke',
          '--operation-id', 'operation_alpha',
          '--token', 'token-value',
        ]);
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_evidence_review.v1',
          status: 'ok',
          summary: { focused_fallback_evidence_id: 'resident_fallback_evidence_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'resident_dispatch_windows_fallback_evidence_review');
  assert.equal(result.delegated_route_action, 'review_windows_fallback_resident_dispatch_evidence');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_evidence_review.v1');
});

test('runOperationNextWorkflowLive delegates local ingress provider liveness review route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: 'operation_control',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'review_local_ingress_provider_liveness',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-local-ingress-provider-liveness-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.local_ingress_provider_liveness_read.v1',
          status: 'ok',
          summary: { site_id: 'site_alpha', state: 'stale' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'local_ingress_provider_liveness');
  assert.equal(result.delegated_route_action, 'review_local_ingress_provider_liveness');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-local-ingress-provider-liveness-read.mjs');
});

test('runOperationNextWorkflowLive delegates repository publication provider liveness review route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: 'operation_control',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'review_repository_publication_provider_liveness',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-repository-publication-provider-liveness-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.repository_publication_provider_liveness_read.v1',
          status: 'ok',
          summary: { site_id: 'site_alpha', state: 'stale' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'repository_publication_provider_liveness');
  assert.equal(result.delegated_route_action, 'review_repository_publication_provider_liveness');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-repository-publication-provider-liveness-read.mjs');
});

test('runOperationNextWorkflowLive delegates mailbox send confirmation review route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: 'operation_control',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'review_mailbox_send_confirmation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-mailbox-send-confirmation-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.mailbox_send_confirmation_read.v1',
          status: 'ok',
          summary: { site_id: 'site_alpha', confirmation_count: 1 },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'mailbox_send_confirmation');
  assert.equal(result.delegated_route_action, 'review_mailbox_send_confirmation');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-mailbox-send-confirmation-read.mjs');
});

test('runOperationNextWorkflowLive delegates mailbox send acceptance review route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: 'operation_control',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_control',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_control',
              workflow_next_action: 'review_mailbox_send_acceptance',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_control',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-mailbox-send-accepted-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.mailbox_send_accepted_read.v1',
          status: 'ok',
          summary: { site_id: 'site_alpha', send_count: 1 },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'mailbox_send_accepted');
  assert.equal(result.delegated_route_action, 'review_mailbox_send_acceptance');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-mailbox-send-accepted-read.mjs');
});

test('runOperationNextWorkflowLive delegates local resident carrier bridge route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (invocations.length === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_alpha',
              workflow_next_action: 'bridge_local_resident_carrier_evidence',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-resident-dispatch-local-resident-carrier-bridge.mjs') {
        assert.deepEqual(args.slice(1), [
          '--url', 'https://carrier.example',
          '--site', 'site_live_smoke',
          '--operation-id', 'operation_alpha',
          '--token', 'token-value',
        ]);
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.local_resident_carrier_bridge.v1',
          status: 'ok',
          summary: { bridge_id: 'local_resident_carrier_bridge_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'local_resident_carrier_bridge');
  assert.equal(result.delegated_route_action, 'bridge_local_resident_carrier_evidence');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.local_resident_carrier_bridge.v1');
});

test('runOperationNextWorkflowLive delegates Windows fallback resident dispatch execution route', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: 'monitor_operations',
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
            },
          });
        }
        if (invocations.length === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_alpha',
              workflow_next_action: 'await_windows_fallback_resident_dispatch',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'review_windows_fallback_resident_dispatch_evidence',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-resident-dispatch-windows-fallback-execute.mjs') {
        assert.deepEqual(args.slice(1), [
          '--url', 'https://carrier.example',
          '--site', 'site_live_smoke',
          '--operation-id', 'operation_alpha',
          '--execute-windows-fallback',
          '--token', 'token-value',
        ]);
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_execute.v1',
          status: 'ok',
          fallback_request_id: 'fallback_request_alpha',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'resident_dispatch_windows_fallback_execute');
  assert.equal(result.delegated_route_action, 'await_windows_fallback_resident_dispatch');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_execute.v1');
});

test('runOperationNextWorkflowLive continues past evidence when the focus review is already acknowledged', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
              next_action: 'inspect_operation_evidence',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 3) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_alpha',
              workflow_next_action: 'refresh_site_continuity_loop',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-evidence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_alpha',
            reviewable_focus_kind: 'site_continuity_reconciliation_execution',
            reviewable_focus_ref: 'reconciliation_1',
            latest_focus_review: {
              focus_kind: 'site_continuity_reconciliation_execution',
              focus_ref: 'reconciliation_1',
              review_status: 'acknowledged',
            },
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-continuity-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1',
          status: 'ok',
          operation_id: 'operation_alpha',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'continuity');
  assert.equal(result.delegated_route_action, 'refresh_site_continuity_loop');
  assert.equal(result.evidence_result.schema, 'narada.cloudflare_carrier.operation_evidence_read.v1');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1');
  assert.equal(result.read_after_next.workflow_next_action, 'monitor_operation');
  assert.equal(invocations[2][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-evidence-read.mjs');
  assert.equal(invocations[4][0].split(/[\\/]/).pop(), 'cloudflare-carrier-operation-continuity-workflow-live.mjs');
});

test('runOperationNextWorkflowLive reports reviewed evidence cleanly when no follow-on workflow remains', async () => {
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
              next_action: 'inspect_operation_evidence',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-evidence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_alpha',
            reviewable_focus_kind: 'site_continuity_reconciliation_execution',
            reviewable_focus_ref: 'reconciliation_1',
            latest_focus_review: {
              focus_kind: 'site_continuity_reconciliation_execution',
              focus_ref: 'reconciliation_1',
              review_status: 'acknowledged',
            },
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'evidence_reviewed');
  assert.equal(result.delegated_route_action, 'monitor_operation');
});

test('runOperationNextWorkflowLive prefers direct workflow when operation read has a fresher actionable route than stale evidence posture', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_live_smoke',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_alpha',
              route_next_action: 'monitor_operations',
              next_action: 'inspect_operation_evidence',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_alpha',
              workflow_next_action: 'refresh_site_continuity_loop',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_alpha',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-continuity-workflow-live.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1',
          status: 'ok',
          operation_id: 'operation_alpha',
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'continuity');
  assert.equal(result.delegated_route_action, 'refresh_site_continuity_loop');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-continuity-workflow-live.mjs');
  assert.equal(invocations.some((call) => call[0].split(/[\\\\/]/).pop() === 'cloudflare-carrier-operation-evidence-read.mjs'), false);
});

test('runOperationNextWorkflowLive rejects unsupported downstream route actions', async () => {
  await assert.rejects(
    async () => {
      await runOperationNextWorkflowLive({
        workerUrl: 'https://carrier.example',
        siteId: 'site_live_smoke',
        expectedListRouteAction: null,
        expectedOperationId: null,
        auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
        executeAcknowledged: true,
      }, {
        runNodeScript: async (args) => {
          const operation = args[args.indexOf('--operation') + 1];
          if (operation === 'operation.list') {
            return JSON.stringify({
              schema: 'narada.cloudflare_carrier.product_read.v1',
              summary: { next_operation_id: 'operation_alpha', route_next_action: 'monitor_operations', next_action: 'monitor_operation' },
            });
          }
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { operation_id: 'operation_alpha', workflow_next_action: 'unsupported_route' },
          });
        },
      });
    },
    /operation_next_workflow_live_route_unsupported:unsupported_route/,
  );
});

test('runOperationNextWorkflowLive delegates mailbox draft reply proposal review route to mailbox proposal read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_site_read',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_site_read',
              workflow_next_action: 'review_mailbox_draft_reply_proposal',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_site_read',
            workflow_next_action: 'review_mailbox_draft_reply_proposal',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-mailbox-draft-reply-proposal-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.mailbox_draft_reply_proposal_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_site_read',
            proposal_count: 1,
            focused_proposal_id: 'mailbox_draft_reply_proposal_live_1',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'mailbox_draft_reply_proposal');
  assert.equal(result.delegated_route_action, 'review_mailbox_draft_reply_proposal');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.mailbox_draft_reply_proposal_read.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-mailbox-draft-reply-proposal-read.mjs');
});

test('runOperationNextWorkflowLive delegates repository publication request review route to repository publication review read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_site_read',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_site_read',
              workflow_next_action: 'review_repository_publication_request',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_site_read',
            workflow_next_action: 'review_repository_publication_request',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-repository-publication-request-review.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.repository_publication_request_review.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_site_read',
            request_count: 1,
            focused_repository_publication_request_id: 'repository_publication_request_live_1',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'repository_publication_request');
  assert.equal(result.delegated_route_action, 'review_repository_publication_request');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.repository_publication_request_review.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-repository-publication-request-review.mjs');
});

test('runOperationNextWorkflowLive delegates directive delivery review route to directive delivery review read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_site_read',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_site_read',
            workflow_next_action: 'review_directive_delivery',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-directive-delivery-review.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.directive_delivery_review.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_site_read',
            directive_record_count: 1,
            undelivered_directive_record_count: 1,
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'directive_delivery');
  assert.equal(result.delegated_route_action, 'review_directive_delivery');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.directive_delivery_review.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-directive-delivery-review.mjs');
});

test('runOperationNextWorkflowLive delegates mailbox outlook draft review route to mailbox outlook draft read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_site_read',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_site_read',
            workflow_next_action: 'review_mailbox_outlook_draft_create',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-mailbox-outlook-draft-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.mailbox_outlook_draft_read.v1',
          status: 'ok',
          summary: { draft_count: 1, latest_draft_create_id: 'draft_live_1' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'mailbox_outlook_draft');
  assert.equal(result.delegated_route_action, 'review_mailbox_outlook_draft_create');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.mailbox_outlook_draft_read.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-mailbox-outlook-draft-read.mjs');
});

test('runOperationNextWorkflowLive delegates repository publication evidence route to repository publication evidence read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { next_operation_id: 'operation_site_read', route_next_action: 'monitor_operations' } });
        }
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { operation_id: 'operation_site_read', workflow_next_action: 'review_repository_publication_evidence' } });
      }
      if (scriptName === 'cloudflare-carrier-repository-publication-read.mjs') {
        assert.equal(args[args.indexOf('--operation') + 1], 'repository_publication.evidence.list');
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.repository_publication_read.v1', status: 'ok', summary: { operation: 'repository_publication.evidence.list', evidence_count: 1 } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'repository_publication_evidence');
  assert.equal(result.delegated_route_action, 'review_repository_publication_evidence');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.repository_publication_read.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-repository-publication-read.mjs');
});

test('runOperationNextWorkflowLive delegates cloudflare repository publication execution review route to execution read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { next_operation_id: 'operation_site_read', route_next_action: 'monitor_operations' } });
        }
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { operation_id: 'operation_site_read', workflow_next_action: 'review_cloudflare_github_repository_publication_execution' } });
      }
      if (scriptName === 'cloudflare-carrier-repository-publication-read.mjs') {
        assert.equal(args[args.indexOf('--operation') + 1], 'repository_publication.cloudflare_execution.list');
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.repository_publication_read.v1', status: 'ok', summary: { operation: 'repository_publication.cloudflare_execution.list', execution_count: 1 } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'repository_publication_cloudflare_execution');
  assert.equal(result.delegated_route_action, 'review_cloudflare_github_repository_publication_execution');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.repository_publication_read.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-repository-publication-read.mjs');
});

test('runOperationNextWorkflowLive delegates recovery review route to operation recovery read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_site_read',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_site_read',
              workflow_next_action: 'review_recovery_posture',
              workflow_reason: 'recovery_posture_needs_attention',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_site_read',
            workflow_next_action: 'review_recovery_posture',
            workflow_reason: 'recovery_posture_needs_attention',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-recovery-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_recovery_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_site_read',
            recovery_state: 'local_resident_inhabitance_not_replayable',
            recovery_gap_count: 1,
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'operation_recovery');
  assert.equal(result.delegated_route_action, 'review_recovery_posture');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_recovery_read.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-recovery-read.mjs');
});

test('runOperationNextWorkflowLive delegates persistence review route to operation persistence read', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator_session=test', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_site_read',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_site_read',
            workflow_next_action: 'review_persistence_posture',
            workflow_reason: 'persistence_posture_needs_attention',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-persistence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_persistence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_site_read',
            persistence_state: 'degraded',
            persistence_active_boundary_count: 10,
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'operation_persistence');
  assert.equal(result.delegated_route_action, 'review_persistence_posture');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_persistence_read.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-persistence-read.mjs');
});

test('runOperationNextWorkflowLive delegates continuity loop report review route to operation continuity workflow', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'operator_session', value: 'operator_session=test', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        if (operation === 'operation.list') {
          return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { next_operation_id: 'operation_site_read', route_next_action: 'focus_next_operation', next_action: 'use_focused_operation' } });
        }
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { operation_id: 'operation_site_read', workflow_next_action: 'review_continuity_loop_report', workflow_reason: 'operation_lifecycle_missing_continuity_loop_report' } });
      }
      if (scriptName === 'cloudflare-carrier-operation-continuity-workflow-live.mjs') {
        assert.equal(args[args.indexOf('--expected-pre-action') + 1], 'review_continuity_loop_report');
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1', status: 'ok', read_after_continuity: { workflow_next_action: 'monitor_operation' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'continuity');
  assert.equal(result.delegated_route_action, 'review_continuity_loop_report');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_continuity_workflow_live.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-continuity-workflow-live.mjs');
});

test('runOperationNextWorkflowLive advances recovery review into local resident carrier bridge when recovery names that admitted next action', async () => {
  const invocations = [];
  const result = await runOperationNextWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_narada_cloudflare',
    expectedListRouteAction: null,
    expectedOperationId: null,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs') {
        const operation = args[args.indexOf('--operation') + 1];
        const readCount = invocations.filter((call) => call[0].endsWith('cloudflare-carrier-product-read.mjs')).length;
        if (operation === 'operation.list') {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              next_operation_id: 'operation_site_read',
              route_next_action: 'focus_next_operation',
              next_action: 'use_focused_operation',
            },
          });
        }
        if (operation === 'operation.read' && readCount === 2) {
          return JSON.stringify({
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              operation_id: 'operation_site_read',
              workflow_next_action: 'review_recovery_posture',
              workflow_reason: 'recovery_posture_needs_attention',
            },
          });
        }
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            operation_id: 'operation_site_read',
            workflow_next_action: 'monitor_operation',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-recovery-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_recovery_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_site_read',
            recovery_state: 'local_resident_inhabitance_not_replayable',
            recovery_gap_count: 1,
            recovery_next_action: 'local_resident_carrier_evidence_not_admitted',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-operation-evidence-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.operation_evidence_read.v1',
          status: 'ok',
          summary: {
            operation_id: 'operation_site_read',
            local_resident_session_refs: ['windows-resident-session://site_narada_cloudflare/operation_site_read/1'],
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-resident-dispatch-local-resident-carrier-bridge.mjs') {
        assert.equal(
          args[args.indexOf('--local-resident-session-ref') + 1],
          'windows-resident-session://site_narada_cloudflare/operation_site_read/1',
        );
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.local_resident_carrier_bridge.v1',
          status: 'ok',
          summary: {
            bridge_id: 'local_resident_carrier_bridge_site_read',
          },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'local_resident_carrier_bridge');
  assert.equal(result.delegated_route_action, 'review_recovery_posture');
  assert.equal(result.recovery_result.schema, 'narada.cloudflare_carrier.operation_recovery_read.v1');
  assert.equal(result.evidence_result.schema, 'narada.cloudflare_carrier.operation_evidence_read.v1');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.local_resident_carrier_bridge.v1');
  assert.equal(invocations[2][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-recovery-read.mjs');
  assert.equal(invocations[3][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-operation-evidence-read.mjs');
  assert.equal(invocations[4][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-resident-dispatch-local-resident-carrier-bridge.mjs');
});
