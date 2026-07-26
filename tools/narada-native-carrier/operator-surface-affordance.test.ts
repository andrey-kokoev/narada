import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOperatorSurfaceAffordanceProjection } from './operator-surface-affordance.ts';

test('operator-surface projection exposes launch and doctor affordances with canonical targets', () => {
  const projection = buildOperatorSurfaceAffordanceProjection({
    siteRoot: 'D:/code/narada',
    carrierSessionId: 'carrier_session_operator_surface',
    agentId: 'narada.builder',
    focusAvailable: true,
  });

  const launch: any = projection.affordances.find((entry: any) => entry.name === 'launch');
  const doctor: any = projection.affordances.find((entry: any) => entry.name === 'doctor');
  const focus: any = projection.affordances.find((entry: any) => entry.name === 'focus');

  assert.equal(launch.available, true);
  assert.equal(doctor.available, true);
  assert.equal(focus.available, true);
  assert.equal(launch.command_target, 'narada_native_supervisor_start_surface');
  assert.equal(doctor.command_target, 'narada_native_supervisor_doctor_surface');
  assert.equal(focus.command_target, 'operator_surface_binding_surface');
  assert.match(launch.command, /supervisor-cli\.ts start/);
  assert.match(doctor.command, /supervisor-cli\.ts doctor/);
});

test('operator-surface projection separates convenience from authority', () => {
  const projection = buildOperatorSurfaceAffordanceProjection({
    siteRoot: 'D:/code/narada',
    carrierSessionId: 'carrier_session_operator_surface_no_authority',
    agentId: 'narada.builder',
  });

  assert.equal(projection.projection_only, true);
  assert.equal(projection.convenience_not_authority, true);
  assert.equal(projection.capability_grant_implied, false);
  assert.equal(projection.task_lifecycle_authority_granted, false);
  assert.equal(projection.inbox_authority_granted, false);
  assert.equal(projection.outbox_authority_granted, false);
  assert.equal(projection.command_execution_authority_granted, false);
  assert.equal(projection.publication_authority_granted, false);
  assert.equal(projection.affordances.every((entry: any) => entry.direct_mutation_primitive === false), true);
});

test('launch and focus convenience do not imply capability grants', () => {
  const projection = buildOperatorSurfaceAffordanceProjection({
    siteRoot: 'D:/code/narada',
    carrierSessionId: 'carrier_session_operator_surface_focus',
    agentId: 'narada.builder',
    focusAvailable: true,
  });

  for (const affordance of projection.affordances) {
    assert.equal(affordance.capability_grant_implied, false);
    assert.equal(affordance.authority_grant_implied, false);
    assert.equal(affordance.projection_only, true);
  }
  assert.equal(projection.raw_transcript_recorded, false);
  assert.equal(projection.raw_prompt_recorded, false);
  assert.equal(projection.raw_provider_output_recorded, false);
  assert.equal(projection.raw_secret_values_recorded, false);
});
