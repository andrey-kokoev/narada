import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxStatusSourceLiveSmokeText,
  parseMailboxStatusSourceLiveSmokeArgs,
  runMailboxStatusSourceLiveSmoke,
} from './cloudflare-carrier-mailbox-status-source-live-smoke.mjs';

test('parseMailboxStatusSourceLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseMailboxStatusSourceLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
    '--account', 'mailbox@example.test',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.operationId, 'operation_alpha');
  assert.equal(parsed.accountRef, 'mailbox@example.test');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatMailboxStatusSourceLiveSmokeText emits operator follow-on reads', () => {
  const text = formatMailboxStatusSourceLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    account_ref: 'mailbox@example.test',
    read_id: 'read_alpha',
    mailbox_status_authority: 'cloudflare_graph_mailbox_status_source',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    mailbox_status_source_read_count: 3,
    mailbox_authority_partition: 'mailbox_status_source_read_cloudflare_owned_send_and_mutation_not_admitted',
  });

  assert.match(text, /Mailbox Status Source Smoke: ok/);
  assert.match(text, /Mailbox Readback Smoke: pnpm --filter @narada2\/cloudflare-carrier mailbox:readback-smoke:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatMailboxStatusSourceLiveSmokeText suppresses downstream links without site or operation ids', () => {
  const text = formatMailboxStatusSourceLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: '',
    operation_id: '',
    account_ref: 'mailbox@example.test',
    read_id: 'read_alpha',
    mailbox_status_source_read_count: 3,
  });

  assert.doesNotMatch(text, /Mailbox Readback Smoke:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('runMailboxStatusSourceLiveSmoke returns summarized status-source state', async () => {
  const result = await runMailboxStatusSourceLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    accountRef: 'mailbox@example.test',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'mailbox.status_source.read' && body.params.account_ref === '') {
        return responseJson(400, { code: 'mailbox_account_ref_missing' });
      }
      if (body.operation === 'mailbox.status_source.read') {
        const readId = body.params.read_id;
        return responseJson(200, {
          status: 'recorded',
          schema: 'narada.sonar.cloudflare_mailbox_status_source_read.v1',
          mailbox_status_authority: 'cloudflare_graph_mailbox_status_source',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
          read: {
            source_locus: 'cloudflare_carrier_site',
            source_adapter: 'microsoft_graph_mailbox_status',
            read_id: readId,
            account_ref: 'mailbox@example.test',
            unread_count: 4,
            pending_draft_count: 1,
          },
        });
      }
      if (body.operation === 'mailbox.status_source.list') {
        return responseJson(200, {
          mailbox_status_authority: 'cloudflare_graph_mailbox_status_source',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
          reads: [{ read_id: extractSuffixReadId(body.request_id) }],
        });
      }
      if (body.operation === 'operation.read') {
        const readId = extractSuffixReadId(body.request_id);
        return responseJson(200, {
          mailbox_status_source_reads: [{ read_id: readId }],
          operation_product_surface: {
            mailbox_status_source_read_count: 1,
            mailbox_send_accepted_count: 0,
            mailbox_send_confirmation_count: 0,
            mailbox_status_authority: 'cloudflare_graph_mailbox_status_source',
            mailbox_send_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
            mailbox_authority_partition: 'mailbox_status_source_read_cloudflare_owned_send_and_mutation_not_admitted',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.mailbox_status_authority, 'cloudflare_graph_mailbox_status_source');
  assert.equal(result.mailbox_status_source_read_count, 1);
});

function extractSuffixReadId(requestId) {
  return requestId
    .replace(/^mailbox_status_source_(?:list_|operation_read_)?/, 'mailbox_status_source_live_')
    .replace(/^mailbox_status_source_read_/, 'mailbox_status_source_live_');
}

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
