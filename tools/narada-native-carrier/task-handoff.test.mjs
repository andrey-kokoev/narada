import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTaskPacketViaNaradaCli, runGovernedTaskHandoff } from './task-handoff.mjs';
import { reconstruct } from './readiness.mjs';
import { writeRegistration } from './adapter-registration.mjs';
import { makeProviderRegistry } from './provider-adapter.mjs';

function tempSite() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'narada-native-task-handoff-'));
}

function taskPacket(overrides = {}) {
  return {
    task_number: 1298,
    task_id: '20260515-1298-wire-narada-native-work-loop-to-governed-task-handoff-path',
    title: 'Wire Narada-native work loop',
    goal: 'Produce governed handoff',
    assignment: { agent_id: 'narada.builder' },
    ...overrides,
  };
}

test('native task handoff reads bounded packet and emits report draft without lifecycle mutation', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_task_handoff';
  const { result, draft_path: draftPath } = await runGovernedTaskHandoff({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    taskNumber: 1298,
    readTaskPacket: async () => taskPacket(),
    capabilityGrants: { task_report_draft: true },
    now: '2026-05-15T21:42:00.000Z',
  });
  const draftText = fs.readFileSync(draftPath, 'utf8');
  const reconstructed = reconstruct(siteRoot, carrierSessionId);

  assert.equal(result.status, 'draft_requires_canonical_task_report_admission');
  assert.equal(result.task_number, 1298);
  assert.equal(result.direct_task_lifecycle_mutation, false);
  assert.equal(result.direct_inbox_mutation, false);
  assert.equal(result.direct_outbox_mutation, false);
  assert.equal(result.direct_publication_mutation, false);
  assert.equal(result.repository_mutation, false);
  assert.match(result.suggested_admission_command, /narada task report 1298/);
  assert.match(result.suggested_admission_command, /--report-file <draft>/);
  assert.doesNotMatch(result.suggested_admission_command, /--payload-file/);
  for (const evidencePath of Object.values(result.evidence_refs)) {
    assert.equal(fs.existsSync(evidencePath), true);
  }
  assert.ok(reconstructed.adapter);
  assert.ok(reconstructed.proposal);
  assert.ok(reconstructed.interrupt);
  assert.ok(reconstructed.closeout);
  assert.doesNotMatch(draftText, /raw markdown/i);
});

test('native task handoff default reader uses bounded narada task read surface', async () => {
  const siteRoot = tempSite();
  const calls = [];
  const { result } = await runGovernedTaskHandoff({
    siteRoot,
    carrierSessionId: 'carrier_session_cli_reader',
    agentId: 'narada.builder',
    taskNumber: 1298,
    readTaskPacketCommandRunner: async (taskNumber, context) => {
      calls.push({ taskNumber, context });
      return JSON.stringify({ status: 'ok', task: taskPacket() });
    },
    capabilityGrants: { task_report_draft: true },
    now: '2026-05-15T21:42:02.000Z',
  });

  assert.equal(result.status, 'draft_requires_canonical_task_report_admission');
  assert.equal(result.read_surface.kind, 'narada_cli');
  assert.deepEqual(result.read_surface.command.slice(0, 4), ['narada', 'task', 'read', '1298']);
  assert.equal(result.read_surface.bounded, true);
  assert.equal(result.read_surface.raw_task_markdown_recorded, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].taskNumber, 1298);
  assert.equal(calls[0].context.siteRoot, siteRoot);
});

test('native task handoff dispatches configured provider registration through governed work loop', async () => {
  const siteRoot = tempSite();
  const carrierSessionId = 'carrier_session_provider_handoff';
  const calls = [];
  writeRegistration(siteRoot, {
    adapter_id: 'provider-openai',
    adapter_kind: 'model_executor_adapter',
    provider_kind: 'openai_compatible',
    capability_ref: 'cap_model_openai_ref',
  }, { cap_model_openai_ref: true });
  const { result, draft_path: draftPath } = await runGovernedTaskHandoff({
    siteRoot,
    carrierSessionId,
    agentId: 'narada.builder',
    taskNumber: 1298,
    readTaskPacket: async () => taskPacket(),
    capabilityGrants: { task_report_draft: true },
    capabilityLookup: async (ref) => ({
      granted: true,
      capability_ref: ref,
      credential_ref: 'cred://model/openai',
      consent_ref: 'consent://operator/openai',
      policy_ref: 'policy://bounded-model-output',
    }),
    providerRegistry: makeProviderRegistry({
      openai_compatible: (request) => {
        calls.push(request);
        return { text: 'provider output that must stay inert' };
      },
    }),
    now: '2026-05-16T01:00:00.000Z',
  });
  const reconstructed = reconstruct(siteRoot, carrierSessionId);
  const draftText = fs.readFileSync(draftPath, 'utf8');

  assert.equal(result.status, 'draft_requires_canonical_task_report_admission');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider_kind, 'openai_compatible');
  assert.equal(reconstructed.adapter.schema, 'narada.narada_native_carrier.provider_adapter_invocation.v0');
  assert.equal(reconstructed.adapter.execution_status, 'completed');
  assert.equal(reconstructed.proposal.status, 'inert_handoff_artifact');
  assert.match(result.evidence_refs.adapter_invocation, /provider-adapter-invocation\.json$/);
  assert.doesNotMatch(draftText, /provider output that must stay inert/);
});

test('bounded narada CLI reader parses task read JSON without raw markdown', async () => {
  const siteRoot = tempSite();
  const packet = await readTaskPacketViaNaradaCli(1298, {
    siteRoot,
    runCommand: async () => JSON.stringify({
      status: 'ok',
      task: taskPacket({ body: 'raw markdown should not appear in packet' }),
    }),
  });
  const packetText = JSON.stringify(packet);

  assert.equal(packet.task_number, 1298);
  assert.equal(packet.assignment.agent_id, 'narada.builder');
  assert.equal(packet.read_surface.kind, 'narada_cli');
  assert.equal(packet.raw_task_markdown_recorded, undefined);
  assert.doesNotMatch(packetText, /raw markdown should not appear/);
});

test('native task handoff refuses missing capability before loop execution', async () => {
  const siteRoot = tempSite();
  const { result, draft_path: draftPath } = await runGovernedTaskHandoff({
    siteRoot,
    carrierSessionId: 'carrier_session_missing_capability',
    agentId: 'narada.builder',
    taskNumber: 1298,
    readTaskPacket: async () => taskPacket(),
    capabilityGrants: {},
    now: '2026-05-15T21:42:01.000Z',
  });
  const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'missing_task_report_draft_capability');
  assert.equal(draft.direct_task_lifecycle_mutation, false);
  assert.equal(fs.existsSync(path.join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', 'carrier_session_missing_capability', 'adapter-invocation.json')), false);
});

test('native task handoff refuses packet assigned to another agent', async () => {
  const siteRoot = tempSite();
  const { result } = await runGovernedTaskHandoff({
    siteRoot,
    carrierSessionId: 'carrier_session_wrong_agent',
    agentId: 'narada.builder',
    taskNumber: 1298,
    readTaskPacket: async () => taskPacket({ assignment: { agent_id: 'narada.architect' } }),
    capabilityGrants: { task_report_draft: true },
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'assigned_to_different_agent');
  assert.equal(result.task_packet_summary.assignment_agent_id, 'narada.architect');
  assert.equal(result.direct_task_lifecycle_mutation, false);
});
