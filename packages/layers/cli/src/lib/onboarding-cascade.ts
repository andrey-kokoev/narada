export interface OnboardingCascadeQuestion {
  number: number;
  id: string;
  capability: string;
  prompt: string;
  options: string[];
  deferrable: boolean;
}

export interface OnboardingCascade {
  schema: 'narada.onboarding_cascade.v0';
  site_kind: string;
  substrate_selection: string[];
  capability_selection: string[];
  capability_questions: OnboardingCascadeQuestion[];
  readiness_states: string[];
  deferred_choice_policy: {
    allowed: boolean;
    records: string[];
    does_not_imply_readiness: string[];
  };
  command_templates: Record<string, string>;
  authority_locus_rules: string[];
  site_local_projection_shape: {
    selected_cascade_version: string;
    answers: string;
    deferred_choices: string;
    readiness_projection: string;
  };
}

export const CLIENT_SERVICE_ONBOARDING_CASCADE_V0: OnboardingCascade = {
  schema: 'narada.onboarding_cascade.v0',
  site_kind: 'client_service',
  substrate_selection: ['project_site', 'client_service_site', 'windows_runtime_locus', 'wsl_runtime_locus'],
  capability_selection: [
    'mailbox_intake',
    'operator_surface',
    'runtime_daemon',
    'task_machinery',
    'site_local_kb',
    'data_elt_affinity',
    'git_github_sync',
    'notifications',
    'outbound_effects',
  ],
  capability_questions: [
    {
      number: 1,
      id: 'mailbox_intake_posture',
      capability: 'mailbox_intake',
      prompt: 'Mailbox/intake posture',
      options: ['none_for_now', 'bind_existing_mailbox', 'provision_or_request_mailbox'],
      deferrable: true,
    },
    {
      number: 2,
      id: 'allowed_correspondents_or_domains',
      capability: 'mailbox_intake',
      prompt: 'Allowed correspondents or domains',
      options: ['none_declared', 'specific_correspondents', 'domain_predicates'],
      deferrable: true,
    },
    {
      number: 3,
      id: 'runtime_behavior',
      capability: 'runtime_daemon',
      prompt: 'Runtime behavior',
      options: ['manual_only', 'scheduled_polling', 'continuous_background'],
      deferrable: true,
    },
    {
      number: 4,
      id: 'sync_posture',
      capability: 'mailbox_intake',
      prompt: 'Sync posture',
      options: ['metadata_only', 'headers_and_bodies', 'attachments_with_bounds'],
      deferrable: true,
    },
    {
      number: 5,
      id: 'source_data_loci',
      capability: 'data_elt_affinity',
      prompt: 'Source data loci',
      options: ['none_declared', 'mailbox', 'filesystem', 'external_system'],
      deferrable: true,
    },
    {
      number: 6,
      id: 'affiliated_data_or_elt_sites',
      capability: 'data_elt_affinity',
      prompt: 'Affiliated Data/ELT Sites',
      options: ['none_for_now', 'existing_site_refs', 'request_new_site'],
      deferrable: true,
    },
    {
      number: 7,
      id: 'reporting_surfaces',
      capability: 'notifications',
      prompt: 'Reporting surfaces',
      options: ['operator_console_only', 'site_inbox_observations', 'external_report_artifacts'],
      deferrable: true,
    },
    {
      number: 8,
      id: 'operator_surface_roles',
      capability: 'operator_surface',
      prompt: 'Operator-surface roles',
      options: ['architect_only', 'architect_builder_observer', 'custom_declared_roles'],
      deferrable: true,
    },
  ],
  readiness_states: [
    'structural_site_ready',
    'capability_configured',
    'credentials_bound',
    'dry_run_proven',
    'activated',
    'runtime_installed',
    'live_health_proven',
  ],
  deferred_choice_policy: {
    allowed: true,
    records: ['choice_id', 'reason', 'recorded_by', 'recorded_at', 'next_review_trigger'],
    does_not_imply_readiness: ['capability_configured', 'credentials_bound', 'runtime_installed', 'live_health_proven'],
  },
  command_templates: {
    mailbox_setup: 'narada want-mailbox <mailbox-id> --client-service --scope-id <scope-id> --participant-domain <domain> --draft-send-posture draft-only',
    credential_binding: 'narada capability bind-credential --site <site-id> --principal <principal> --kind graph.client_credentials --credential-ref <ref> --allow graph.token.request --local-env <VAR> --by <principal>',
    runtime_defer: 'narada runtime windows-startup install --site <site-root> --operation <operation-id> --mode separate-client-runtime --defer --by <principal>',
    runtime_status: 'narada runtime windows-startup status --site <site-root> --operation <operation-id> --format json',
  },
  authority_locus_rules: [
    'Narada proper defines the cascade schema and reusable commands.',
    'The client Site records selected cascade version, answers, deferred choices, and readiness projection.',
    'The Windows/PC runtime locus owns Task Scheduler mutation and read-back evidence.',
    'Credential references are capability grants; raw secrets are never cascade answers.',
    'Deferred choices are visible residuals, not readiness proofs.',
  ],
  site_local_projection_shape: {
    selected_cascade_version: 'onboarding.selected_cascade_version',
    answers: 'onboarding.cascade_answers',
    deferred_choices: 'onboarding.deferred_choices',
    readiness_projection: 'onboarding.readiness_projection',
  },
};

export function onboardingCascadeForSiteKind(siteKind: string | null | undefined): OnboardingCascade | null {
  return siteKind === 'client_service' ? CLIENT_SERVICE_ONBOARDING_CASCADE_V0 : null;
}
