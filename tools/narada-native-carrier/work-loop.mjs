import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { invokeAdapter } from './adapter.mjs';
import { executeProviderAdapter } from './provider-adapter.mjs';

const AUTHORITY_REFUSALS = Object.freeze([
  { surface: 'task_report', direct_command: 'narada task report', refusal_reason: 'carrier_may_emit_inert_task_report_handoff_only' },
  { surface: 'task_close', direct_command: 'narada task close', refusal_reason: 'task_lifecycle_closure_requires_canonical_operator_surface' },
  { surface: 'task_review', direct_command: 'narada task review', refusal_reason: 'task_review_requires_reviewer_identity_and_lifecycle_admission' },
  { surface: 'inbox', direct_command: 'narada inbox mutate', refusal_reason: 'inbox_mutation_requires_canonical_inbox_surface' },
  { surface: 'command_execution', direct_command: 'narada command-exec execute', refusal_reason: 'command_execution_requires_ceiz_admission' },
  { surface: 'outbox_approve', direct_command: 'narada outbox approve', refusal_reason: 'outbox_approval_requires_canonical_outbox_surface' },
  { surface: 'outbox_confirm', direct_command: 'narada outbox confirm', refusal_reason: 'outbox_confirmation_requires_canonical_outbox_surface' },
  { surface: 'repository_publication_prepare', direct_command: 'narada publication prepare', refusal_reason: 'publication_prepare_requires_rpiz_admission' },
  { surface: 'repository_publication_confirm', direct_command: 'narada publication confirm', refusal_reason: 'publication_confirmation_requires_rpiz_admission' },
]);

function loopDir(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId);
}

function writeLoopArtifacts({ siteRoot, carrierSessionId, adapterEvidence, mode, now }) {
  const handoff = {
    schema: 'narada.narada_native_carrier.governed_handoff.v0',
    carrier_session_id: carrierSessionId,
    status: 'inert_handoff_artifact',
    proposed_action_packet: adapterEvidence.output.proposed_action_packet,
    canonical_admission_required: true,
    direct_mutation_performed: false,
    target_surfaces: ['task', 'inbox', 'outbox', 'command', 'publication'],
  };
  const interrupt = {
    schema: 'narada.narada_native_carrier.interrupt_evidence.v0',
    carrier_session_id: carrierSessionId,
    status: 'interrupt_supported',
    direct_effect_execution_attempted: false,
  };
  const closeout = {
    schema: 'narada.narada_native_carrier.loop_closeout.v0',
    carrier_session_id: carrierSessionId,
    status: 'closed_no_effect',
    direct_task_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    direct_command_execution: false,
    mocked_authority_surfaces_invoked: false,
    authority_refusals: AUTHORITY_REFUSALS.map((refusal) => ({
      ...refusal,
      mutation_performed: false,
      canonical_admission_required: true,
    })),
    recorded_at: now,
  };
  const dir = loopDir(siteRoot, carrierSessionId);
  mkdirSync(dir, { recursive: true });
  const handoffPath = join(dir, 'work-loop-handoff.json');
  const interruptPath = join(dir, 'work-loop-interrupt.json');
  const closeoutPath = join(dir, 'work-loop-closeout.json');
  writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  writeFileSync(interruptPath, `${JSON.stringify(interrupt, null, 2)}\n`, 'utf8');
  writeFileSync(closeoutPath, `${JSON.stringify(closeout, null, 2)}\n`, 'utf8');
  return {
    schema: 'narada.narada_native_carrier.work_loop_result.v0',
    mode,
    handoff_path: handoffPath,
    interrupt_path: interruptPath,
    closeout_path: closeoutPath,
    direct_mutation_performed: false,
  };
}

function runFixtureWorkLoop({ siteRoot, carrierSessionId, startupContext, workPacket, now = new Date().toISOString() }) {
  const adapter = invokeAdapter({
    siteRoot,
    carrierSessionId,
    input: {
      prompt: workPacket.prompt,
      context: {
        startup_agent_id: startupContext.agent_id,
        task_number: workPacket.task_number,
      },
    },
    now,
  });
  return {
    ...writeLoopArtifacts({
      siteRoot,
      carrierSessionId,
      adapterEvidence: adapter.evidence,
      mode: 'fixture_no_effect',
      now,
    }),
    adapter_invocation_path: adapter.evidence_path,
  };
}

async function runProviderWorkLoop({
  siteRoot,
  carrierSessionId,
  startupContext,
  workPacket,
  registration,
  capabilityLookup,
  providerRegistry,
  now = new Date().toISOString(),
}) {
  const adapter = await executeProviderAdapter({
    siteRoot,
    carrierSessionId,
    registration,
    input: {
      prompt: workPacket.prompt,
      context: {
        startup_agent_id: startupContext.agent_id,
        task_number: workPacket.task_number,
      },
    },
    capabilityLookup,
    providerRegistry,
    now,
  });
  return {
    ...writeLoopArtifacts({
      siteRoot,
      carrierSessionId,
      adapterEvidence: adapter.evidence,
      mode: 'provider_no_effect',
      now,
    }),
    adapter_invocation_path: adapter.evidence_path,
  };
}

export { AUTHORITY_REFUSALS, runFixtureWorkLoop, runProviderWorkLoop };
