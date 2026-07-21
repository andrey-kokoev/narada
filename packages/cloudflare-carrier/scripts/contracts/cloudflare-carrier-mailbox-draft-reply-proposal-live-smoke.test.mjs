import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxDraftReplyProposalLiveSmokeText,
  parseMailboxDraftReplyProposalLiveSmokeArgs,
  runMailboxDraftReplyProposalLiveSmoke,
} from '../workflows/cloudflare-carrier-mailbox-draft-reply-proposal-live-smoke.mjs';

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
    linked_draft_create_id: 'draft_alpha',
    linked_send_accepted_id: 'accepted_alpha',
    linked_send_confirmation_id: 'confirmation_alpha',
    mailbox_draft_reply_authority_partition: 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted',
  });

  assert.match(text, /Mailbox Draft Reply Proposal Smoke: ok/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Proposal Review: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:draft-reply-proposal:text/);
  assert.match(text, /Draft Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:outlook-draft:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref draft_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Accepted Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-accepted:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref accepted_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Confirmation Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-confirmation:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref confirmation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
});

test('formatMailboxDraftReplyProposalLiveSmokeText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatMailboxDraftReplyProposalLiveSmokeText({
    status: 'ok',
    worker_url: '',
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    proposal_id: 'proposal_alpha',
    linked_draft_create_id: 'draft_alpha',
    linked_send_accepted_id: 'accepted_alpha',
    linked_send_confirmation_id: 'confirmation_alpha',
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Proposal Review:/);
  assert.doesNotMatch(text, /Draft Read:/);
  assert.doesNotMatch(text, /Accepted Read:/);
  assert.doesNotMatch(text, /Confirmation Read:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
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
          mailbox_outlook_draft_creates: [{
            draft_create_id: 'draft_alpha',
            proposal_id: proposalId,
            send_accepted_id: 'accepted_alpha',
            send_confirmation_id: 'confirmation_alpha',
          }],
          operation_product_surface: {
            mailbox_draft_reply_proposal_count: 1,
            mailbox_send_accepted_count: 0,
            mailbox_send_confirmation_count: 0,
            mailbox_draft_reply_proposal_authority: 'cloudflare_carrier_site',
            mailbox_outlook_draft_create_admission: 'admitted',
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
  assert.equal(result.linked_draft_create_id, 'draft_alpha');
  assert.equal(result.linked_send_accepted_id, 'accepted_alpha');
  assert.equal(result.linked_send_confirmation_id, 'confirmation_alpha');
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
