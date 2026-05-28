import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLaunchCommandPosture } from './launch-command-posture.mjs';
import { buildLocalProcessRuntimeHandle } from './runtime-handle.mjs';

test('launch command posture exposes bounded runtime session capability authority and evidence fields', () => {
  const posture = buildLaunchCommandPosture({
    siteRoot: 'D:/code/narada',
    carrierSessionId: 'carrier_session_launch_posture',
    agentId: 'narada.builder',
    runtimeHandle: buildLocalProcessRuntimeHandle({
      processPid: 1234,
      startedAt: '2026-05-16T03:45:00.000Z',
      evidenceRefs: ['supervisor-start'],
    }),
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
    },
    launchEvidenceRefs: ['supervisor-start', 'live-start'],
    dryRun: false,
    now: '2026-05-16T03:45:01.000Z',
  });

  assert.equal(posture.carrier_session_id, 'carrier_session_launch_posture');
  assert.equal(posture.runtime.kind, 'local_process');
  assert.equal(posture.startup_command.name, 'agent_context_startup_sequence');
  assert.equal(posture.capability_posture.registration_status, 'configured_provider_adapter');
  assert.equal(posture.capability_posture.provider_kind, 'openai_compatible');
  assert.ok(posture.withheld_authorities.includes('task_lifecycle_mutation_authority'));
  assert.deepEqual(posture.launch_evidence_refs, ['supervisor-start', 'live-start']);
  assert.equal(posture.execution_admission_state, 'launch_evidence_projected_not_authority');
});

test('launch command posture supports dry-run planning without live provider calls', () => {
  const posture = buildLaunchCommandPosture({
    siteRoot: 'D:/code/narada',
    carrierSessionId: 'carrier_session_dry_run',
    agentId: 'narada.builder',
    dryRun: true,
  });

  assert.equal(posture.dry_run, true);
  assert.equal(posture.execution_admission_state, 'dry_run_planned_not_admitted');
  assert.equal(posture.live_provider_invoked, false);
  assert.equal(posture.provider_transport_invoked, false);
  assert.equal(posture.narada_mutation_performed, false);
});

test('launch command posture is redacted and non-authoritative', () => {
  const posture = buildLaunchCommandPosture({
    siteRoot: 'D:/code/narada',
    carrierSessionId: 'carrier_session_launch_redaction',
    agentId: 'narada.builder',
    registration: {
      adapter_id: 'provider-openai',
      adapter_kind: 'model_executor_adapter',
      provider_kind: 'openai_compatible',
      capability_ref: 'cap_model_openai_ref',
      provider_config: {
        endpoint: 'https://example.invalid/v1',
        api_key: 'sk-launchsecret123456',
      },
    },
    launchEvidenceRefs: ['prompt raw text sk-launchsecret123456'],
    dryRun: true,
  });
  const text = JSON.stringify(posture);

  assert.equal(posture.raw_transcript_recorded, false);
  assert.equal(posture.raw_prompt_recorded, false);
  assert.equal(posture.raw_provider_output_recorded, false);
  assert.equal(posture.raw_secret_values_recorded, false);
  assert.equal(posture.direct_task_lifecycle_mutation, false);
  assert.equal(posture.direct_inbox_mutation, false);
  assert.equal(posture.direct_outbox_mutation, false);
  assert.equal(posture.direct_publication_mutation, false);
  assert.doesNotMatch(text, /sk-launchsecret123456/);
  assert.doesNotMatch(text, /provider config value/);
  assert.doesNotMatch(text, /model output/);
});
