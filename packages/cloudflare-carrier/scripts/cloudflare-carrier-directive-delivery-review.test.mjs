import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDirectiveDeliveryReviewText,
  parseDirectiveDeliveryReviewArgs,
  readDirectiveDeliveryReview,
  summarizeDirectiveDeliveryReview,
} from './cloudflare-carrier-directive-delivery-review.mjs';

test('parseDirectiveDeliveryReviewArgs configures operation read and review limits', () => {
  const config = parseDirectiveDeliveryReviewArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--directive-record-limit', '7',
    '--directive-delivery-limit', '9',
    '--focus-ref', 'directive_record_focus',
    '--token', 'test-token',
  ], {});

  assert.equal(config.operation, 'operation.read');
  assert.equal(config.params.site_id, 'site_alpha');
  assert.equal(config.params.operation_id, 'operation_alpha');
  assert.equal(config.params.webhook_delay_directive_limit, 7);
  assert.equal(config.params.webhook_delay_directive_delivery_limit, 9);
  assert.equal(config.focusRef, 'directive_record_focus');
});

test('summarizeDirectiveDeliveryReview tracks focused undelivered directive state', () => {
  const summary = summarizeDirectiveDeliveryReview(
    { operation: { site_id: 'site_alpha', operation_id: 'operation_alpha' } },
    {
      site_id: 'site_alpha',
      directive_authority: 'cloudflare_directive_dual_record',
      fallback_authority: 'windows_fallback_dispatcher',
      directive_records: [
        {
          directive_record_id: 'directive_record_focus',
          classification_state: 'critical',
          latest_delay_minutes: 18,
          critical_minutes: 15,
          fallback_status: 'available',
          recorded_at: '2026-06-12T12:00:00.000Z',
        },
        {
          directive_record_id: 'directive_record_old',
          classification_state: 'critical',
        },
      ],
    },
    {
      site_id: 'site_alpha',
      directive_authority: 'cloudflare_primary_directive_delivery',
      directive_deliveries: [
        {
          delivery_id: 'delivery_old',
          directive_record_id: 'directive_record_old',
          delivery_state: 'cloudflare_primary_delivered',
          delivery_ok: true,
          dispatch_authority: 'cloudflare_primary_dispatcher',
          recorded_at: '2026-06-12T11:55:00.000Z',
        },
      ],
    },
    {
      operationSummary: {
        site_id: 'site_alpha',
        operation_id: 'operation_alpha',
        workflow_next_action: 'review_directive_delivery',
        workflow_reason: 'undelivered_directives',
        workflow_focus_ref: 'directive_record_focus',
      },
    },
  );

  assert.equal(summary.focused_directive_record_id, 'directive_record_focus');
  assert.equal(summary.focused_delivery_id, null);
  assert.equal(summary.undelivered_directive_record_count, 1);
  assert.equal(summary.latest_undelivered_directive_record_id, 'directive_record_focus');
  assert.equal(summary.focused_classification_state, 'critical');
  assert.equal(summary.focused_latest_delay_minutes, 18);
  assert.equal(summary.latest_delivery_recorded_at, null);
});

test('readDirectiveDeliveryReview reads operation state plus directive record and delivery lists', async () => {
  const calls = [];
  const result = await readDirectiveDeliveryReview({
    workerUrl: 'https://carrier.example',
    auth: { kind: 'operator_session', value: 'cookie', source: 'operator-session-file' },
    operation: 'operation.read',
    requestId: 'directive_delivery_review_test',
    format: 'json',
    focusRef: null,
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      webhook_delay_directive_limit: 5,
      webhook_delay_directive_delivery_limit: 6,
    },
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.operation === 'operation.read') {
      return responseJson({
        ok: true,
        operation: {
          site_id: 'site_alpha',
          operation_id: 'operation_alpha',
        },
      });
    }
    if (body.operation === 'webhook_delay.directive.dual_record.list') {
      return responseJson({
        ok: true,
        site_id: 'site_alpha',
        directive_authority: 'cloudflare_directive_dual_record',
        directive_records: [
          { directive_record_id: 'directive_record_focus', recorded_at: '2026-06-12T12:00:00.000Z' },
        ],
      });
    }
    if (body.operation === 'webhook_delay.directive.primary_with_fallback.list') {
      return responseJson({
        ok: true,
        site_id: 'site_alpha',
        directive_deliveries: [],
      });
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  });

  assert.deepEqual(calls.map((entry) => entry.operation), [
    'operation.read',
    'webhook_delay.directive.dual_record.list',
    'webhook_delay.directive.primary_with_fallback.list',
  ]);
  assert.equal(result.summary.directive_record_count, 1);
  assert.equal(result.summary.directive_delivery_count, 0);
  assert.equal(result.summary.undelivered_directive_record_count, 1);
});

test('formatDirectiveDeliveryReviewText renders directive review summary', () => {
  const text = formatDirectiveDeliveryReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      workflow_next_action: 'review_directive_delivery',
      workflow_reason: 'undelivered_directives',
      workflow_focus_ref: 'directive_record_focus',
      directive_record_count: 2,
      directive_delivery_count: 1,
      undelivered_directive_record_count: 1,
      latest_undelivered_directive_record_id: 'directive_record_focus',
      focused_delivery_id: null,
      focused_delivery_state: null,
      focused_delivery_ok: null,
      focused_directive_record_id: 'directive_record_focus',
      focused_classification_state: 'critical',
      focused_latest_delay_minutes: 18,
      focused_critical_minutes: 15,
      directive_authority: 'cloudflare_directive_dual_record',
      delivery_authority: 'cloudflare_primary_directive_delivery',
      dispatch_authority: 'cloudflare_primary_dispatcher',
      fallback_authority: 'windows_fallback_dispatcher',
      focused_fallback_status: 'available',
      latest_recorded_at: '2026-06-12T12:00:00.000Z',
      latest_delivery_recorded_at: '2026-06-12T11:55:00.000Z',
    },
  });

  assert.match(text, /Directive Delivery Review: ok/);
  assert.match(text, /Workflow: action=review_directive_delivery reason=undelivered_directives focus=directive_record_focus/);
  assert.match(text, /Directive Records: count=2 undelivered=1 latest_undelivered=directive_record_focus/);
  assert.match(text, /Directive Deliveries: count=1 focused_delivery=none state=none ok=unknown/);
  assert.match(text, /Authority: record=cloudflare_directive_dual_record delivery=cloudflare_primary_directive_delivery dispatch=cloudflare_primary_dispatcher fallback=windows_fallback_dispatcher/);
});

function responseJson(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}
