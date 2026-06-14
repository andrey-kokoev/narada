import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxReadbackLiveSmokeText,
  parseMailboxReadbackLiveSmokeArgs,
  runMailboxReadbackLiveSmoke,
} from './cloudflare-carrier-mailbox-readback-live-smoke.mjs';

test('parseMailboxReadbackLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseMailboxReadbackLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatMailboxReadbackLiveSmokeText emits downstream reads', () => {
  const text = formatMailboxReadbackLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    mailbox_status_source_read_count: 1,
    mailbox_status_authority: 'cloudflare_graph_mailbox_status_source',
    mailbox_draft_reply_proposal_count: 2,
    mailbox_draft_reply_proposal_authority: 'cloudflare_carrier_site',
    mailbox_draft_reply_proposal_id: 'proposal_alpha',
    mailbox_outlook_draft_create_count: 3,
    mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
    mailbox_outlook_draft_create_admission: 'admitted',
    mailbox_outlook_draft_create_id: 'draft_alpha',
    mailbox_send_accepted_count: 4,
    mailbox_send_authority: 'cloudflare_graph_mailbox_send',
    mailbox_send_admission: 'admitted',
    mailbox_send_accepted_id: 'accepted_alpha',
    mailbox_send_confirmation_count: 5,
    mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
    mailbox_send_delivery_confirmation_admission: 'admitted',
    mailbox_send_confirmation_id: 'confirmation_alpha',
    mailbox_mutation_admission: 'not_admitted',
  });

  assert.match(text, /Mailbox Readback Smoke: ok/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.match(text, /Draft Proposal Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref proposal_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Draft Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:outlook-draft:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref draft_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Send Accepted Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-accepted:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref accepted_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Send Confirmation Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-confirmation:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref confirmation_alpha --operator-session-file <operator-session-file>/);
});

test('runMailboxReadbackLiveSmoke returns summarized mailbox readback state', async () => {
  const result = await runMailboxReadbackLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'mailbox.send_accepted.list') {
        return responseJson(200, {
          schema: 'narada.sonar.cloudflare_mailbox_send_accepted.v1',
          sends: [],
          mailbox_mutation_admission: 'not_admitted',
        });
      }
      if (body.operation === 'mailbox.send_confirmation.list') {
        return responseJson(200, {
          schema: 'narada.sonar.cloudflare_mailbox_send_confirmation.v1',
          confirmations: [],
          mailbox_mutation_admission: 'not_admitted',
        });
      }
      if (body.operation === 'operation.read') {
        return responseJson(200, {
          mailbox_draft_reply_proposals: [{ proposal_id: 'proposal_alpha' }],
          mailbox_outlook_draft_creates: [{ draft_create_id: 'draft_alpha' }],
          mailbox_send_accepted_records: [{ send_accepted_id: 'accepted_alpha' }],
          mailbox_send_confirmations: [{ send_confirmation_id: 'confirmation_alpha' }],
          operation_product_surface: {
            mailbox_status_source_read_count: 1,
            mailbox_status_authority: 'cloudflare_graph_mailbox_status_source',
            mailbox_authority_partition: 'mailbox_status_source_read_cloudflare_owned_send_and_mutation_not_admitted',
            mailbox_draft_reply_proposal_count: 0,
            mailbox_draft_reply_proposal_authority: 'cloudflare_carrier_site',
            mailbox_draft_reply_authority_partition: 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted',
            mailbox_outlook_draft_create_count: 0,
            mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
            mailbox_outlook_draft_create_admission: 'not_admitted',
            mailbox_outlook_draft_create_authority_partition: 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
            mailbox_send_accepted_count: 0,
            mailbox_send_authority: 'cloudflare_graph_mailbox_send',
            mailbox_send_confirmation_count: 0,
            mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
            mailbox_send_admission: 'not_admitted',
            mailbox_send_delivery_confirmation_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
          },
          authority_transfer_posture: {
            remaining_windows_domains: ['mailbox_write'],
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.mailbox_status_source_read_count, 1);
  assert.equal(result.mailbox_draft_reply_proposal_id, 'proposal_alpha');
  assert.equal(result.mailbox_outlook_draft_create_id, 'draft_alpha');
  assert.equal(result.mailbox_send_accepted_id, 'accepted_alpha');
  assert.equal(result.mailbox_send_confirmation_id, 'confirmation_alpha');
  assert.deepEqual(result.remaining_windows_domains, ['mailbox_write']);
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
