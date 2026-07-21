import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxStatusShadowLiveSmokeText,
  parseMailboxStatusShadowLiveSmokeArgs,
  runMailboxStatusShadowLiveSmoke,
} from '../workflows/cloudflare-carrier-mailbox-status-shadow-live-smoke.mjs';

test('parseMailboxStatusShadowLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseMailboxStatusShadowLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
    '--account', 'mailbox:operator',
    '--status', 'observed',
    '--unread-count', '2',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.accountRef, 'mailbox:operator');
  assert.equal(parsed.unreadCount, 2);
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatMailboxStatusShadowLiveSmokeText emits operator follow-on reads', () => {
  const text = formatMailboxStatusShadowLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    account_ref: 'mailbox:operator',
    read_id: 'read_alpha',
    mailbox_status_authority: 'windows_mailbox_status_source',
    mailbox_write_authority: 'windows_mailbox_mcp',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    mailbox_status_shadow_read_count: 2,
    mailbox_authority_partition: 'mailbox_status_shadow_read_cloudflare_recorded_send_and_mutation_windows_owned',
  });

  assert.match(text, /Mailbox Status Shadow Smoke: ok/);
  assert.match(text, /Mailbox Readback Smoke: pnpm --filter @narada2\/cloudflare-carrier mailbox:readback-smoke:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatMailboxStatusShadowLiveSmokeText suppresses downstream links without site or operation ids', () => {
  const text = formatMailboxStatusShadowLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: '',
    operation_id: '',
    account_ref: 'mailbox:operator',
    read_id: 'read_alpha',
    mailbox_status_shadow_read_count: 2,
  });

  assert.doesNotMatch(text, /Mailbox Readback Smoke:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('runMailboxStatusShadowLiveSmoke returns summarized status-shadow state', async () => {
  const result = await runMailboxStatusShadowLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    accountRef: 'mailbox:operator',
    status: 'observed',
    unreadCount: 0,
    pendingDraftCount: 0,
    pendingSendCount: 0,
    latestMessageAt: null,
    ticketCount: 0,
    syncState: 'manual_live_smoke',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'mailbox.status_shadow.record' && body.params.read_id.endsWith('_refused_send')) {
        return responseJson(400, { code: 'mailbox_status_shadow_read_send_admission_invalid' });
      }
      if (body.operation === 'mailbox.status_shadow.record') {
        return responseJson(200, {
          status: 'recorded',
          mailbox_status_authority: 'windows_mailbox_status_source',
          mailbox_write_authority: 'windows_mailbox_mcp',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
        });
      }
      if (body.operation === 'mailbox.status_shadow.list') {
        return responseJson(200, {
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
          reads: [{
            read_id: extractSuffixReadId(body.request_id),
            mailbox_send_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
          }],
        });
      }
      if (body.operation === 'operation.read') {
        const readId = extractSuffixReadId(body.request_id);
        return responseJson(200, {
          mailbox_status_shadow_reads: [{ read_id: readId }],
          operation_product_surface: {
            mailbox_status_shadow_read_count: 1,
            mailbox_status_source_read_count: 0,
            mailbox_send_accepted_count: 0,
            mailbox_send_confirmation_count: 0,
            mailbox_status_authority: 'windows_mailbox_status_source',
            mailbox_shadow_target_locus: 'cloudflare_carrier_site',
            mailbox_send_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
            mailbox_authority_partition: 'mailbox_status_shadow_read_cloudflare_recorded_send_and_mutation_windows_owned',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.mailbox_status_authority, 'windows_mailbox_status_source');
  assert.equal(result.mailbox_write_authority, 'windows_mailbox_mcp');
  assert.equal(result.mailbox_status_shadow_read_count, 1);
});

function extractSuffixReadId(requestId) {
  return requestId
    .replace(/^mailbox_status_shadow_(?:list_|operation_read_)?/, 'mailbox_status_shadow_live_')
    .replace(/^mailbox_status_shadow_record_/, 'mailbox_status_shadow_live_');
}

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
