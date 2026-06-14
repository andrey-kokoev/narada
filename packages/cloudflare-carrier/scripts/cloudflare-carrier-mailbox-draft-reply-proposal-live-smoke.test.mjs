import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxDraftReplyProposalLiveSmokeText,
  parseMailboxDraftReplyProposalLiveSmokeArgs,
  runMailboxDraftReplyProposalLiveSmoke,
} from './cloudflare-carrier-mailbox-draft-reply-proposal-live-smoke.mjs';

test('parseMailboxDraftReplyProposalLiveSmokeArgs supports operator session auth and text format', () => {
  const parsed = parseMailboxDraftReplyProposalLiveSmokeArgs([
    '--url', 'https://carrier.example.test',
    '--format', 'text',
    '--operator-session-cookie', 'operator-cookie',
    '--site', 'site_alpha',
    '--operation', 'operation_alpha',
    '--account', 'mailbox@example.test',
  ], {}, { loadEnv: false });

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.accountRef, 'mailbox@example.test');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'operator-cookie',
    source: 'operator-session-cookie',
  });
});

test('formatMailboxDraftReplyProposalLiveSmokeText emits downstream reads', () => {
  const text = formatMailboxDraftReplyProposalLiveSmokeText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    account_ref: 'mailbox@example.test',
    proposal_id: 'proposal_alpha',
    proposal_authority: 'cloudflare_carrier_site',
    mailbox_outlook_draft_create_admission: 'not_admitted',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    mailbox_draft_reply_proposal_count: 1,
    mailbox_outlook_draft_create_count: 0,
    mailbox_draft_reply_authority_partition: 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted',
  });

  assert.match(text, /Mailbox Draft Reply Proposal Smoke: ok/);
  assert.match(text, /Proposal Review: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:draft-reply-proposal:text/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('runMailboxDraftReplyProposalLiveSmoke returns summarized proposal state', async () => {
  const result = await runMailboxDraftReplyProposalLiveSmoke({
    workerUrl: 'https://carrier.example.test',
    auth: { kind: 'operator_session', value: 'operator-cookie', source: 'operator-session-cookie' },
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    accountRef: 'mailbox@example.test',
    sourceMessageRef: null,
    subject: 'subject',
    recipientCount: 1,
    bodyPreview: 'preview',
    bodySha256: 'b'.repeat(64),
    rationale: 'rationale',
  }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.cookie, 'narada_operator_session=operator-cookie');
      const body = JSON.parse(init.body);
      if (body.operation === 'mailbox.draft_reply_proposal.record' && body.params.proposal_id.endsWith('_refused_draft_create')) {
        return responseJson(400, { code: 'mailbox_draft_reply_proposal_draft_create_admission_invalid' });
      }
      if (body.operation === 'mailbox.draft_reply_proposal.record' && body.params.proposal_id.endsWith('_refused_send')) {
        return responseJson(400, { code: 'mailbox_draft_reply_proposal_send_admission_invalid' });
      }
      if (body.operation === 'mailbox.draft_reply_proposal.record') {
        return responseJson(200, {
          status: 'recorded',
          proposal_authority: 'cloudflare_carrier_site',
          mailbox_outlook_draft_create_admission: 'not_admitted',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
        });
      }
      if (body.operation === 'mailbox.draft_reply_proposal.list') {
        return responseJson(200, {
          proposals: [{ proposal_id: extractProposalId(body.request_id) }],
          proposal_authority: 'cloudflare_carrier_site',
          mailbox_outlook_draft_create_admission: 'not_admitted',
          mailbox_send_admission: 'not_admitted',
          mailbox_mutation_admission: 'not_admitted',
          authority_partition: 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted',
        });
      }
      if (body.operation === 'operation.read') {
        const proposalId = extractProposalId(body.request_id);
        return responseJson(200, {
          mailbox_draft_reply_proposals: [{ proposal_id: proposalId }],
          mailbox_outlook_draft_creates: [],
          operation_product_surface: {
            mailbox_draft_reply_proposal_count: 1,
            mailbox_send_accepted_count: 0,
            mailbox_send_confirmation_count: 0,
            mailbox_draft_reply_proposal_authority: 'cloudflare_carrier_site',
            mailbox_outlook_draft_create_admission: 'not_admitted',
            mailbox_send_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
            mailbox_draft_reply_authority_partition: 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted',
          },
        });
      }
      throw new Error(`unexpected_operation:${body.operation}`);
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.auth_source, 'operator-session-cookie');
  assert.equal(result.proposal_authority, 'cloudflare_carrier_site');
  assert.equal(result.mailbox_draft_reply_proposal_count, 1);
});

function extractProposalId(requestId) {
  return requestId
    .replace(/^mailbox_draft_reply_proposal_list_/, 'mailbox_draft_reply_proposal_live_')
    .replace(/^mailbox_draft_reply_proposal_operation_read_/, 'mailbox_draft_reply_proposal_live_');
}

function responseJson(status, body) {
  return {
    status,
    async json() {
      return body;
    },
  };
}
