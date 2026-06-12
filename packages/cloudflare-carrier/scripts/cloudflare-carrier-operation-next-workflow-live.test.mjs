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

test('runOperationNextWorkflowLive delegates inspect_operation_evidence to operation evidence read when review is still pending', async () => {
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
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'evidence');
  assert.equal(result.delegated_route_action, 'inspect_operation_evidence');
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
      if (scriptName === 'cloudflare-carrier-resident-dispatch-windows-fallback-evidence.mjs') {
        assert.deepEqual(args.slice(1), [
          '--url', 'https://carrier.example',
          '--site', 'site_live_smoke',
          '--operation-id', 'operation_alpha',
          '--operation', 'list',
          '--token', 'token-value',
        ]);
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_evidence.v1',
          status: 'ok',
          summary: { fallback_evidence_id: 'resident_fallback_evidence_alpha' },
        });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'resident_dispatch_windows_fallback_evidence');
  assert.equal(result.delegated_route_action, 'review_windows_fallback_resident_dispatch_evidence');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.resident_dispatch_windows_fallback_evidence.v1');
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
