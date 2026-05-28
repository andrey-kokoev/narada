import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeRegistration } from './adapter-registration.mjs';
import { materializeAndClose } from './harness.mjs';
import { startSupervisedSession } from './supervisor.mjs';
import {
  NO_MUTATION_FLAGS,
  readBoundedFileExcerptToDataPacket,
  readEvidenceRefSummaryToDataPacket,
  readInboxSummaryToDataPacket,
  readReadinessSnapshotToDataPacket,
  readTaskToDataPacket,
  readWorkNextToDataPacket,
} from './to-data-readers.mjs';
import { validateToDataPacket } from './to-data-packet.mjs';
import { runFixtureWorkLoop } from './work-loop.mjs';

const SITE_ROOT = 'D:\\code\\narada';
const NOW = '2026-05-16T01:30:00.000Z';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-to-data-readers-'));
}

function assertNoMutation(packet) {
  assert.equal(packet.raw_values_recorded, false);
  assert.equal(packet.authority_mutation_performed, false);
  assert.deepEqual(packet.mutation_flags, NO_MUTATION_FLAGS);
  assert.equal(packet.mutation_flags.task_claim_mutation, false);
  assert.equal(packet.mutation_flags.task_report_mutation, false);
  assert.equal(packet.mutation_flags.task_review_mutation, false);
  assert.equal(packet.mutation_flags.task_close_mutation, false);
  assert.equal(packet.mutation_flags.inbox_mutation, false);
  assert.equal(packet.mutation_flags.outbox_mutation, false);
  assert.equal(packet.mutation_flags.command_mutation, false);
  assert.equal(packet.mutation_flags.publication_mutation, false);
  assert.equal(packet.mutation_flags.repository_mutation, false);
  assert.deepEqual(validateToDataPacket(packet), []);
}

test('task to-data reader uses narada task read and records only bounded field presence', async () => {
  let observed = null;
  const packet = await readTaskToDataPacket({
    siteRoot: SITE_ROOT,
    carrierSessionId: 'session-1322',
    agentId: 'narada.builder',
    taskNumber: 1322,
    now: NOW,
    runCommand: async (taskNumber, context) => {
      observed = { taskNumber, context };
      return JSON.stringify({
        task: {
          task_number: 1322,
          task_id: '20260516-1322-implement-task-and-work-next-to-data-readers',
          title: 'Implement task and work-next to-data readers',
          status: 'claimed',
          goal: 'Implement read-only task and work-next packet readers for Narada-native sessions.',
          assignment: { agent_id: 'narada.builder' },
        },
      });
    },
  });

  assert.equal(observed.taskNumber, 1322);
  assert.deepEqual(observed.context.command, ['narada', 'task', 'read', '1322', '--format', 'json', '--cwd', SITE_ROOT]);
  assert.equal(packet.read_family, 'task_packet');
  assert.equal(packet.capability_projection.capability_kind, 'task_read_packet');
  assert.equal(packet.capability_lookup_status, 'admitted');
  assert.equal(packet.source_surface, 'narada task read 1322 --format json --cwd D:\\code\\narada');
  assert.equal(packet.attribution.cwd, SITE_ROOT);
  assert.equal(packet.attribution.requested.task_number, 1322);
  assert.equal(packet.freshness.captured_at, NOW);
  assert.equal(packet.bounded_summary.field_presence.task_number, true);
  assert.equal(packet.bounded_summary.field_presence.required_work, false);
  assert.equal(packet.bounded_summary.raw_task_markdown_recorded, false);
  assert.equal(packet.bounded_summary.raw_values_omitted, true);
  assertNoMutation(packet);
});

test('work-next to-data reader uses no-claim peek and records selected field presence', async () => {
  let observed = null;
  const packet = await readWorkNextToDataPacket({
    siteRoot: SITE_ROOT,
    carrierSessionId: 'session-1322',
    agentId: 'narada.builder',
    now: NOW,
    runCommand: async (agentId, context) => {
      observed = { agentId, context };
      return JSON.stringify({
        status: 'ok',
        action: 'work_next',
        requested_agent: 'narada.builder',
        resolved_agent: 'narada.builder',
        primary: {
          task_number: 1322,
          task_id: '20260516-1322-implement-task-and-work-next-to-data-readers',
          title: 'Implement task and work-next to-data readers',
          status: 'claimed',
          handoff_actionability: { status: 'actionable' },
        },
      });
    },
  });

  assert.equal(observed.agentId, 'narada.builder');
  assert.deepEqual(observed.context.command, [
    'narada',
    'task',
    'peek-next',
    '--agent',
    'narada.builder',
    '--format',
    'json',
    '--cwd',
    SITE_ROOT,
  ]);
  assert.equal(packet.read_family, 'work_next_peek');
  assert.equal(packet.capability_projection.capability_kind, 'work_next_peek');
  assert.equal(packet.attribution.requested.agent_id, 'narada.builder');
  assert.equal(packet.bounded_summary.selected_work_present, true);
  assert.equal(packet.bounded_summary.field_presence.task_number, true);
  assert.equal(packet.bounded_summary.field_presence.goal, false);
  assert.equal(packet.bounded_summary.raw_values_omitted, true);
  assertNoMutation(packet);
});

test('work-next to-data reader refuses when only claim-capable surfaces are available', async () => {
  let commandRan = false;
  const packet = await readWorkNextToDataPacket({
    siteRoot: SITE_ROOT,
    carrierSessionId: 'session-1322',
    agentId: 'narada.builder',
    now: NOW,
    noClaimPeekAvailable: false,
    runCommand: async () => {
      commandRan = true;
      return '{}';
    },
  });

  assert.equal(commandRan, false);
  assert.equal(packet.read_status, 'refused');
  assert.equal(packet.refusal.reason, 'no_no_claim_work_next_surface_available');
  assert.equal(packet.bounded_summary.selected_work_present, false);
  assertNoMutation(packet);
});

test('inbox summary to-data reader uses canonical list surface and omits raw payload values', async () => {
  let observed = null;
  const packet = await readInboxSummaryToDataPacket({
    siteRoot: SITE_ROOT,
    carrierSessionId: 'session-1323',
    agentId: 'narada.builder',
    limit: 2,
    status: 'received',
    now: NOW,
    runCommand: async (request, context) => {
      observed = { request, context };
      return JSON.stringify({
        envelopes: [
          {
            envelope_id: 'env-1',
            status: 'received',
            source_ref: 'mail:abc',
            kind: 'task_candidate',
            target_locus: 'narada-proper',
            title: 'Do not copy this title into raw payload',
            payload: {
              summary: 'payload body that should not be copied',
              api_token: 'secret-token',
              safe_field: 'safe value also omitted',
            },
          },
        ],
      });
    },
  });

  assert.deepEqual(observed.request, { limit: 2, status: 'received', kind: null });
  assert.deepEqual(observed.context.command, [
    'narada',
    'inbox',
    'list',
    '--status',
    'received',
    '--limit',
    '2',
    '--format',
    'json',
    '--cwd',
    SITE_ROOT,
  ]);
  assert.equal(packet.read_family, 'inbox_summary');
  assert.equal(packet.capability_projection.capability_kind, 'inbox_summary_read');
  assert.equal(packet.bounded_summary.envelope_count, 1);
  assert.equal(packet.bounded_summary.envelopes[0].envelope_id, 'env-1');
  assert.equal(packet.bounded_summary.envelopes[0].status, 'received');
  assert.equal(packet.bounded_summary.envelopes[0].source_ref, 'mail:abc');
  assert.equal(packet.bounded_summary.envelopes[0].kind, 'task_candidate');
  assert.equal(packet.bounded_summary.envelopes[0].target_locus, 'narada-proper');
  assert.equal(packet.bounded_summary.envelopes[0].bounded_summary_fields.title.present, true);
  assert.equal(packet.bounded_summary.envelopes[0].bounded_summary_fields.title.value_omitted, true);
  assert.deepEqual(packet.bounded_summary.envelopes[0].bounded_summary_fields.payload_keys, ['safe_field', 'summary']);
  assert.equal(packet.bounded_summary.envelopes[0].bounded_summary_fields.omitted_secret_like_key_count, 1);
  assert.equal(packet.bounded_summary.secret_like_values_recorded, false);
  assert.equal(packet.bounded_summary.unbounded_payload_text_recorded, false);
  assert.equal(packet.bounded_summary.raw_payload_values_recorded, false);
  assert.equal(JSON.stringify(packet).includes('secret-token'), false);
  assert.equal(JSON.stringify(packet).includes('payload body that should not be copied'), false);
  assert.equal(packet.inbox_status_transition_performed, false);
  assertNoMutation(packet);
});

test('inbox summary to-data reader performs no inbox status transition for empty results', async () => {
  let commandCount = 0;
  const packet = await readInboxSummaryToDataPacket({
    siteRoot: SITE_ROOT,
    carrierSessionId: 'session-1323',
    agentId: 'narada.builder',
    limit: 5,
    now: NOW,
    runCommand: async () => {
      commandCount += 1;
      return JSON.stringify({ envelopes: [] });
    },
  });

  assert.equal(commandCount, 1);
  assert.equal(packet.bounded_summary.envelope_count, 0);
  assert.deepEqual(packet.bounded_summary.envelopes, []);
  assert.equal(packet.inbox_status_transition_performed, false);
  assert.equal(packet.mutation_flags.inbox_mutation, false);
  assertNoMutation(packet);
});

test('readiness snapshot summarizes fixture-backed session without raw transcripts', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'session-fixture-readiness';
  materializeAndClose({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    agentStartEventId: 'agent-start-fixture',
    now: NOW,
  });
  runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext: { agent_id: 'narada.builder' },
    workPacket: { task_number: 1324, prompt: 'summarize this without copying token sk-fixture-secret' },
    now: NOW,
  });
  startSupervisedSession({ siteRoot, carrierSessionId, agentId: 'narada.builder', now: NOW });

  const packet = await readReadinessSnapshotToDataPacket({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: NOW,
  });

  assert.equal(packet.read_family, 'readiness_snapshot');
  assert.equal(packet.capability_projection.capability_kind, 'carrier_readiness_read');
  assert.equal(packet.bounded_summary.adapter_posture, 'fixture_adapter_invoked');
  assert.equal(packet.bounded_summary.runtime_state, 'running');
  assert.equal(packet.bounded_summary.blocked, false);
  assert.equal(packet.bounded_summary.evidence_ref_count > 0, true);
  assert.equal(JSON.stringify(packet).includes('sk-fixture-secret'), false);
  assert.equal(JSON.stringify(packet).includes('summarize this without copying'), false);
  assertNoMutation(packet);
});

test('evidence ref summary reconstructs provider-backed session from bounded refs', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'session-provider-evidence';
  writeRegistration(siteRoot, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
    provider_config: { endpoint: 'https://example.invalid/v1' },
  }, { cap_model_openai_ref: true });
  materializeAndClose({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    agentStartEventId: 'agent-start-provider',
    now: NOW,
  });
  const sessionDir = path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  fs.writeFileSync(path.join(sessionDir, 'provider-adapter-invocation.json'), `${JSON.stringify({
    schema: 'narada.narada_native_carrier.provider_adapter_invocation.v0',
    status: 'refused',
    output: {
      status: 'refused',
      text_output: 'raw provider output with token sk-provider-secret',
      raw_output_recorded: false,
      raw_secret_values_recorded: false,
      unbounded_transcript_recorded: false,
    },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(sessionDir, 'work-loop-closeout.json'), `${JSON.stringify({
    schema: 'narada.narada_native_carrier.loop_closeout.v0',
    status: 'closed_no_effect',
  }, null, 2)}\n`, 'utf8');
  startSupervisedSession({ siteRoot, carrierSessionId, agentId: 'narada.builder', now: NOW });

  const readiness = await readReadinessSnapshotToDataPacket({ siteRoot, carrierSessionId, agentId: 'narada.builder', now: NOW });
  const refs = await readEvidenceRefSummaryToDataPacket({ siteRoot, carrierSessionId, agentId: 'narada.builder', now: NOW });

  assert.equal(readiness.bounded_summary.provider_posture, 'provider_configured');
  assert.equal(readiness.bounded_summary.registration_status, 'configured_provider_adapter');
  assert.equal(refs.read_family, 'evidence_ref_summary');
  assert.equal(refs.capability_projection.capability_kind, 'carrier_evidence_ref_read');
  assert.equal(refs.bounded_summary.reconstruction_presence.adapter, true);
  assert.ok(refs.bounded_summary.evidence_refs.some((entry) => entry.name === 'provider-adapter-invocation'));
  assert.equal(JSON.stringify(refs).includes('sk-provider-secret'), false);
  assert.equal(JSON.stringify(refs).includes('raw provider output'), false);
  assertNoMutation(readiness);
  assertNoMutation(refs);
});

test('readiness snapshot reports blocked missing-evidence state without inspecting sqlite', async () => {
  const siteRoot = tempSite();
  const packet = await readReadinessSnapshotToDataPacket({
    siteRoot,
    carrierSessionId: 'missing-session',
    agentId: 'narada.builder',
    now: NOW,
  });

  assert.equal(packet.bounded_summary.runtime_state, 'blocked');
  assert.equal(packet.bounded_summary.blocked, true);
  assert.ok(packet.bounded_summary.residual_blockers.includes('missing_adapter_evidence'));
  assert.equal(packet.bounded_summary.raw_provider_output_recorded, false);
  assertNoMutation(packet);
});

test('evidence ref summary marks unsafe evidence flags without copying raw values', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'session-blocked-evidence';
  const sessionDir = path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, 'adapter-invocation.json'), `${JSON.stringify({
    schema: 'narada.narada_native_carrier.adapter_invocation.v0',
    status: 'recorded',
    input_summary: {
      raw_secret_values_recorded: true,
      unbounded_transcript_recorded: true,
    },
    output: {
      text_output: 'raw text that must not be copied sk-unsafe-secret',
      raw_output_recorded: true,
      raw_secret_values_recorded: false,
      unbounded_transcript_recorded: false,
    },
  }, null, 2)}\n`, 'utf8');

  const packet = await readEvidenceRefSummaryToDataPacket({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    now: NOW,
  });
  const adapter = packet.bounded_summary.evidence_refs.find((entry) => entry.name === 'adapter-invocation');

  assert.equal(adapter.schema, 'narada.narada_native_carrier.adapter_invocation.v0');
  assert.equal(adapter.raw_provider_output_recorded, true);
  assert.equal(adapter.unbounded_transcript_recorded, true);
  assert.equal(adapter.raw_secret_values_recorded, true);
  assert.equal(JSON.stringify(packet).includes('sk-unsafe-secret'), false);
  assert.equal(JSON.stringify(packet).includes('raw text that must not be copied'), false);
  assertNoMutation(packet);
});

test('bounded file excerpt reader requires capability and emits bounded attributed excerpts', async () => {
  const siteRoot = tempSite();
  fs.writeFileSync(path.join(siteRoot, 'notes.txt'), 'line one\nline two\nline three\n', 'utf8');

  const refused = await readBoundedFileExcerptToDataPacket({
    siteRoot,
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: 'notes.txt',
    now: NOW,
  });
  const packet = await readBoundedFileExcerptToDataPacket({
    siteRoot,
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: 'notes.txt',
    capabilityRef: { kind: 'site_file_excerpt_read', ref: 'cap:file-excerpt' },
    maxBytes: 10,
    maxLines: 2,
    now: NOW,
  });

  assert.equal(refused.read_status, 'refused');
  assert.equal(refused.refusal.reason, 'missing_consent_record');
  assert.equal(packet.read_family, 'bounded_file_excerpt');
  assert.equal(packet.capability_projection.capability_kind, 'site_file_excerpt_read');
  assert.equal(packet.bounded_summary.excerpt, 'line one\nl');
  assert.equal(packet.bounded_summary.byte_limit, 10);
  assert.equal(packet.bounded_summary.line_limit, 2);
  assert.equal(packet.bounded_summary.truncated_by_bytes, true);
  assert.equal(packet.bounded_summary.path.relative_path, 'notes.txt');
  assert.equal(packet.bounded_summary.path.contained, true);
  assert.equal(packet.bounded_summary.redaction_posture, 'bounded_excerpt_no_secret_path_no_binary_detection');
  assertNoMutation(refused);
  assertNoMutation(packet);
});

test('bounded file excerpt reader refuses traversal oversized binary secret and stronger-reader paths', async () => {
  const siteRoot = tempSite();
  const outsideRoot = tempSite();
  fs.mkdirSync(path.join(siteRoot, '.narada', 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(siteRoot, 'binary.bin'), Buffer.from([0x61, 0x00, 0x62]));
  fs.writeFileSync(path.join(siteRoot, '.env'), 'TOKEN=secret', 'utf8');
  fs.writeFileSync(path.join(siteRoot, '.narada', 'inbox', 'env.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(outsideRoot, 'outside.txt'), 'outside', 'utf8');
  const capabilityRef = { kind: 'site_file_excerpt_read', ref: 'cap:file-excerpt' };

  const traversal = await readBoundedFileExcerptToDataPacket({
    siteRoot,
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: path.join('..', path.basename(outsideRoot), 'outside.txt'),
    capabilityRef,
    now: NOW,
  });
  const foreignDriveAbsolute = await readBoundedFileExcerptToDataPacket({
    siteRoot: 'D:\\code\\narada',
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: 'C:\\Windows\\win.ini',
    capabilityRef,
    now: NOW,
  });
  const oversized = await readBoundedFileExcerptToDataPacket({
    siteRoot,
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: 'binary.bin',
    capabilityRef,
    maxBytes: 20 * 1024,
    now: NOW,
  });
  const binary = await readBoundedFileExcerptToDataPacket({
    siteRoot,
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: 'binary.bin',
    capabilityRef,
    now: NOW,
  });
  const secret = await readBoundedFileExcerptToDataPacket({
    siteRoot,
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: '.env',
    capabilityRef,
    now: NOW,
  });
  const stronger = await readBoundedFileExcerptToDataPacket({
    siteRoot,
    carrierSessionId: 'session-1325',
    agentId: 'narada.builder',
    filePath: path.join('.narada', 'inbox', 'env.json'),
    capabilityRef,
    now: NOW,
  });

  assert.equal(traversal.refusal.reason, 'path_outside_site_root_refused');
  assert.equal(foreignDriveAbsolute.refusal.reason, 'path_outside_site_root_refused');
  assert.equal(oversized.refusal.reason, 'oversized_excerpt_refused');
  assert.equal(binary.refusal.reason, 'binary_file_refused');
  assert.equal(secret.refusal.reason, 'secret_like_path_refused');
  assert.equal(stronger.refusal.reason, 'stronger_canonical_reader_required');
  for (const packet of [traversal, foreignDriveAbsolute, oversized, binary, secret, stronger]) {
    assert.equal(packet.read_status, 'refused');
    assert.equal(packet.bounded_summary.excerpt_present, false);
    assertNoMutation(packet);
  }
});

test('missing data-read consent blocks only the matching reader family', async () => {
  let inboxCommandRan = false;
  let taskCommandRan = false;
  const capabilityLookup = async (capabilityKind) => (
    capabilityKind === 'inbox_summary_read'
      ? null
      : { granted: true, consent_ref: `consent://test/${capabilityKind}`, scopes: [capabilityKind] }
  );
  const inbox = await readInboxSummaryToDataPacket({
    siteRoot: SITE_ROOT,
    carrierSessionId: 'session-capability-consent',
    agentId: 'narada.builder',
    readCapabilityLookup: capabilityLookup,
    runCommand: async () => {
      inboxCommandRan = true;
      return JSON.stringify({ envelopes: [] });
    },
    now: NOW,
  });
  const task = await readTaskToDataPacket({
    siteRoot: SITE_ROOT,
    carrierSessionId: 'session-capability-consent',
    agentId: 'narada.builder',
    taskNumber: 1335,
    readCapabilityLookup: capabilityLookup,
    runCommand: async () => {
      taskCommandRan = true;
      return JSON.stringify({ task: { task_number: 1335, status: 'claimed' } });
    },
    now: NOW,
  });

  assert.equal(inbox.read_status, 'refused');
  assert.equal(inbox.refusal.reason, 'missing_consent_record');
  assert.equal(inbox.capability_projection.capability_kind, 'inbox_summary_read');
  assert.equal(inboxCommandRan, false);
  assert.equal(task.read_status, 'ok');
  assert.equal(task.capability_projection.capability_kind, 'task_read_packet');
  assert.equal(taskCommandRan, true);
  assertNoMutation(inbox);
  assertNoMutation(task);
});

test('revoked and stale data-read projections block before reader execution', async () => {
  const cases = [
    ['revoked_capability', { consent_ref: 'consent://read', revoked: true }],
    ['stale_grant', { consent_ref: 'consent://read', expires_at: '2026-05-15T00:00:00.000Z' }],
  ];

  for (const [reason, capability] of cases) {
    let commandRan = false;
    const packet = await readWorkNextToDataPacket({
      siteRoot: SITE_ROOT,
      carrierSessionId: `session-${reason}`,
      agentId: 'narada.builder',
      readCapabilityLookup: async () => capability,
      runCommand: async () => {
        commandRan = true;
        return JSON.stringify({ status: 'ok' });
      },
      now: NOW,
    });

    assert.equal(packet.read_status, 'refused');
    assert.equal(packet.refusal.reason, reason);
    assert.equal(packet.capability_projection.capability_kind, 'work_next_peek');
    assert.equal(commandRan, false);
    assertNoMutation(packet);
  }
});

test('fixture-only readiness remains inspectable without provider capability', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'session-fixture-no-provider-capability';
  materializeAndClose({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    agentStartEventId: 'agent-start-fixture-no-provider',
    now: NOW,
  });
  runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext: { agent_id: 'narada.builder' },
    workPacket: { task_number: 1335, prompt: 'fixture-only read without provider capability' },
    now: NOW,
  });
  startSupervisedSession({ siteRoot, carrierSessionId, agentId: 'narada.builder', now: NOW });

  const packet = await readReadinessSnapshotToDataPacket({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    readCapabilityLookup: async (capabilityKind) => (
      capabilityKind === 'carrier_readiness_read'
        ? { granted: true, consent_ref: 'consent://test/readiness', scopes: [capabilityKind] }
        : null
    ),
    now: NOW,
  });

  assert.equal(packet.read_status, 'ok');
  assert.equal(packet.bounded_summary.adapter_posture, 'fixture_adapter_invoked');
  assert.equal(packet.capability_projection.capability_kind, 'carrier_readiness_read');
  assert.equal(JSON.stringify(packet).includes('fixture-only read without provider capability'), false);
  assertNoMutation(packet);
});
