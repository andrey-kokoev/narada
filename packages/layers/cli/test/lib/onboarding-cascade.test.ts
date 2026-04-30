import { describe, expect, it } from 'vitest';
import {
  CLIENT_SERVICE_ONBOARDING_CASCADE_V0,
  onboardingCascadeForSiteKind,
} from '../../src/lib/onboarding-cascade.js';

describe('onboarding cascade', () => {
  it('defines numbered client-service questions and readiness layers from structured artifact', () => {
    const cascade = onboardingCascadeForSiteKind('client_service')!;

    expect(cascade.schema).toBe('narada.onboarding_cascade.v0');
    expect(cascade.capability_questions.map((question) => question.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cascade.capability_questions[0]).toMatchObject({
      id: 'mailbox_intake_posture',
      capability: 'mailbox_intake',
      options: ['none_for_now', 'bind_existing_mailbox', 'provision_or_request_mailbox'],
      deferrable: true,
    });
    expect(cascade.capability_selection).toEqual(expect.arrayContaining([
      'mailbox_intake',
      'operator_surface',
      'runtime_daemon',
      'task_machinery',
      'site_local_kb',
      'data_elt_affinity',
      'git_github_sync',
      'notifications',
      'outbound_effects',
    ]));
    expect(cascade.readiness_states).toEqual([
      'structural_site_ready',
      'capability_configured',
      'credentials_bound',
      'dry_run_proven',
      'activated',
      'runtime_installed',
      'live_health_proven',
    ]);
  });

  it('records deferred choice policy, command templates, authority rules, and projection shape', () => {
    const cascade = CLIENT_SERVICE_ONBOARDING_CASCADE_V0;

    expect(cascade.deferred_choice_policy.allowed).toBe(true);
    expect(cascade.deferred_choice_policy.records).toContain('choice_id');
    expect(cascade.deferred_choice_policy.does_not_imply_readiness).toContain('live_health_proven');
    expect(cascade.command_templates).toMatchObject({
      mailbox_setup: expect.stringContaining('narada want-mailbox'),
      credential_binding: expect.stringContaining('narada capability bind-credential'),
      runtime_defer: expect.stringContaining('narada runtime windows-startup install'),
    });
    expect(cascade.authority_locus_rules.join('\n')).toContain('Windows/PC runtime locus owns Task Scheduler mutation');
    expect(cascade.site_local_projection_shape).toEqual({
      selected_cascade_version: 'onboarding.selected_cascade_version',
      answers: 'onboarding.cascade_answers',
      deferred_choices: 'onboarding.deferred_choices',
      readiness_projection: 'onboarding.readiness_projection',
    });
  });
});
