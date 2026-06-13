import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMailboxSendConfirmationReadText,
  parseMailboxSendConfirmationReadArgs,
  readMailboxSendConfirmation,
  summarizeMailboxSendConfirmation,
} from './cloudflare-carrier-mailbox-send-confirmation-read.mjs';

test('parseMailboxSendConfirmationReadArgs reuses mailbox send confirmation list parsing', () => {
  const parsed = parseMailboxSendConfirmationReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'mailbox.send_confirmation.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('summarizeMailboxSendConfirmation lifts latest confirmation details', () => {
  const summary = summarizeMailboxSendConfirmation({
    site_id: 'site_alpha',
    mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
    delivery_confirmation_admission: 'admitted',
    mailbox_mutation_admission: 'not_admitted',
    confirmations: [{
      send_confirmation_id: 'mailbox_send_confirmation_alpha',
      sent_message_ref: 'message_alpha',
      sent_subject: 'Confirmed subject',
      recorded_at: '2026-06-13T03:59:01.000Z',
    }],
  });

  assert.equal(summary.confirmation_count, 1);
  assert.equal(summary.mailbox_send_confirmation_authority, 'cloudflare_graph_sent_items_reconciliation');
  assert.equal(summary.mailbox_send_delivery_confirmation_admission, 'admitted');
  assert.equal(summary.latest_send_confirmation_id, 'mailbox_send_confirmation_alpha');
  assert.equal(summary.latest_message_id, 'message_alpha');
  assert.equal(summary.latest_subject, 'Confirmed subject');
});

test('readMailboxSendConfirmation returns summarized mailbox send confirmation', async () => {
  const result = await readMailboxSendConfirmation({
    workerUrl: 'https://carrier.example.test',
    operation: 'mailbox.send_confirmation.list',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site_id: 'site_alpha',
      mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
      delivery_confirmation_admission: 'admitted',
      mailbox_mutation_admission: 'not_admitted',
      confirmations: [{ send_confirmation_id: 'mailbox_send_confirmation_alpha', sent_message_ref: 'message_alpha', sent_subject: 'Confirmed subject' }],
    }),
    json: async () => ({
      site_id: 'site_alpha',
      mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
      delivery_confirmation_admission: 'admitted',
      mailbox_mutation_admission: 'not_admitted',
      confirmations: [{ send_confirmation_id: 'mailbox_send_confirmation_alpha', sent_message_ref: 'message_alpha', sent_subject: 'Confirmed subject' }],
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.mailbox_send_confirmation_read.v1');
  assert.equal(result.summary.latest_send_confirmation_id, 'mailbox_send_confirmation_alpha');
  assert.equal(result.summary.mailbox_send_delivery_confirmation_admission, 'admitted');
});

test('formatMailboxSendConfirmationReadText prints mailbox send confirmation summary', () => {
  const text = formatMailboxSendConfirmationReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      confirmation_count: 1,
      mailbox_send_confirmation_authority: 'cloudflare_graph_sent_items_reconciliation',
      mailbox_send_delivery_confirmation_admission: 'admitted',
      mailbox_mutation_admission: 'not_admitted',
      latest_send_confirmation_id: 'mailbox_send_confirmation_alpha',
      latest_message_id: 'message_alpha',
      latest_subject: 'Confirmed subject',
      latest_recorded_at: '2026-06-13T03:59:01.000Z',
    },
  });

  assert.match(text, /Mailbox Send Confirmation: ok/);
  assert.match(text, /Send Confirmation: count=1 authority=cloudflare_graph_sent_items_reconciliation admission=admitted/);
  assert.match(text, /Latest Confirmation: id=mailbox_send_confirmation_alpha message=message_alpha subject=Confirmed subject/);
});
