import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
});
