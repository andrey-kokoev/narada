import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWebhookDelayShadowReadText,
  parseWebhookDelayShadowReadArgs,
  readWebhookDelayShadow,
  summarizeWebhookDelayShadow,
} from './cloudflare-carrier-webhook-delay-shadow-read.mjs';

test('parseWebhookDelayShadowReadArgs parses shadow read options', () => {
  const parsed = parseWebhookDelayShadowReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--shadow-read-limit', '7',
    '--focus-ref', 'shadow_alpha',
    '--operator-session-cookie', 'cookie-value',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.operation_id, 'operation_alpha');
  assert.equal(parsed.params.webhook_delay_shadow_limit, 7);
  assert.equal(parsed.focusRef, 'shadow_alpha');
  assert.equal(parsed.format, 'text');
});

test('parseWebhookDelayShadowReadArgs supports direct focused review without operation id', () => {
  const parsed = parseWebhookDelayShadowReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--focus-ref', 'shadow_alpha',
    '--operator-session-cookie', 'cookie-value',
  ], {});

  assert.equal(parsed.operation, 'webhook_delay.shadow_read.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.webhook_delay_shadow_limit, 200);
  assert.equal(parsed.focusRef, 'shadow_alpha');
});

test('summarizeWebhookDelayShadow prefers focused observation', () => {
  const summary = summarizeWebhookDelayShadow(
    { operation: { site_id: 'site_alpha', operation_id: 'operation_alpha' } },
    {
      site_id: 'site_alpha',
      observations: [
        { observation_id: 'shadow_first', classification_state: 'critical', dispatch_authority: 'windows_primary_dispatcher', dispatch_action: 'none' },
        { observation_id: 'shadow_focus', classification_state: 'warning', dispatch_authority: 'cloudflare_shadow_read', dispatch_action: 'record_only' },
      ],
    },
    {
      operationSummary: {
        workflow_next_action: 'focus_webhook_delay_shadow_read',
        workflow_reason: 'directive_intent_not_recorded_from_shadow_read',
        workflow_focus_ref: 'shadow_focus',
      },
    },
  );

  assert.equal(summary.focused_observation_id, 'shadow_focus');
  assert.equal(summary.focused_dispatch_authority, 'cloudflare_shadow_read');
  assert.equal(summary.workflow_next_action, 'focus_webhook_delay_shadow_read');
});

test('summarizeWebhookDelayShadow fails explicitly when focused observation is missing', () => {
  assert.throws(() => summarizeWebhookDelayShadow(
    {},
    {
      observations: [
        { observation_id: 'shadow_other' },
      ],
    },
    {
      focusRef: 'shadow_focus',
    },
  ), /webhook_delay_shadow_read_focus_not_found:shadow_focus/);
});

test('summarizeWebhookDelayShadow falls back to the observation window when workflow focus is unrelated', () => {
  const summary = summarizeWebhookDelayShadow(
    {},
    {
      observations: [
        {
          observation_id: 'shadow_focus',
          classification_state: 'critical',
          dispatch_authority: 'windows_primary_dispatcher',
          dispatch_action: 'none',
        },
      ],
    },
    {
      operationSummary: {
        workflow_focus_ref: 'site_narada_cloudflare',
      },
    },
  );

  assert.equal(summary.observation_count, 1);
  assert.equal(summary.focused_observation_id, 'shadow_focus');
});

test('readWebhookDelayShadow loads operation and shadow read products', async () => {
  const calls = [];
  const result = await readWebhookDelayShadow({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
    operation: 'operation.read',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      webhook_delay_shadow_limit: 5,
    },
    format: 'json',
    focusRef: 'shadow_focus',
  }, async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.operation === 'operation.read') {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          operation: { site_id: 'site_alpha', operation_id: 'operation_alpha' },
          site_id: 'site_alpha',
          operation_id: 'operation_alpha',
        }),
      };
    }
    if (body.operation === 'webhook_delay.shadow_read.list') {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          site_id: 'site_alpha',
          observations: [
            {
              observation_id: 'shadow_focus',
              classification_state: 'critical',
              dispatch_authority: 'windows_primary_dispatcher',
              dispatch_action: 'none',
            },
          ],
        }),
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  });

  assert.equal(calls[0].operation, 'operation.read');
  assert.equal(calls[1].operation, 'webhook_delay.shadow_read.list');
  assert.equal(result.summary.focused_observation_id, 'shadow_focus');
  assert.equal(result.summary.observation_count, 1);
});

test('readWebhookDelayShadow supports direct focused review without operation read', async () => {
  const calls = [];
  const result = await readWebhookDelayShadow({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
    operation: 'webhook_delay.shadow_read.list',
    params: {
      site_id: 'site_alpha',
      webhook_delay_shadow_limit: 200,
    },
    format: 'json',
    focusRef: 'shadow_focus',
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.operation === 'webhook_delay.shadow_read.list') {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify({
          site_id: 'site_alpha',
          observations: [
            {
              observation_id: 'shadow_focus',
              operation_id: 'operation_alpha',
              classification_state: 'critical',
              dispatch_authority: 'windows_primary_dispatcher',
              dispatch_action: 'none',
            },
            {
              observation_id: 'shadow_other',
              operation_id: 'operation_beta',
              classification_state: 'warning',
              dispatch_authority: 'cloudflare_shadow_read',
              dispatch_action: 'record_only',
            },
          ],
        }),
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  });

  assert.deepEqual(calls.map((entry) => entry.operation), [
    'webhook_delay.shadow_read.list',
  ]);
  assert.equal(result.summary.operation_id, 'operation_alpha');
  assert.equal(result.summary.focused_observation_id, 'shadow_focus');
  assert.equal(result.summary.observation_count, 1);
});

test('formatWebhookDelayShadowReadText prints shadow read summary', () => {
  const text = formatWebhookDelayShadowReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'focus_webhook_delay_shadow_read',
      workflow_reason: 'directive_intent_not_recorded_from_shadow_read',
      workflow_focus_ref: 'shadow_focus',
      observation_count: 1,
      focused_observation_id: 'shadow_focus',
      focused_classification_state: 'critical',
      focused_dispatch_authority: 'windows_primary_dispatcher',
      focused_dispatch_action: 'none',
    },
  });

  assert.match(text, /Webhook Delay Shadow Read: ok/);
  assert.match(text, /Workflow Route: action=focus_webhook_delay_shadow_read reason=directive_intent_not_recorded_from_shadow_read focus=shadow_focus/);
  assert.match(text, /Observations: count=1 focused=shadow_focus classification=critical/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatWebhookDelayShadowReadText suppresses next workflow for passive routes', () => {
  const text = formatWebhookDelayShadowReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      workflow_next_action: 'monitor_operation',
      workflow_reason: 'complete',
      observation_count: 1,
      focused_observation_id: 'shadow_focus',
      focused_classification_state: 'critical',
      focused_dispatch_authority: 'windows_primary_dispatcher',
      focused_dispatch_action: 'none',
    },
  });

  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});
