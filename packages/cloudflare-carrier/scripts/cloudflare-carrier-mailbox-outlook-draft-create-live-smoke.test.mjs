import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxOutlookDraftCreateLiveSmokeText,
  parseMailboxOutlookDraftCreateLiveSmokeArgs,
  runMailboxOutlookDraftCreateLiveSmoke,
} from './cloudflare-carrier-mailbox-outlook-draft-create-live-smoke.mjs';

test('parseMailboxOutlookDraftCreateLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseMailboxOutlookDraftCreateLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
    '--account', 'mailbox@example.test',
    '--to', 'target@example.test',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.toRecipient, 'target@example.test');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatMailboxOutlookDraftCreateLiveSmokeText emits downstream reads', () => {
  const text = formatMailboxOutlookDraftCreateLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    account_ref: 'mailbox@example.test',
    draft_create_id: 'draft_alpha',
    outlook_draft_id: 'outlook_alpha',
    mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
    mailbox_outlook_draft_create_admission: 'admitted',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    mailbox_outlook_draft_create_count: 1,
    mailbox_outlook_draft_create_authority_partition: 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
  });

  assert.match(text, /Mailbox Outlook Draft Create Smoke: ok/);
  assert.match(text, /Draft Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:outlook-draft:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runMailboxOutlookDraftCreateLiveSmoke returns summarized draft-create state', async () => {
  const result = await runMailboxOutlookDraftCreateLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    accountRef: 'mailbox@example.test',
    toRecipient: 'target@example.test',
    sourceMessageRef: null,
    proposalId: null,
    proposalRef: null,
    subject: null,
    bodyText: null,
    bodySha256: 'd'.repeat(64),
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'mailbox.outlook_draft.create' && body.params.draft_create_id.endsWith('_refused_send')) {
        return responseJson(400, { code: 'mailbox_outlook_draft_create_send_admission_invalid' });
      }
      if (body.operation === 'mailbox.outlook_draft.create') {
        return responseJson(200, {
          status: 'created',
          mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
          mailbox_outlook_draft_create_admission: 'admitted',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
          record: { outlook_draft_id: 'outlook-alpha' },
        });
      }
      if (body.operation === 'mailbox.outlook_draft.list') {
        return responseJson(200, {
          drafts: [{ draft_create_id: extractDraftCreateId(body.request_id) }],
          mailbox_outlook_draft_create_admission: 'admitted',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
          authority_partition: 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
        });
      }
      if (body.operation === 'operation.read') {
        const draftCreateId = extractDraftCreateId(body.request_id);
        return responseJson(200, {
          mailbox_outlook_draft_creates: [{
            draft_create_id: draftCreateId,
            mailbox_outlook_draft_create_admission: 'admitted',
            mailbox_send_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
          }],
          operation_product_surface: {
            mailbox_outlook_draft_create_count: 1,
            mailbox_outlook_draft_create_admission: 'admitted',
            mailbox_send_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
            mailbox_outlook_draft_create_authority_partition: 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.mailbox_outlook_draft_create_authority, 'cloudflare_graph_outlook_draft_create');
  assert.equal(result.mailbox_outlook_draft_create_count, 1);
});

function extractDraftCreateId(requestId) {
  return requestId
    .replace(/^mailbox_outlook_draft_create_list_/, 'mailbox_outlook_draft_create_live_')
    .replace(/^mailbox_outlook_draft_create_operation_read_/, 'mailbox_outlook_draft_create_live_');
}

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
