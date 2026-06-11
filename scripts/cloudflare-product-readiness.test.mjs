import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCloudflareProductReadiness } from './cloudflare-product-readiness-summary.mjs';

const BOUNDARY_KEYS = [
  'session_snapshot',
  'site_registry',
  'carrier_evidence_index',
  'site_continuity_packet_store',
  'site_continuity_loop_report_store',
  'site_continuity_reconciliation_execution_store',
  'operation_focus_review_store',
  'site_file_materialization_store',
  'local_ingress_request_queue',
  'repository_publication_request_queue',
  'repository_publication_evidence_store',
  'task_lifecycle_store',
];

function readyOperatorCheck() {
  return {
    schema: 'narada.cloudflare_operator_check.v1',
    status: 'ok',
    generated_at: '2026-06-11T22:00:00.000Z',
    site_id: 'site_narada_cloudflare',
    site_ref: 'cloudflare://narada-cloudflare-carrier',
    operation_id: 'operation_narada_cloudflare_control',
    worker_url: 'https://worker.example',
    checks: Object.fromEntries([
      'console_surface',
      'microsoft_login_surface',
      'live_carrier_smoke',
      'site_read',
      'operation_read',
      'canonical_operation_active',
      'operation_inhabited_by_live_work',
      'operation_continuity_packets',
      'operation_continuity_status',
      'operation_lifecycle_status',
      'operation_persistence_posture',
      'operation_recovery_posture',
      'operation_provider_scheduler_posture',
      'local_provider_liveness_scheduler_readback',
      'local_site_continuity_scheduler_health',
      'task_lifecycle_write_admission_surface',
      'task_lifecycle_source_state_write_boundary',
      'resident_dispatch_surface',
      'human_operator_session',
      'human_operator_membership',
      'human_operator_operation_read',
      'human_operator_action',
      'continuity_loop',
      'continuity_idempotence',
      'cloudflare_continuity_pull',
      'local_cloud_continuity_bridge',
    ].map((key) => [key, 'ok']).concat([
      ['repository_publication_cloudflare_github_readiness', 'ready'],
    ])),
    human_operator_login_ready: true,
    human_operator_membership_ready: true,
    principal: {
      human_operator_principal_id: 'microsoft:tenant:object',
      human_operator_email: 'operator@example.test',
    },
    membership: { current_role: 'owner' },
    local_provider_liveness_scheduler_readback: readyScheduler(),
    local_site_continuity_scheduler_health: {
      ...readyScheduler(),
      site_count: 2,
      local_sync_status: 'synced',
      local_inbound_status: 'synced',
    },
    sites: {
      overview: { health_counts: { attention: 1 } },
      route: { status: 'needs_attention', target: 'site_live_smoke', reason: 'continuity_loop_freshness' },
    },
    operation_posture: {
      overview: { health_counts: { needs_attention: 1 } },
      route: { status: 'needs_attention', target: 'operation_site_read', reason: 'use_focused_operation' },
    },
    operation: {
      lifecycle_status: {
        phase: 'inhabited',
        health: 'ready',
        attention: [],
        missing: [],
        continuity_direction_state: 'bidirectional_packets_observed',
        continuity_loop_freshness_state: 'fresh',
      },
      persistence_posture: { durable_boundaries: BOUNDARY_KEYS.map((key) => ({ key, status: 'available' })) },
      recovery_posture: {
        recovery_boundaries: BOUNDARY_KEYS.map((key) => ({ key, status: 'recoverable' })),
        recovery_gaps: [],
      },
      task_lifecycle_write_admission_posture: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_admitted',
      task_lifecycle_mutation_authority: 'split_by_mutation_class',
      task_lifecycle_cloudflare_write_admission: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted',
      task_lifecycle_authority_partition: 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_cloudflare_owned',
      task_lifecycle_task_count: 100,
      repository_publication_readiness_status: 'ready',
      repository_publication_github_credential_mode: 'github_token',
      repository_publication_readiness_authority_partition: 'cloudflare_repository_publication_executor_configured',
      repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_executor_authority: 'cloudflare_github_repository_publication_executor',
      repository_publication_status: 'completed',
      carrier_evidence_read_status: { state: 'partial', truncated_session_count: 90, session_read_limit: 10 },
    },
    continuity: {
      cloudflare_push_status: 'imported',
      cloudflare_pull_status: 'ok',
      windows_packet_count: 1,
      authority_boundary: { executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier' },
    },
    enter: { console_url: 'https://worker.example' },
  };
}

function readyScheduler() {
  return {
    task_name: '\\Narada\\CloudflareProviderLivenessRefresh',
    hidden_wrapper_kind: 'windows_wscript_vbs_hidden',
    status: 'ok',
    scheduled_task_state: 'Enabled',
    last_result: '0',
    cadence_status: 'matches_plan',
    task_command_status: 'matches_plan',
    hidden_wrapper_status: 'matches_plan',
    power_management_status: 'allows_battery_execution',
    attention_reasons: [],
  };
}

test('cloudflare product readiness reports ready with durable runtime evidence', () => {
  const readiness = summarizeCloudflareProductReadiness(readyOperatorCheck());

  assert.equal(readiness.schema, 'narada.cloudflare_product_readiness.v1');
  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.required_failure_count, 0);
  assert.equal(readiness.evidence.identity.status, 'ready');
  assert.equal(readiness.evidence.provider_liveness_scheduler.hidden_wrapper_status, 'matches_plan');
  assert.equal(readiness.evidence.site_continuity_scheduler.local_sync_status, 'synced');
  assert.equal(readiness.evidence.persistence.ready_count, BOUNDARY_KEYS.length);
  assert.equal(readiness.evidence.recovery.ready_count, BOUNDARY_KEYS.length);
  assert.equal(readiness.known_non_blocking_attention.length, 5);
});

test('cloudflare product readiness fails closed when required scheduler evidence is stale', () => {
  const source = readyOperatorCheck();
  source.local_site_continuity_scheduler_health.status = 'needs_attention';
  source.local_site_continuity_scheduler_health.attention_reasons = ['site_continuity_local_sync_needs_attention'];

  const readiness = summarizeCloudflareProductReadiness(source);

  assert.equal(readiness.status, 'attention');
  assert.match(JSON.stringify(readiness.required_failures), /site_continuity_scheduler\.status/);
  assert.match(JSON.stringify(readiness.required_failures), /site_continuity_scheduler\.attention_reasons/);
});
