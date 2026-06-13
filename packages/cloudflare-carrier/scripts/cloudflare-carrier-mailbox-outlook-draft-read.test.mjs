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
    '--token', 'test-token',
  ], {});

  assert.equal(config.operation, 'mailbox.outlook_draft.list');
  assert.equal(config.params.site_id, 'site_alpha');
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
        proposal_id: 'proposal_1',
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
  assert.equal(summary.latest_proposal_id, 'proposal_1');
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
      latest_proposal_id: 'proposal_1',
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
  assert.match(text, /Body Preview: Draft preview text\./);
});
