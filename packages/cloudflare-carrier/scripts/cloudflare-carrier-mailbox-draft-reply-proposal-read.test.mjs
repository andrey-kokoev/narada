import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxDraftReplyProposalReadText,
  parseMailboxDraftReplyProposalReadArgs,
  readMailboxDraftReplyProposal,
} from './cloudflare-carrier-mailbox-draft-reply-proposal-read.mjs';

test('parseMailboxDraftReplyProposalReadArgs extends operation.read params with mailbox limits', () => {
  const parsed = parseMailboxDraftReplyProposalReadArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_narada_cloudflare',
    '--operation-id', 'operation_site_read',
    '--proposal-limit', '7',
    '--draft-create-limit', '5',
    '--focus-ref', 'mailbox_draft_reply_proposal_live_1',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {});

  assert.equal(parsed.operation, 'operation.read');
  assert.equal(parsed.params.site_id, 'site_narada_cloudflare');
  assert.equal(parsed.params.operation_id, 'operation_site_read');
  assert.equal(parsed.params.mailbox_draft_reply_proposal_limit, 7);
  assert.equal(parsed.params.mailbox_outlook_draft_create_limit, 5);
  assert.equal(parsed.focusRef, 'mailbox_draft_reply_proposal_live_1');
});

test('readMailboxDraftReplyProposal summarizes focused proposal and linked draft creates', async () => {
  const fetchImpl = async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        ok: true,
        operation: { site_id: 'site_narada_cloudflare', operation_id: 'operation_site_read' },
        mailbox_draft_reply_proposals: [
          {
            proposal_id: 'mailbox_draft_reply_proposal_live_1',
            account_ref: 'help@global-maxima.com',
            source_message_ref: 'graph-message-1',
            subject: 'Re: draft',
            proposal_posture: 'proposal_only_no_outlook_draft_create',
            proposal_authority: 'cloudflare_carrier_site',
            mailbox_outlook_draft_create_admission: 'not_admitted',
            mailbox_send_admission: 'not_admitted',
            mailbox_mutation_admission: 'not_admitted',
            windows_draft_executor_fallback: 'available',
            recorded_at: '2026-06-12T00:00:00.000Z',
            recorded_by_principal_id: 'service',
          },
        ],
        mailbox_outlook_draft_creates: [
          { draft_create_id: 'draft_create_1', proposal_id: 'mailbox_draft_reply_proposal_live_1' },
          { draft_create_id: 'draft_create_2', proposal_id: 'different_proposal' },
        ],
        operation_focus_reviews: [
          {
            review_id: 'review_1',
            focus_kind: 'mailbox_draft_reply_proposal',
            focus_ref: 'mailbox_draft_reply_proposal_live_1',
            review_status: 'acknowledged',
            recorded_at: '2026-06-12T00:05:00.000Z',
          },
        ],
      });
    },
  });

  const result = await readMailboxDraftReplyProposal({
    workerUrl: 'https://carrier.example',
    operation: 'operation.read',
    requestId: 'request_1',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      mailbox_draft_reply_proposal_limit: 20,
      mailbox_outlook_draft_create_limit: 20,
    },
    format: 'json',
    focusRef: 'mailbox_draft_reply_proposal_live_1',
  }, fetchImpl);

  assert.equal(result.summary.focused_proposal_id, 'mailbox_draft_reply_proposal_live_1');
  assert.equal(result.summary.linked_draft_create_count, 1);
  assert.equal(result.summary.proposal_authority, 'cloudflare_carrier_site');
  assert.equal(result.summary.latest_focus_review.review_status, 'acknowledged');
});

test('formatMailboxDraftReplyProposalReadText surfaces review ack command', () => {
  const text = formatMailboxDraftReplyProposalReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      workflow_next_action: 'review_mailbox_draft_reply_proposal',
      workflow_reason: 'operation_operator_focus_needs_review',
      proposal_count: 1,
      focused_proposal_id: 'mailbox_draft_reply_proposal_live_1',
      focused_account_ref: 'help@global-maxima.com',
      focused_source_message_ref: 'graph-message-1',
      focused_subject: 'Re: draft',
      focused_proposal_posture: 'proposal_only_no_outlook_draft_create',
      proposal_authority: 'cloudflare_carrier_site',
      windows_draft_executor_fallback: 'available',
      mailbox_outlook_draft_create_admission: 'not_admitted',
      mailbox_send_admission: 'not_admitted',
      mailbox_mutation_admission: 'not_admitted',
      linked_draft_create_count: 0,
    },
  });

  assert.match(text, /Mailbox Draft Reply Proposal Read: ok/);
  assert.match(text, /Workflow Route: action=review_mailbox_draft_reply_proposal/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
});
