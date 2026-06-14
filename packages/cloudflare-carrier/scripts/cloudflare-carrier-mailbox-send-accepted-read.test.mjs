import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxSendAcceptedReadText,
  parseMailboxSendAcceptedReadArgs,
  readMailboxSendAccepted,
  summarizeMailboxSendAccepted,
} from './cloudflare-carrier-mailbox-send-accepted-read.mjs';

test('parseMailboxSendAcceptedReadArgs reuses mailbox send accepted list parsing', () => {
  const parsed = parseMailboxSendAcceptedReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--focus-ref', 'mailbox_send_accepted_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'mailbox.send_accepted.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.focusRef, 'mailbox_send_accepted_alpha');
  assert.equal(parsed.params.mailbox_send_accepted_limit, 5000);
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('summarizeMailboxSendAccepted lifts latest accepted send details', () => {
  const summary = summarizeMailboxSendAccepted({
    site_id: 'site_alpha',
    mailbox_send_authority: 'cloudflare_graph_mailbox_send',
    mailbox_send_admission: 'admitted',
    mailbox_mutation_admission: 'not_admitted',
    sends: [{
      send_accepted_id: 'mailbox_send_accepted_alpha',
      source_message_ref: 'message_alpha',
      record: {
        operation_id: 'operation_alpha',
        send_request: {
          operation_id: 'operation_alpha',
          source_message_ref: 'message_alpha',
        },
      },
      recorded_at: '2026-06-13T03:59:01.000Z',
    }],
  });

  assert.equal(summary.send_count, 1);
  assert.equal(summary.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
  assert.equal(summary.latest_account_ref, null);
  assert.equal(summary.latest_proposal_id, null);
  assert.equal(summary.latest_draft_create_id, null);
  assert.equal(summary.latest_operation_id, 'operation_alpha');
  assert.equal(summary.latest_outlook_draft_id, null);
  assert.equal(summary.latest_send_posture, null);
  assert.equal(summary.latest_send_accepted_id, 'mailbox_send_accepted_alpha');
  assert.equal(summary.latest_message_id, 'message_alpha');
  assert.equal(summary.latest_subject, null);
});

test('readMailboxSendAccepted returns summarized mailbox send acceptance', async () => {
  const result = await readMailboxSendAccepted({
    workerUrl: 'https://carrier.example.test',
    operation: 'mailbox.send_accepted.list',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site_id: 'site_alpha',
      mailbox_send_authority: 'cloudflare_graph_mailbox_send',
      mailbox_send_admission: 'admitted',
      mailbox_mutation_admission: 'not_admitted',
      sends: [{ send_accepted_id: 'mailbox_send_accepted_alpha', source_message_ref: 'message_alpha' }],
    }),
    json: async () => ({
      site_id: 'site_alpha',
      mailbox_send_authority: 'cloudflare_graph_mailbox_send',
      mailbox_send_admission: 'admitted',
      mailbox_mutation_admission: 'not_admitted',
      sends: [{ send_accepted_id: 'mailbox_send_accepted_alpha', source_message_ref: 'message_alpha' }],
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.mailbox_send_accepted_read.v1');
  assert.equal(result.summary.latest_send_accepted_id, 'mailbox_send_accepted_alpha');
  assert.equal(result.summary.latest_message_id, 'message_alpha');
});

test('readMailboxSendAccepted narrows to a focused historical accepted send', async () => {
  const result = await readMailboxSendAccepted({
    workerUrl: 'https://carrier.example.test',
    operation: 'mailbox.send_accepted.list',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
    focusRef: 'mailbox_send_accepted_focus',
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site_id: 'site_alpha',
      sends: [
        { send_accepted_id: 'mailbox_send_accepted_alpha' },
        {
          send_accepted_id: 'mailbox_send_accepted_focus',
          proposal_id: 'proposal_focus',
          source_message_ref: 'message_focus',
          recorded_at: '2026-06-13T04:01:00.000Z',
        },
      ],
    }),
  }));

  assert.equal(result.summary.send_count, 1);
  assert.equal(result.summary.focused_send_accepted_id, 'mailbox_send_accepted_focus');
  assert.equal(result.summary.latest_send_accepted_id, 'mailbox_send_accepted_focus');
});

test('readMailboxSendAccepted fails when focused accepted send is missing', async () => {
  await assert.rejects(
    () => readMailboxSendAccepted({
      workerUrl: 'https://carrier.example.test',
      operation: 'mailbox.send_accepted.list',
      params: { site_id: 'site_alpha' },
      auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
      focusRef: 'mailbox_send_accepted_missing',
    }, async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({
        site_id: 'site_alpha',
        sends: [{ send_accepted_id: 'mailbox_send_accepted_alpha' }],
      }),
    })),
    /mailbox_send_accepted_read_focus_not_found:mailbox_send_accepted_missing/,
  );
});

test('formatMailboxSendAcceptedReadText prints mailbox send acceptance summary', () => {
  const text = formatMailboxSendAcceptedReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      send_count: 1,
      mailbox_send_authority: 'cloudflare_graph_mailbox_send',
      mailbox_send_admission: 'admitted',
      mailbox_mutation_admission: 'not_admitted',
      latest_account_ref: 'help@example.test',
      latest_proposal_id: 'mailbox_send_proposal_alpha',
      latest_draft_create_id: 'mailbox_outlook_draft_create_alpha',
      latest_operation_id: 'operation_alpha',
      latest_outlook_draft_id: 'outlook_draft_alpha',
      latest_send_posture: 'cloudflare_graph_send_accepted_delivery_not_confirmed',
      latest_send_accepted_id: 'mailbox_send_accepted_alpha',
      latest_message_id: 'message_alpha',
      latest_subject: null,
      latest_recorded_at: '2026-06-13T03:59:01.000Z',
    },
  });

  assert.match(text, /Mailbox Send Accepted: ok/);
  assert.match(text, /Send Acceptance: count=1 authority=cloudflare_graph_mailbox_send admission=admitted/);
  assert.match(text, /Current Posture: cloudflare_graph_send_accepted_delivery_not_confirmed/);
  assert.match(text, /Latest Accepted: id=mailbox_send_accepted_alpha proposal=mailbox_send_proposal_alpha account=help@example.test message=message_alpha subject=none/);
  assert.doesNotMatch(text, /Proposal Read:/);
  assert.match(text, /Draft Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:outlook-draft:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref mailbox_outlook_draft_create_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatMailboxSendAcceptedReadText prints focused labels for focused reads', () => {
  const text = formatMailboxSendAcceptedReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      send_count: 1,
      focused_send_accepted_id: 'mailbox_send_accepted_focus',
      latest_send_accepted_id: 'mailbox_send_accepted_focus',
      latest_proposal_id: 'proposal_focus',
      latest_account_ref: 'help@example.test',
      latest_message_id: 'message_focus',
      latest_subject: null,
      latest_recorded_at: '2026-06-13T04:01:00.000Z',
    },
  });

  assert.match(text, /Focused Accepted: id=mailbox_send_accepted_focus/);
  assert.match(text, /Focused Recorded: 2026-06-13T04:01:00.000Z/);
});
