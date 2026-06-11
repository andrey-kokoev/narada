const REQUIRED_CHECKS = [
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
  'repository_publication_cloudflare_github_readiness',
  'resident_dispatch_surface',
  'human_operator_session',
  'human_operator_membership',
  'human_operator_operation_read',
  'human_operator_action',
  'continuity_loop',
  'continuity_idempotence',
  'cloudflare_continuity_pull',
];

const REQUIRED_PERSISTENCE_BOUNDARIES = [
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

const KNOWN_NON_BLOCKING_ATTENTION = [
  'site_product_overview_attention',
  'site_posture_route_attention',
  'operation_posture_overview_attention_for_unfocused_operation',
  'operation_posture_route_attention_for_unfocused_operation',
  'partial_carrier_evidence_replay_due_session_read_limit',
];

export function summarizeCloudflareProductReadiness(operatorCheck) {
  const requiredFailures = [];
  const evidence = {};
  const knownNonBlocking = [];

  requireValue(operatorCheck?.schema === 'narada.cloudflare_operator_check.v1', requiredFailures, 'source_schema', 'operator_check_schema_not_recognized');
  requireValue(operatorCheck?.status === 'ok', requiredFailures, 'operator_check', 'operator_check_not_ok');

  const checks = operatorCheck?.checks ?? {};
  for (const check of REQUIRED_CHECKS) {
    const value = checks[check];
    if (check === 'repository_publication_cloudflare_github_readiness') {
      requireValue(value === 'ready', requiredFailures, `checks.${check}`, value ?? 'missing');
    } else {
      requireValue(value === 'ok', requiredFailures, `checks.${check}`, value ?? 'missing');
    }
  }

  const principal = operatorCheck?.principal ?? {};
  evidence.identity = {
    status: principal.human_operator_principal_id && principal.human_operator_email ? 'ready' : 'missing',
    principal_id: principal.human_operator_principal_id ?? null,
    email: principal.human_operator_email ?? null,
    login_ready: operatorCheck?.human_operator_login_ready === true,
    membership_ready: operatorCheck?.human_operator_membership_ready === true,
    membership_role: operatorCheck?.membership?.current_role ?? null,
  };
  requireValue(evidence.identity.status === 'ready', requiredFailures, 'identity', evidence.identity.status);
  requireValue(evidence.identity.login_ready, requiredFailures, 'identity.login_ready', 'not_ready');
  requireValue(evidence.identity.membership_ready, requiredFailures, 'identity.membership_ready', 'not_ready');

  const providerScheduler = operatorCheck?.local_provider_liveness_scheduler_readback ?? {};
  evidence.provider_liveness_scheduler = summarizeSchedulerReadback(providerScheduler);
  requireSchedulerReady(evidence.provider_liveness_scheduler, requiredFailures, 'provider_liveness_scheduler');

  const continuityScheduler = operatorCheck?.local_site_continuity_scheduler_health ?? {};
  evidence.site_continuity_scheduler = summarizeSchedulerReadback(continuityScheduler, {
    local_sync_status: continuityScheduler.local_sync_status ?? null,
    local_inbound_status: continuityScheduler.local_inbound_status ?? null,
    site_count: continuityScheduler.site_count ?? 0,
  });
  requireSchedulerReady(evidence.site_continuity_scheduler, requiredFailures, 'site_continuity_scheduler');
  requireValue(continuityScheduler.local_sync_status === 'synced', requiredFailures, 'site_continuity_scheduler.local_sync_status', continuityScheduler.local_sync_status ?? 'missing');
  requireValue(continuityScheduler.local_inbound_status === 'synced', requiredFailures, 'site_continuity_scheduler.local_inbound_status', continuityScheduler.local_inbound_status ?? 'missing');

  const operation = operatorCheck?.operation ?? {};
  evidence.operation_lifecycle = {
    status: operation.lifecycle_status?.health === 'ready' && operation.lifecycle_status?.phase === 'inhabited' ? 'ready' : 'attention',
    phase: operation.lifecycle_status?.phase ?? null,
    health: operation.lifecycle_status?.health ?? null,
    attention: operation.lifecycle_status?.attention ?? [],
    missing: operation.lifecycle_status?.missing ?? [],
    continuity_direction_state: operation.lifecycle_status?.continuity_direction_state ?? null,
    continuity_loop_freshness_state: operation.lifecycle_status?.continuity_loop_freshness_state ?? null,
  };
  requireValue(evidence.operation_lifecycle.status === 'ready', requiredFailures, 'operation_lifecycle', evidence.operation_lifecycle.status);

  evidence.persistence = summarizeBoundaries(operation.persistence_posture?.durable_boundaries, 'available');
  for (const boundary of REQUIRED_PERSISTENCE_BOUNDARIES) {
    requireValue(evidence.persistence.ready_keys.includes(boundary), requiredFailures, `persistence.${boundary}`, 'missing_or_unavailable');
  }

  evidence.recovery = summarizeBoundaries(operation.recovery_posture?.recovery_boundaries, 'recoverable');
  for (const boundary of REQUIRED_PERSISTENCE_BOUNDARIES) {
    requireValue(evidence.recovery.ready_keys.includes(boundary), requiredFailures, `recovery.${boundary}`, 'missing_or_unrecoverable');
  }
  requireValue((operation.recovery_posture?.recovery_gaps ?? []).length === 0, requiredFailures, 'recovery.gaps', 'present');

  evidence.task_lifecycle = {
    status: operation.task_lifecycle_write_admission_posture ? 'ready' : 'missing',
    mutation_authority: operation.task_lifecycle_mutation_authority ?? null,
    cloudflare_write_admission: operation.task_lifecycle_cloudflare_write_admission ?? null,
    authority_partition: operation.task_lifecycle_authority_partition ?? null,
    task_count: operation.task_lifecycle_task_count ?? 0,
  };
  requireValue(evidence.task_lifecycle.status === 'ready', requiredFailures, 'task_lifecycle', evidence.task_lifecycle.status);

  evidence.repository_publication = {
    status: operation.repository_publication_readiness_status ?? null,
    credential_mode: operation.repository_publication_github_credential_mode ?? null,
    authority_partition: operation.repository_publication_readiness_authority_partition ?? null,
    request_authority: operation.repository_publication_request_authority ?? null,
    executor_authority: operation.repository_publication_executor_authority ?? null,
    publication_status: operation.repository_publication_status ?? null,
  };
  requireValue(evidence.repository_publication.status === 'ready', requiredFailures, 'repository_publication', evidence.repository_publication.status ?? 'missing');

  evidence.continuity = {
    status: checks.local_cloud_continuity_bridge === 'ok' && checks.cloudflare_continuity_pull === 'ok' ? 'ready' : 'attention',
    cloudflare_push_status: operatorCheck?.continuity?.cloudflare_push_status ?? null,
    cloudflare_pull_status: operatorCheck?.continuity?.cloudflare_pull_status ?? null,
    windows_packet_count: operatorCheck?.continuity?.windows_packet_count ?? 0,
    authority_boundary: operatorCheck?.continuity?.authority_boundary ?? null,
  };
  requireValue(evidence.continuity.status === 'ready', requiredFailures, 'continuity', evidence.continuity.status);

  collectKnownNonBlockingAttention(operatorCheck, knownNonBlocking);

  return {
    schema: 'narada.cloudflare_product_readiness.v1',
    status: requiredFailures.length === 0 ? 'ready' : 'attention',
    generated_at: new Date().toISOString(),
    source_schema: operatorCheck?.schema ?? null,
    source_generated_at: operatorCheck?.generated_at ?? null,
    site_id: operatorCheck?.site_id ?? null,
    site_ref: operatorCheck?.site_ref ?? null,
    operation_id: operatorCheck?.operation_id ?? null,
    worker_url: operatorCheck?.worker_url ?? null,
    required_failure_count: requiredFailures.length,
    required_failures: requiredFailures,
    known_non_blocking_attention: knownNonBlocking,
    evidence,
    enter: operatorCheck?.enter ?? null,
  };
}

function requireValue(condition, failures, key, observed) {
  if (condition) return;
  failures.push({ key, observed });
}

function summarizeSchedulerReadback(readback, extra = {}) {
  return {
    status: readback.status ?? null,
    task_name: readback.task_name ?? null,
    hidden_wrapper_kind: readback.hidden_wrapper_kind ?? null,
    scheduled_task_state: readback.scheduled_task_state ?? null,
    last_result: readback.last_result ?? null,
    cadence_status: readback.cadence_status ?? null,
    task_command_status: readback.task_command_status ?? null,
    hidden_wrapper_status: readback.hidden_wrapper_status ?? null,
    power_management_status: readback.power_management_status ?? null,
    attention_reasons: readback.attention_reasons ?? [],
    ...extra,
  };
}

function requireSchedulerReady(readback, failures, prefix) {
  requireValue(readback.status === 'ok', failures, `${prefix}.status`, readback.status ?? 'missing');
  requireValue(readback.hidden_wrapper_kind === 'windows_wscript_vbs_hidden', failures, `${prefix}.hidden_wrapper_kind`, readback.hidden_wrapper_kind ?? 'missing');
  requireValue(readback.hidden_wrapper_status === 'matches_plan', failures, `${prefix}.hidden_wrapper_status`, readback.hidden_wrapper_status ?? 'missing');
  requireValue(readback.cadence_status === 'matches_plan', failures, `${prefix}.cadence_status`, readback.cadence_status ?? 'missing');
  requireValue(readback.task_command_status === 'matches_plan', failures, `${prefix}.task_command_status`, readback.task_command_status ?? 'missing');
  requireValue(readback.power_management_status === 'allows_battery_execution', failures, `${prefix}.power_management_status`, readback.power_management_status ?? 'missing');
  requireValue((readback.attention_reasons ?? []).length === 0, failures, `${prefix}.attention_reasons`, readback.attention_reasons ?? []);
}

function summarizeBoundaries(boundaries = [], readyStatus) {
  const entries = Array.isArray(boundaries) ? boundaries : [];
  const ready = entries.filter((boundary) => boundary?.status === readyStatus).map((boundary) => boundary.key).filter(Boolean);
  return {
    status: ready.length === REQUIRED_PERSISTENCE_BOUNDARIES.length ? 'ready' : 'attention',
    expected_status: readyStatus,
    ready_count: ready.length,
    boundary_count: entries.length,
    ready_keys: ready,
    missing_keys: REQUIRED_PERSISTENCE_BOUNDARIES.filter((key) => !ready.includes(key)),
  };
}

function collectKnownNonBlockingAttention(operatorCheck, knownNonBlocking) {
  const siteOverview = operatorCheck?.sites?.overview;
  if (siteOverview?.health_counts?.attention > 0) {
    knownNonBlocking.push({ key: KNOWN_NON_BLOCKING_ATTENTION[0], observed: siteOverview.health_counts.attention });
  }
  const siteRoute = operatorCheck?.sites?.route;
  if (siteRoute?.status === 'needs_attention') {
    knownNonBlocking.push({ key: KNOWN_NON_BLOCKING_ATTENTION[1], target: siteRoute.target ?? null, reason: siteRoute.reason ?? null });
  }
  const operationOverview = operatorCheck?.operation_posture?.overview;
  if (operationOverview?.health_counts?.needs_attention > 0) {
    knownNonBlocking.push({ key: KNOWN_NON_BLOCKING_ATTENTION[2], observed: operationOverview.health_counts.needs_attention });
  }
  const operationRoute = operatorCheck?.operation_posture?.route;
  if (operationRoute?.status === 'needs_attention') {
    knownNonBlocking.push({ key: KNOWN_NON_BLOCKING_ATTENTION[3], target: operationRoute.target ?? null, reason: operationRoute.reason ?? null });
  }
  const evidenceRead = operatorCheck?.operation?.carrier_evidence_read_status;
  if (evidenceRead?.state === 'partial' && Number(evidenceRead?.truncated_session_count ?? 0) > 0) {
    knownNonBlocking.push({
      key: KNOWN_NON_BLOCKING_ATTENTION[4],
      truncated_session_count: evidenceRead.truncated_session_count,
      session_read_limit: evidenceRead.session_read_limit ?? null,
    });
  }
}
