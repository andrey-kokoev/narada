import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxOutlookDraftReadText,
  parseMailboxOutlookDraftReadArgs,
  readMailboxOutlookDraft,
  summarizeMailboxOutlookDraft,
} from './cloudflare-carrier-mailbox-outlook-draft-read.mjs';

test('parseMailboxOutlookDraftReadArgs configures mailbox outlook draft list operation', () => {
  const config = parseMailboxOutlookDraftReadArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--focus-ref', 'draft_live_1',
    '--token', 'test-token',
  ], {});

  assert.equal(config.operation, 'mailbox.outlook_draft.list');
  assert.equal(config.params.site_id, 'site_alpha');
  assert.equal(config.focusRef, 'draft_live_1');
  assert.equal(config.params.mailbox_outlook_draft_create_limit, 5000);
});

test('parseMailboxOutlookDraftReadArgs preserves explicit focused mailbox outlook draft limit', () => {
  const config = parseMailboxOutlookDraftReadArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_alpha',
    '--focus-ref', 'draft_live_1',
    '--mailbox-outlook-draft-limit', '1500',
    '--token', 'test-token',
  ], {});

  assert.equal(config.params.mailbox_outlook_draft_create_limit, 1500);
});

test('summarizeMailboxOutlookDraft returns latest draft metadata', () => {
  const summary = summarizeMailboxOutlookDraft({
    site_id: 'site_alpha',
    mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
    mailbox_outlook_draft_create_admission: 'admitted',
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    authority_partition: 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
    drafts: [
      {
        draft_create_id: 'draft_live_1',
        account_ref: 'help@example.com',
        operation_id: 'operation_alpha',
        proposal_id: 'proposal_1',
        send_accepted_id: 'accepted_1',
        send_confirmation_id: 'confirmation_1',
        source_message_ref: 'message_1',
        subject: 'Draft subject',
        body_preview: 'Draft preview text.',
        draft_create_posture: 'cloudflare_created_outlook_draft_send_not_admitted',
        recorded_at: '2026-06-12T12:00:00.000Z',
      },
    ],
  });

  assert.equal(summary.draft_count, 1);
  assert.equal(summary.latest_draft_create_id, 'draft_live_1');
  assert.equal(summary.latest_account_ref, 'help@example.com');
  assert.equal(summary.latest_operation_id, 'operation_alpha');
  assert.equal(summary.latest_proposal_id, 'proposal_1');
  assert.equal(summary.latest_send_accepted_id, 'accepted_1');
  assert.equal(summary.latest_send_confirmation_id, 'confirmation_1');
  assert.equal(summary.latest_message_id, 'message_1');
  assert.equal(summary.latest_subject, 'Draft subject');
  assert.equal(summary.latest_body_preview, 'Draft preview text.');
  assert.equal(summary.latest_draft_create_posture, 'cloudflare_created_outlook_draft_send_not_admitted');
});

test('readMailboxOutlookDraft reads mailbox outlook draft list surface', async () => {
  const result = await readMailboxOutlookDraft({
    workerUrl: 'https://carrier.example',
    auth: { kind: 'bearer', value: 'test-token', source: 'token' },
    operation: 'mailbox.outlook_draft.list',
    requestId: 'mailbox_outlook_draft_test',
    format: 'json',
    params: { site_id: 'site_alpha' },
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.operation, 'mailbox.outlook_draft.list');
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        site_id: 'site_alpha',
        mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
        mailbox_outlook_draft_create_admission: 'admitted',
        mailbox_send_admission: 'not_admitted',
        mailbox_mutation_admission: 'not_admitted',
        drafts: [{
          draft_create_id: 'draft_live_1',
          account_ref: 'help@example.com',
          proposal_id: 'proposal_1',
          source_message_ref: 'message_1',
          body_preview: 'Draft preview text.',
          draft_create_posture: 'cloudflare_created_outlook_draft_send_not_admitted',
        }],
      }),
    };
  });

  assert.equal(result.summary.draft_count, 1);
  assert.equal(result.summary.mailbox_outlook_draft_create_admission, 'admitted');
  assert.equal(result.summary.latest_message_id, 'message_1');
});

test('readMailboxOutlookDraft narrows to a focused historical draft', async () => {
  const result = await readMailboxOutlookDraft({
    workerUrl: 'https://carrier.example',
    auth: { kind: 'bearer', value: 'test-token', source: 'token' },
    operation: 'mailbox.outlook_draft.list',
    requestId: 'mailbox_outlook_draft_test',
    format: 'json',
    params: { site_id: 'site_alpha' },
    focusRef: 'draft_focus',
  }, async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      ok: true,
      site_id: 'site_alpha',
      drafts: [
        { draft_create_id: 'draft_live_1' },
        {
          draft_create_id: 'draft_focus',
          proposal_id: 'proposal_focus',
          source_message_ref: 'message_focus',
          recorded_at: '2026-06-13T04:01:00.000Z',
        },
      ],
    }),
  }));

  assert.equal(result.summary.draft_count, 1);
  assert.equal(result.summary.focused_draft_create_id, 'draft_focus');
  assert.equal(result.summary.latest_draft_create_id, 'draft_focus');
});

test('readMailboxOutlookDraft fails when focused draft is missing', async () => {
  await assert.rejects(
    () => readMailboxOutlookDraft({
      workerUrl: 'https://carrier.example',
      auth: { kind: 'bearer', value: 'test-token', source: 'token' },
      operation: 'mailbox.outlook_draft.list',
      requestId: 'mailbox_outlook_draft_test',
      format: 'json',
      params: { site_id: 'site_alpha' },
      focusRef: 'draft_missing',
    }, async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        site_id: 'site_alpha',
        drafts: [{ draft_create_id: 'draft_live_1' }],
      }),
    })),
    /mailbox_outlook_draft_read_focus_not_found:draft_missing/,
  );
});

test('formatMailboxOutlookDraftReadText renders mailbox outlook draft summary', () => {
  const text = formatMailboxOutlookDraftReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      draft_count: 1,
      mailbox_outlook_draft_create_authority: 'cloudflare_graph_outlook_draft_create',
      mailbox_outlook_draft_create_admission: 'admitted',
      mailbox_send_admission: 'not_admitted',
      mailbox_mutation_admission: 'not_admitted',
      authority_partition: 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
      latest_draft_create_id: 'draft_live_1',
      latest_account_ref: 'help@example.com',
      latest_operation_id: 'operation_alpha',
      latest_proposal_id: 'proposal_1',
      latest_send_accepted_id: 'accepted_1',
      latest_send_confirmation_id: 'confirmation_1',
      latest_message_id: 'message_1',
      latest_subject: 'Draft subject',
      latest_body_preview: 'Draft preview text.',
      latest_draft_create_posture: 'cloudflare_created_outlook_draft_send_not_admitted',
      latest_recorded_at: '2026-06-12T12:00:00.000Z',
    },
  });

  assert.match(text, /Mailbox Outlook Draft Review: ok/);
  assert.match(text, /Outlook Drafts: count=1 authority=cloudflare_graph_outlook_draft_create admission=admitted/);
  assert.match(text, /Admissions: send=not_admitted mutation=not_admitted/);
  assert.match(text, /Current Posture: cloudflare_created_outlook_draft_send_not_admitted/);
  assert.match(text, /Latest Draft: id=draft_live_1 proposal=proposal_1 account=help@example.com message=message_1 subject=Draft subject/);
  assert.match(text, /Proposal Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url https:\/\/carrier\.example --site site_alpha --focus-ref proposal_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Accepted Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-accepted:text -- --url https:\/\/carrier\.example --site site_alpha --focus-ref accepted_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Confirmation Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-confirmation:text -- --url https:\/\/carrier\.example --site site_alpha --focus-ref confirmation_1 --operator-session-file <operator-session-file>/);
  assert.match(text, /Body Preview: Draft preview text\./);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatMailboxOutlookDraftReadText prints focused labels for focused reads', () => {
  const text = formatMailboxOutlookDraftReadText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      draft_count: 1,
      focused_draft_create_id: 'draft_focus',
      latest_draft_create_id: 'draft_focus',
      latest_proposal_id: 'proposal_focus',
      latest_account_ref: 'help@example.com',
      latest_message_id: 'message_focus',
      latest_subject: 'Focused subject',
      latest_recorded_at: '2026-06-13T04:01:00.000Z',
    },
  });

  assert.match(text, /Focused Draft: id=draft_focus/);
  assert.match(text, /Focused Recorded: 2026-06-13T04:01:00.000Z/);
});

test('formatMailboxOutlookDraftReadText suppresses mailbox handoff without a real worker url', () => {
  const text = formatMailboxOutlookDraftReadText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      draft_count: 1,
      latest_draft_create_id: 'draft_live_1',
      latest_account_ref: 'help@example.com',
      latest_operation_id: 'operation_alpha',
      latest_proposal_id: 'proposal_1',
      latest_send_accepted_id: 'accepted_1',
      latest_send_confirmation_id: 'confirmation_1',
      latest_message_id: 'message_1',
      latest_subject: 'Draft subject',
    },
  });

  assert.doesNotMatch(text, /Proposal Read:/);
  assert.doesNotMatch(text, /Accepted Read:/);
  assert.doesNotMatch(text, /Confirmation Read:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /<worker-url>/);
});
