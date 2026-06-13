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
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'mailbox.send_accepted.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
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
      message_id: 'message_alpha',
      subject: 'Accepted subject',
      recorded_at: '2026-06-13T03:59:01.000Z',
    }],
  });

  assert.equal(summary.send_count, 1);
  assert.equal(summary.mailbox_send_authority, 'cloudflare_graph_mailbox_send');
  assert.equal(summary.latest_send_accepted_id, 'mailbox_send_accepted_alpha');
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
      sends: [{ send_accepted_id: 'mailbox_send_accepted_alpha', message_id: 'message_alpha', subject: 'Accepted subject' }],
    }),
    json: async () => ({
      site_id: 'site_alpha',
      mailbox_send_authority: 'cloudflare_graph_mailbox_send',
      mailbox_send_admission: 'admitted',
      mailbox_mutation_admission: 'not_admitted',
      sends: [{ send_accepted_id: 'mailbox_send_accepted_alpha', message_id: 'message_alpha', subject: 'Accepted subject' }],
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.mailbox_send_accepted_read.v1');
  assert.equal(result.summary.latest_send_accepted_id, 'mailbox_send_accepted_alpha');
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
      latest_send_accepted_id: 'mailbox_send_accepted_alpha',
      latest_message_id: 'message_alpha',
      latest_subject: 'Accepted subject',
      latest_recorded_at: '2026-06-13T03:59:01.000Z',
    },
  });

  assert.match(text, /Mailbox Send Accepted: ok/);
  assert.match(text, /Send Acceptance: count=1 authority=cloudflare_graph_mailbox_send admission=admitted/);
  assert.match(text, /Latest Accepted: id=mailbox_send_accepted_alpha message=message_alpha subject=Accepted subject/);
});
