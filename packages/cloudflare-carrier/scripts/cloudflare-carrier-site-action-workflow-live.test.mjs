import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteActionWorkflowLiveText,
  parseSiteActionWorkflowLiveArgs,
  runSiteActionWorkflowLive,
} from './cloudflare-carrier-site-action-workflow-live.mjs';

test('parseSiteActionWorkflowLiveArgs requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseSiteActionWorkflowLiveArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_alpha',
      '--token', 'token-value',
    ], {}),
    /site_action_workflow_live_requires_--execute-site-action/,
  );
});

test('parseSiteActionWorkflowLiveArgs supports refs and operator session auth', () => {
  const parsed = parseSiteActionWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--expected-action', 'bind_cloudflare_product_next_site_locally',
    '--local-site-ref', 'file:///D:/code/narada',
    '--cloudflare-site-ref', 'cloudflare://site-alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--execute-site-action',
  ], {});

  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.expectedAction, 'bind_cloudflare_product_next_site_locally');
  assert.equal(parsed.localSiteRef, 'file:///D:/code/narada');
  assert.equal(parsed.cloudflareSiteRef, 'cloudflare://site-alpha');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-session-cookie',
    source: 'operator-session-cookie',
  });
});

test('parseSiteActionWorkflowLiveArgs supports text format', () => {
  const parsed = parseSiteActionWorkflowLiveArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
    '--execute-site-action',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('formatSiteActionWorkflowLiveText renders direct reads', () => {
  const text = formatSiteActionWorkflowLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    site_id: 'site_alpha',
    delegated_workflow: 'focus_next_operation',
    delegated_action: 'focus_next_operation',
    read_before_action: {
      next_action: 'focus_next_operation',
      active_operation_id: 'operation_alpha',
    },
    read_after_action: {
      next_action: 'monitor_site',
      active_operation_id: 'operation_alpha',
    },
    delegated_followup_result: { status: 'ok' },
  });

  assert.match(text, /^Site Action Workflow: ok/m);
  assert.match(text, /Site: site_alpha/);
  assert.match(text, /Pre Action: focus_next_operation/);
  assert.match(text, /Post Action: monitor_site/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.match(text, /Follow-up: executed/);
});

test('runSiteActionWorkflowLive returns monitor result without delegation', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'monitor_site',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      return JSON.stringify({
        schema: 'narada.cloudflare_carrier.product_read.v1',
        summary: {
          site_id: 'site_alpha',
          next_action: 'monitor_site',
          health: 'ready',
        },
      });
    },
  });

  assert.equal(result.delegated_workflow, 'monitor_site');
  assert.equal(result.delegated_result, null);
  assert.equal(invocations.length, 1);
});

test('runSiteActionWorkflowLive delegates operation focus to operation.next workflow', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'focus_next_operation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'focus_next_operation' } });
      }
      if (scriptName === 'cloudflare-carrier-operation-next-workflow-live.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1', status: 'ok' });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'focus_next_operation');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_next_workflow_live.v1');
  assert.equal(invocations.length, 3);
  assert.deepEqual(invocations[1].slice(1, 6), [
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--execute-operation-next',
  ]);
});

test('runSiteActionWorkflowLive retries operation focus once when site stays focused on operations', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'focus_next_operation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'focus_next_operation' } });
      }
      if (scriptName === 'cloudflare-carrier-operation-next-workflow-live.mjs' && invocations.length === 2) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1', status: 'ok', read_after_next: { workflow_next_action: 'review_site_continuity_reconciliation_execution' } });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'focus_next_operation' } });
      }
      if (scriptName === 'cloudflare-carrier-operation-next-workflow-live.mjs' && invocations.length === 4) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1', status: 'ok', read_after_next: { workflow_next_action: 'monitor_operation' } });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 5) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}:${invocations.length}`);
    },
  });

  assert.equal(result.delegated_workflow, 'focus_next_operation');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_next_workflow_live.v1');
  assert.equal(result.delegated_followup_result.schema, 'narada.cloudflare_carrier.operation_next_workflow_live.v1');
  assert.equal(invocations.length, 5);
});

test('runSiteActionWorkflowLive delegates site operation focus to operation.next workflow', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'focus_site_operation',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'focus_site_operation' } });
      }
      if (scriptName === 'cloudflare-carrier-operation-next-workflow-live.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.operation_next_workflow_live.v1', status: 'ok' });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'focus_site_operation');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.operation_next_workflow_live.v1');
  assert.deepEqual(invocations[1].slice(1, 6), [
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--execute-operation-next',
  ]);
});

test('runSiteActionWorkflowLive delegates continuity publish', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'publish_cloudflare_continuity_packet',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'publish_cloudflare_continuity_packet' } });
      }
      if (scriptName === 'cloudflare-carrier-site-continuity-publish.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_continuity_publish.v1', status: 'ok' });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'publish_continuity_packet');
  assert.equal(result.delegated_result.schema, 'narada.cloudflare_carrier.site_continuity_publish.v1');
  assert.equal(invocations.length, 3);
});

test('runSiteActionWorkflowLive delegates next-site binding preparation', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'bind_cloudflare_product_next_site_locally',
    localSiteRef: 'file:///D:/code/narada',
    cloudflareSiteRef: 'cloudflare://site-alpha',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'bind_cloudflare_product_next_site_locally' } });
      }
      if (scriptName === 'cloudflare-site-continuity-bindings.mjs') {
        return JSON.stringify({ ok: true, action: 'written', reason: 'site_continuity_binding_packet_prepared' });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'prepare_next_site_binding');
  assert.equal(result.delegated_result.action, 'written');
  assert.equal(invocations.length, 3);
});

test('runSiteActionWorkflowLive delegates continuity refresh', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'refresh_site_continuity_loop',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'refresh_site_continuity_loop' } });
      }
      if (scriptName === 'cloudflare-site-continuity-scheduler.mjs') {
        return JSON.stringify({ ok: true, action: 'reconcile-execute', status: 'ok' });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'refresh_site_continuity_loop');
  assert.equal(result.delegated_result.action, 'reconcile-execute');
  assert.equal(invocations.length, 3);
  assert.deepEqual(invocations[1].slice(1, 9), [
    '--action', 'reconcile-execute',
    '--live',
    '--site', 'site_alpha',
    '--refresh-site-registry-projection',
    '--projection-url', 'https://carrier.example',
  ]);
});

test('runSiteActionWorkflowLive delegates membership creation to site membership put', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'load_or_create_membership',
    memberPrincipalId: 'principal:alpha',
    membershipRole: 'viewer',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'load_or_create_membership' } });
      }
      if (scriptName === 'cloudflare-carrier-site-membership-put.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_membership_put.v1', status: 'ok' });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_membership_put');
  assert.equal(result.delegated_action, 'load_or_create_membership');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-site-membership-put.mjs');
  assert.deepEqual(invocations[1].slice(1, 9), [
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--member-principal-id', 'principal:alpha',
    '--role', 'viewer',
  ]);
});

test('runSiteActionWorkflowLive delegates membership put to site membership write surface', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'put_membership',
    memberPrincipalId: 'principal:alpha',
    membershipRole: 'viewer',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'put_membership' } });
      }
      if (scriptName === 'cloudflare-carrier-site-membership-put.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_membership_put.v1', status: 'ok' });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_membership_put');
  assert.equal(result.delegated_action, 'put_membership');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-site-membership-put.mjs');
});

test('runSiteActionWorkflowLive delegates site authority read', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'read_site_authority',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'read_site_authority' } });
      }
      if (scriptName === 'cloudflare-carrier-site-authority-read.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_authority_read.v1', status: 'ok', summary: { site_id: 'site_alpha', admitted_count: 1 } });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_authority');
  assert.equal(result.delegated_action, 'read_site_authority');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-site-authority-read.mjs');
});

test('runSiteActionWorkflowLive delegates membership authority focus to site authority read', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'focus_membership_authority',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'focus_membership_authority' } });
      }
      if (scriptName === 'cloudflare-carrier-site-authority-read.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_authority_read.v1', status: 'ok', summary: { site_id: 'site_alpha', admitted_count: 1 } });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_authority');
  assert.equal(result.delegated_action, 'focus_membership_authority');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-site-authority-read.mjs');
});

test('runSiteActionWorkflowLive delegates inactive membership inspection to site authority read', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'inspect_inactive_membership',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'inspect_inactive_membership' } });
      }
      if (scriptName === 'cloudflare-carrier-site-authority-read.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_authority_read.v1', status: 'ok', summary: { site_id: 'site_alpha', admitted_count: 1 } });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_authority');
  assert.equal(result.delegated_action, 'inspect_inactive_membership');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-site-authority-read.mjs');
});

test('runSiteActionWorkflowLive delegates authority transfer continuation to authority transfer read', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'continue_authority_transfer',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: {
            site_id: 'site_alpha',
            active_operation_id: 'operation_alpha',
            next_action: 'continue_authority_transfer',
          },
        });
      }
      if (scriptName === 'cloudflare-carrier-authority-transfer-read.mjs') {
        return JSON.stringify({
          schema: 'narada.cloudflare_carrier.authority_transfer_read.v1',
          status: 'ok',
          summary: { site_id: 'site_alpha', operation_id: 'operation_alpha', transfer_readiness: 'incomplete' },
        });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'authority_transfer');
  assert.equal(result.delegated_action, 'continue_authority_transfer');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-authority-transfer-read.mjs');
  assert.equal(invocations[1][invocations[1].indexOf('--operation-id') + 1], 'operation_alpha');
});
test('runSiteActionWorkflowLive delegates site scope read', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'read_site_scope',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'read_site_scope' } });
      }
      if (scriptName === 'cloudflare-carrier-site-scope-read.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_scope_read.v1', status: 'ok', summary: { site_id: 'site_alpha', scope_loaded: true } });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_scope');
  assert.equal(result.delegated_action, 'read_site_scope');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-site-scope-read.mjs');
});

test('runSiteActionWorkflowLive delegates membership site read to site scope read', async () => {
  const invocations = [];
  const result = await runSiteActionWorkflowLive({
    workerUrl: 'https://carrier.example',
    siteId: 'site_alpha',
    expectedAction: 'read_membership_site',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      const scriptName = args[0].split(/[\\\\/]/).pop();
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 1) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'read_membership_site' } });
      }
      if (scriptName === 'cloudflare-carrier-site-scope-read.mjs') {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.site_scope_read.v1', status: 'ok', summary: { site_id: 'site_alpha', scope_loaded: true } });
      }
      if (scriptName === 'cloudflare-carrier-product-read.mjs' && invocations.length === 3) {
        return JSON.stringify({ schema: 'narada.cloudflare_carrier.product_read.v1', summary: { site_id: 'site_alpha', next_action: 'monitor_site' } });
      }
      throw new Error(`unexpected_script:${scriptName}`);
    },
  });

  assert.equal(result.delegated_workflow, 'site_scope');
  assert.equal(result.delegated_action, 'read_membership_site');
  assert.equal(invocations[1][0].split(/[\\\\/]/).pop(), 'cloudflare-carrier-site-scope-read.mjs');
});
