import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateCarrierActionPacket } from './carrier-action-packet.mjs';
import {
  emitOutboxIntentHandoffPacket,
  emitRepositoryPublicationHandoffPacket,
} from './outbox-publication-handoff-families.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-outbox-publication-'));
}

test('outbox handoff emits inert reconstructable packet with canonical admission surface', () => {
  const siteRoot = tempSite();
  const result = emitOutboxIntentHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_outbox_packet',
    agentId: 'narada.builder',
    targetKind: 'human_operator',
    targetRef: 'operator:andrey',
    transport: 'mail',
    routeRef: 'route:primary-mailbox',
    capabilityRef: 'capability:outbox-send-mail',
    payloadBodyRef: 'payload:bounded-message-body',
    payloadBodySummary: {
      subject: 'Review handoff',
      credential_secret: 'sk-outboxsecret123456',
    },
    approvalPosture: 'requires_operator_approval',
    now: '2026-05-16T03:43:00.000Z',
  });
  const payload = JSON.parse(fs.readFileSync(result.payload_ref, 'utf8'));

  assert.equal(result.packet.action_family, 'outbox_intent');
  assert.deepEqual(validateCarrierActionPacket(result.packet), []);
  assert.equal(payload.target_kind, 'human_operator');
  assert.equal(payload.target_ref, 'operator:andrey');
  assert.equal(payload.transport, 'mail');
  assert.equal(payload.route_ref, 'route:primary-mailbox');
  assert.equal(payload.capability_ref, 'capability:outbox-send-mail');
  assert.equal(payload.payload_body_ref, 'payload:bounded-message-body');
  assert.equal(payload.payload_body_summary.values_omitted, true);
  assert.equal(payload.payload_body_summary.keys.includes('credential_secret'), false);
  assert.equal(payload.approval_posture, 'requires_operator_approval');
  assert.match(payload.suggested_outbox_admission_surface, /narada outbox intent submit/);
});

test('outbox handoff performs no outbound transport or outbox mutation', () => {
  const siteRoot = tempSite();
  const result = emitOutboxIntentHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_outbox_no_send',
    agentId: 'narada.builder',
    targetKind: 'webhook',
    targetRef: 'target:webhook',
    transport: 'https',
  });

  assert.equal(result.outbound_transport_sent, false);
  assert.equal(result.executor_invoked, false);
  assert.equal(result.direct_outbox_database_write, false);
  assert.equal(result.direct_mutation_performed, false);
  assert.equal(result.payload.outbox_item_admitted, false);
  assert.equal(result.payload.outbox_item_approved, false);
  assert.equal(result.payload.outbox_item_confirmed, false);
  assert.equal(result.packet.outbox_transport, false);
  assert.equal(result.packet.requires_canonical_admission, true);
});

test('repository publication handoff emits inert RPIZ draft packet', () => {
  const siteRoot = tempSite();
  const result = emitRepositoryPublicationHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_publication_packet',
    agentId: 'narada.builder',
    repoRoot: siteRoot,
    branch: 'main',
    remote: 'origin',
    taskNumber: 1349,
    taskId: '20260516-1349-implement-outbox-and-publication-handoff-families',
    includePaths: [
      'tools/narada-native-carrier/outbox-publication-handoff-families.mjs',
      'tools/narada-native-carrier/outbox-publication-handoff-families.test.mjs',
    ],
    messageSummary: 'Implement outbox and publication handoff families.',
    preparationCommand: 'narada repo publication prepare --task 1349',
    now: '2026-05-16T03:44:00.000Z',
  });
  const payload = JSON.parse(fs.readFileSync(result.payload_ref, 'utf8'));

  assert.equal(result.packet.action_family, 'repository_publication');
  assert.deepEqual(validateCarrierActionPacket(result.packet), []);
  assert.equal(payload.repo_root, siteRoot);
  assert.equal(payload.branch, 'main');
  assert.equal(payload.remote, 'origin');
  assert.equal(payload.task_number, 1349);
  assert.equal(payload.task_id, '20260516-1349-implement-outbox-and-publication-handoff-families');
  assert.equal(payload.include_paths.length, 2);
  assert.equal(payload.message_summary, 'Implement outbox and publication handoff families.');
  assert.match(payload.preparation_command, /narada repo publication prepare/);
  assert.match(payload.suggested_repository_publication_surface, /narada repo publication intent submit/);
});

test('repository publication handoff performs no commit or push', () => {
  const siteRoot = tempSite();
  const result = emitRepositoryPublicationHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_publication_no_git',
    agentId: 'narada.builder',
    repoRoot: siteRoot,
    branch: 'main',
    taskNumber: 1349,
    includePaths: ['README.md'],
    messageSummary: 'Prepare publication.',
  });

  assert.equal(result.commit_created, false);
  assert.equal(result.push_performed, false);
  assert.equal(result.git_commit_invoked, false);
  assert.equal(result.git_push_invoked, false);
  assert.equal(result.direct_repository_mutation, false);
  assert.equal(result.direct_mutation_performed, false);
  assert.equal(result.payload.repository_publication_admitted, false);
  assert.equal(result.packet.repository_publication, false);
  assert.equal(result.packet.requires_canonical_admission, true);
});

test('outbox and publication handoffs omit raw secret-like values', () => {
  const siteRoot = tempSite();
  const outbox = emitOutboxIntentHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_outbox_redaction',
    agentId: 'narada.builder',
    targetKind: 'mail',
    targetRef: 'Bearer outboxsecretvalue123456',
    transport: 'mail',
    routeRef: 'route:primary',
    capabilityRef: 'sk-outboxsecret123456',
    payloadBodyRef: 'payload:ref',
    payloadBodySummary: {
      body: 'raw outbound message',
      api_token: 'sk-outboxsecret123456',
    },
  });
  const publication = emitRepositoryPublicationHandoffPacket({
    siteRoot,
    carrierSessionId: 'carrier_session_publication_redaction',
    agentId: 'narada.builder',
    repoRoot: siteRoot,
    branch: 'main',
    remote: 'origin',
    taskNumber: 1349,
    includePaths: ['docs/ok.md', 'sk-pathsecret123456'],
    messageSummary: 'publish secret sk-publicationsecret123456',
    preparationCommand: 'narada repo publication prepare --file payload',
  });
  const text = [
    fs.readFileSync(outbox.payload_ref, 'utf8'),
    fs.readFileSync(publication.payload_ref, 'utf8'),
    JSON.stringify(outbox.packet),
    JSON.stringify(publication.packet),
  ].join('\n');

  assert.equal(outbox.payload.target_ref, 'omitted_sensitive_value');
  assert.equal(outbox.payload.capability_ref, 'omitted_sensitive_value');
  assert.equal(outbox.payload.raw_payload_body_recorded, false);
  assert.equal(outbox.payload.raw_secret_values_recorded, false);
  assert.equal(publication.payload.message_summary, 'omitted_sensitive_value');
  assert.equal(publication.payload.raw_diff_recorded, false);
  assert.equal(publication.payload.raw_secret_values_recorded, false);
  assert.doesNotMatch(text, /outboxsecretvalue/);
  assert.doesNotMatch(text, /sk-outboxsecret123456/);
  assert.doesNotMatch(text, /sk-pathsecret123456/);
  assert.doesNotMatch(text, /sk-publicationsecret123456/);
  assert.doesNotMatch(text, /raw outbound message/);
});
