import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxSendLiveSmokeText,
  parseMailboxSendLiveSmokeArgs,
  runMailboxSendLiveSmoke,
} from './cloudflare-carrier-mailbox-send-live-smoke.mjs';

test('parseMailboxSendLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseMailboxSendLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
    '--account', 'mailbox@example.test',
    '--to', 'recipient@example.test',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.accountRef, 'mailbox@example.test');
  assert.equal(parsed.toRecipient, 'recipient@example.test');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatMailboxSendLiveSmokeText emits downstream reads', () => {
  const text = formatMailboxSendLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    account_ref: 'mailbox@example.test',
    to_recipient: 'recipient@example.test',
    proposal_id: 'proposal_alpha',
    draft_create_id: 'draft_alpha',
    outlook_draft_id: 'outlook_alpha',
    send_accepted_id: 'send_alpha',
    send_confirmation_id: 'confirm_alpha',
    mailbox_send_authority: 'cloudflare_graph_mailbox_send',
    mailbox_send_admission: 'admitted',
    mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
    delivery_confirmation_admission: 'admitted',
    mailbox_mutation_admission: 'not_admitted',
    mailbox_send_accepted_count: 1,
    mailbox_send_confirmation_count: 1,
    mailbox_outlook_draft_create_authority_partition: 'mailbox_outlook_draft_create_send_and_confirmation_cloudflare_owned_other_mutation_not_admitted',
  });

  assert.match(text, /Mailbox Send Smoke: ok/);
  assert.match(text, /Proposal: proposal_alpha/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.match(text, /Proposal Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref proposal_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Draft Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:outlook-draft:text/);
  assert.match(text, /Send Accepted Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-accepted:text/);
  assert.match(text, /Send Confirmation Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-confirmation:text/);
});

test('runMailboxSendLiveSmoke returns summarized send state', async () => {
  const result = await runMailboxSendLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    accountRef: 'mailbox@example.test',
    toRecipient: 'recipient@example.test',
    confirmationDelayMs: 0,
    confirmationAttempts: 2,
    subject: 'Smoke subject',
    bodyText: 'Smoke body',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'mailbox.outlook_draft.create') {
        return responseJson(200, {
          status: 'created',
          mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
          mailbox_outlook_draft_create_admission: 'admitted',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
          record: { outlook_draft_id: 'outlook_alpha' },
        });
      }
      if (body.operation === 'mailbox.outlook_draft.send' && body.request_id.includes('refused_missing_cutover')) {
        return responseJson(403, { code: 'mailbox_send_requires_cutover_point_ref' });
      }
      if (body.operation === 'mailbox.outlook_draft.send') {
        return responseJson(200, {
          schema: 'narada.sonar.cloudflare_mailbox_send_accepted.v1',
          status: 'accepted',
          mailbox_send_authority: 'cloudflare_graph_mailbox_send',
          mailbox_send_admission: 'admitted',
          mailbox_mutation_admission: 'not_admitted',
          delivery_confirmation_admission: 'not_admitted',
          record: { send_accepted_id: body.params.send_accepted_id },
        });
      }
      if (body.operation === 'mailbox.send_accepted.list') {
        return responseJson(200, {
          mailbox_send_authority: 'cloudflare_graph_mailbox_send',
          mailbox_send_admission: 'admitted',
          mailbox_mutation_admission: 'not_admitted',
          delivery_confirmation_admission: 'not_admitted',
          authority_partition: 'mailbox_send_cloudflare_owned_delivery_not_confirmed_other_mutation_not_admitted',
          sends: [{ send_accepted_id: extractId(body.request_id, 'mailbox_send_accepted_list_', 'mailbox_send_accepted_live_') }],
        });
      }
      if (body.operation === 'operation.read' && body.request_id.includes('after_send')) {
        return responseJson(200, {
          mailbox_send_accepted_records: [{ send_accepted_id: extractId(body.request_id, 'mailbox_send_operation_read_after_send_', 'mailbox_send_accepted_live_') }],
          operation_product_surface: {
            mailbox_send_accepted_count: 1,
            mailbox_send_authority: 'cloudflare_graph_mailbox_send',
            mailbox_send_admission: 'admitted',
            mailbox_send_delivery_confirmation_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
            mailbox_outlook_draft_create_authority_partition: 'mailbox_outlook_draft_create_and_send_cloudflare_owned_confirmation_and_other_mutation_not_admitted',
          },
        });
      }
      if (body.operation === 'mailbox.send_confirmation.read' && body.request_id.includes('refused_missing_send')) {
        return responseJson(403, { code: 'mailbox_send_confirmation_requires_existing_send_accepted' });
      }
      if (body.operation === 'mailbox.send_confirmation.read') {
        return responseJson(200, {
          schema: 'narada.sonar.cloudflare_mailbox_send_confirmation.v1',
          status: 'confirmed_by_reconciliation_read',
          mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
          delivery_confirmation_admission: 'admitted',
          mailbox_mutation_admission: 'not_admitted',
          record: { send_confirmation_id: body.params.send_confirmation_id },
        });
      }
      if (body.operation === 'mailbox.send_confirmation.list') {
        return responseJson(200, {
          mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
          delivery_confirmation_admission: 'admitted',
          mailbox_mutation_admission: 'not_admitted',
          authority_partition: 'mailbox_send_confirmation_cloudflare_owned_other_mutation_not_admitted',
          confirmations: [{ send_confirmation_id: extractId(body.request_id, 'mailbox_send_confirmation_list_', 'mailbox_send_confirmation_live_') }],
        });
      }
      if (body.operation === 'operation.read' && body.request_id.includes('after_confirmation')) {
        return responseJson(200, {
          mailbox_send_confirmations: [{ send_confirmation_id: extractId(body.request_id, 'mailbox_send_operation_read_after_confirmation_', 'mailbox_send_confirmation_live_') }],
          operation_product_surface: {
            mailbox_send_accepted_count: 1,
            mailbox_send_confirmation_count: 1,
            mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
            mailbox_send_delivery_confirmation_admission: 'admitted',
            mailbox_mutation_admission: 'not_admitted',
            mailbox_outlook_draft_create_authority_partition: 'mailbox_outlook_draft_create_send_and_confirmation_cloudflare_owned_other_mutation_not_admitted',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.match(result.proposal_id, /^mailbox_send_live_proposal_/);
  assert.equal(result.outlook_draft_id, 'outlook_alpha');
  assert.equal(result.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
  assert.equal(result.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
  assert.equal(result.mailbox_send_confirmation_count, 1);
});

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}

function extractId(requestId, prefix, idPrefix) {
  return requestId.startsWith(prefix)
    ? `${idPrefix}${requestId.slice(prefix.length)}`
    : `${idPrefix}unknown`;
}
