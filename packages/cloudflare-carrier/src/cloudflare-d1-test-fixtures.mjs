export function fakeD1TaskDatabase() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return fakeD1Statement(rows, String(sql));
    },
  };
}

export function fakeD1SiteRegistryDatabase(initial = {}) {
  const state = {
    sites: clone(initial.sites ?? []),
    memberships: clone(initial.memberships ?? []),
    settings: clone(initial.settings ?? []),
    operations: clone(initial.operations ?? []),
    carrierSessions: clone(initial.carrierSessions ?? []),
    authorityEvents: clone(initial.authorityEvents ?? []),
    operatorSessions: clone(initial.operatorSessions ?? []),
    continuityPackets: clone(initial.continuityPackets ?? []),
    continuityLoopReports: clone(initial.continuityLoopReports ?? []),
    continuityReconciliationExecutions: clone(initial.continuityReconciliationExecutions ?? []),
    webhookDelayRemoteSourceSamples: clone(initial.webhookDelayRemoteSourceSamples ?? []),
    webhookDelayScheduledSourceReads: clone(initial.webhookDelayScheduledSourceReads ?? []),
    webhookDelayShadowObservations: clone(initial.webhookDelayShadowObservations ?? []),
    webhookDelayObservationPrimaryReads: clone(initial.webhookDelayObservationPrimaryReads ?? []),
    webhookDelayDirectiveRecords: clone(initial.webhookDelayDirectiveRecords ?? []),
    webhookDelayDirectiveDeliveries: clone(initial.webhookDelayDirectiveDeliveries ?? []),
    residentLoopShadowRuns: clone(initial.residentLoopShadowRuns ?? []),
    mailboxStatusShadowReads: clone(initial.mailboxStatusShadowReads ?? []),
    mailboxStatusSourceReads: clone(initial.mailboxStatusSourceReads ?? []),
    mailboxDraftReplyProposals: clone(initial.mailboxDraftReplyProposals ?? []),
    mailboxOutlookDraftCreates: clone(initial.mailboxOutlookDraftCreates ?? []),
    mailboxSendAcceptedRecords: clone(initial.mailboxSendAcceptedRecords ?? []),
    mailboxSendConfirmations: clone(initial.mailboxSendConfirmations ?? []),
    mailboxSendReviews: clone(initial.mailboxSendReviews ?? []),
    operationFocusReviews: clone(initial.operationFocusReviews ?? []),
    siteFileChangeProposals: clone(initial.siteFileChangeProposals ?? []),
    siteFileMaterializations: clone(initial.siteFileMaterializations ?? []),
    localIngressRequests: clone(initial.localIngressRequests ?? []),
    localIngressEvidence: clone(initial.localIngressEvidence ?? []),
    localIngressProviderHeartbeats: clone(initial.localIngressProviderHeartbeats ?? []),
    repositoryPublicationRequests: clone(initial.repositoryPublicationRequests ?? []),
    repositoryPublicationAdmissions: clone(initial.repositoryPublicationAdmissions ?? []),
    repositoryPublicationExecutions: clone(initial.repositoryPublicationExecutions ?? []),
    repositoryPublicationEvidence: clone(initial.repositoryPublicationEvidence ?? []),
    repositoryPublicationProviderHeartbeats: clone(initial.repositoryPublicationProviderHeartbeats ?? []),
    taskLifecycleShadowReads: clone(initial.taskLifecycleShadowReads ?? []),
    taskLifecycleWriteAdmissions: clone(initial.taskLifecycleWriteAdmissions ?? []),
    taskLifecycleTasks: clone(initial.taskLifecycleTasks ?? []),
    residentDispatchDecisions: clone(initial.residentDispatchDecisions ?? []),
    residentDispatchWindowsFallbackRequests: clone(initial.residentDispatchWindowsFallbackRequests ?? []),
    residentDispatchWindowsFallbackEvidence: clone(initial.residentDispatchWindowsFallbackEvidence ?? []),
    carrierSessionEvents: clone(initial.carrierSessionEvents ?? []),
  };
  return {
    prepare(sql) {
      return fakeD1SiteRegistryStatement(state, String(sql));
    },
    dump() {
      return clone(state);
    },
  };
}

function fakeD1SiteRegistryStatement(state, sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  let bindings = [];
  return {
    bind(...values) {
      bindings = values;
      return this;
    },
    async run() {
      if (normalized.startsWith('insert into cloudflare_site_memberships')) {
        const [site_id, principal_id, role, status, created_at, updated_at] = bindings;
        const existing = state.memberships.find((entry) => entry.site_id === site_id && entry.principal_id === principal_id);
        if (existing) Object.assign(existing, { role, status, updated_at });
        else state.memberships.push({ site_id, principal_id, role, status, created_at, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_site_operations')) {
        const [operation_id, site_id, display_name, operation_kind, status, created_by_principal_id, created_at, updated_at] = bindings;
        const existing = state.operations.find((entry) => entry.operation_id === operation_id);
        if (existing) Object.assign(existing, { display_name, operation_kind, status, updated_at });
        else state.operations.push({ operation_id, site_id, display_name, operation_kind, status, created_by_principal_id, created_at, updated_at });
      } else if (normalized.startsWith('update cloudflare_site_operations')) {
        const [status, updated_at, operation_id] = bindings;
        const existing = state.operations.find((entry) => entry.operation_id === operation_id);
        if (existing) Object.assign(existing, { status, updated_at });
      } else if (normalized.startsWith('update cloudflare_site_carrier_sessions set operation_id')) {
        const [operation_id, updated_at, carrier_session_id] = bindings;
        const existing = state.carrierSessions.find((entry) => entry.carrier_session_id === carrier_session_id);
        if (existing) Object.assign(existing, { operation_id, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_site_carrier_sessions')) {
        const hasOperationId = bindings.length === 8;
        const [carrier_session_id, site_id, maybe_operation_id, maybe_agent_id, maybe_bound_by_principal_id, maybe_binding_status, maybe_created_at, maybe_updated_at] = bindings;
        const operation_id = hasOperationId ? maybe_operation_id : null;
        const agent_id = hasOperationId ? maybe_agent_id : maybe_operation_id;
        const bound_by_principal_id = hasOperationId ? maybe_bound_by_principal_id : maybe_agent_id;
        const binding_status = hasOperationId ? maybe_binding_status : maybe_bound_by_principal_id;
        const created_at = hasOperationId ? maybe_created_at : maybe_binding_status;
        const updated_at = hasOperationId ? maybe_updated_at : maybe_created_at;
        if (!state.carrierSessions.some((entry) => entry.carrier_session_id === carrier_session_id)) {
          state.carrierSessions.push({ carrier_session_id, site_id, operation_id, agent_id, bound_by_principal_id, binding_status, created_at, updated_at });
        }
      } else if (normalized.startsWith('insert into cloudflare_site_authority_events')) {
        const [event_id, event_kind, site_id, carrier_session_id, principal_id, action, reason, evidence_json, recorded_at] = bindings;
        state.authorityEvents.push({ event_id, event_kind, site_id, carrier_session_id, principal_id, action, reason, evidence_json, recorded_at });
      } else if (normalized.startsWith('insert into cloudflare_operator_sessions')) {
        const [operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at] = bindings;
        state.operatorSessions.push({ operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at });
      } else if (normalized.startsWith('insert into cloudflare_site_continuity_packets')) {
        const [packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind, admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at] = bindings;
        const existing = state.continuityPackets.find((entry) => entry.packet_id === packet_id);
        const row = { packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind, admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at };
        if (existing) Object.assign(existing, row);
        else state.continuityPackets.push(row);
      } else if (normalized.startsWith('insert into cloudflare_site_continuity_loop_reports')) {
        const [report_id, site_id, status, generated_at, cloudflare_source, cloudflare_push_status, windows_packet_count, cloudflare_credential_source, report_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.continuityLoopReports.find((entry) => entry.report_id === report_id);
        const row = { report_id, site_id, status, generated_at, cloudflare_source, cloudflare_push_status, windows_packet_count, cloudflare_credential_source, report_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.continuityLoopReports.push(row);
      } else if (normalized.startsWith('insert into cloudflare_site_continuity_reconciliation_executions')) {
        const [execution_id, site_id, status, generated_at, persisted_at, reconciliation_plan_status, selected_site_count, executed_site_count, completed_site_count, failed_site_count, refusal_reason, execution_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.continuityReconciliationExecutions.find((entry) => entry.execution_id === execution_id);
        const row = { execution_id, site_id, status, generated_at, persisted_at, reconciliation_plan_status, selected_site_count, executed_site_count, completed_site_count, failed_site_count, refusal_reason, execution_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.continuityReconciliationExecutions.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_shadow_observations')) {
        const [observation_id, site_id, source_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, dispatch_authority, shadow_mode, dispatch_action, observation_json, classification_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayShadowObservations.find((entry) => entry.observation_id === observation_id);
        const row = { observation_id, site_id, source_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, dispatch_authority, shadow_mode, dispatch_action, observation_json, classification_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayShadowObservations.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_remote_source_samples')) {
        const [sample_id, site_id, source_adapter_id, sample_role, observed_at, observed_at_ct, elapsed_minutes, delay_minutes, sample_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayRemoteSourceSamples.find((entry) => entry.sample_id === sample_id);
        const row = { sample_id, site_id, source_adapter_id, sample_role, observed_at, observed_at_ct, elapsed_minutes, delay_minutes, sample_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayRemoteSourceSamples.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_scheduled_source_reads')) {
        const [scheduled_run_id, site_id, source_adapter_id, observation_id, trigger_authority, trigger_kind, cron, scheduled_at, run_status, failure_code, source_material_locus, source_authority, source_sample_count, classification_state, latest_delay_minutes, critical_minutes, fallback_authority, fallback_status, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayScheduledSourceReads.find((entry) => entry.scheduled_run_id === scheduled_run_id);
        const row = { scheduled_run_id, site_id, source_adapter_id, observation_id, trigger_authority, trigger_kind, cron, scheduled_at, run_status, failure_code, source_material_locus, source_authority, source_sample_count, classification_state, latest_delay_minutes, critical_minutes, fallback_authority, fallback_status, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayScheduledSourceReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_observation_primary_reads')) {
        const [observation_id, site_id, source_locus, source_material_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, observation_authority, fallback_authority, fallback_status, dispatch_authority, dispatch_action, observation_json, classification_json, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayObservationPrimaryReads.find((entry) => entry.observation_id === observation_id);
        const row = { observation_id, site_id, source_locus, source_material_locus, target_locus, generated_at, latest_delay_minutes, critical_minutes, classification_state, observation_authority, fallback_authority, fallback_status, dispatch_authority, dispatch_action, observation_json, classification_json, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayObservationPrimaryReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_directive_dual_records')) {
        const [directive_record_id, site_id, operation_id, classification_state, latest_delay_minutes, critical_minutes, directive_action, directive_authority, fallback_authority, fallback_status, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayDirectiveRecords.find((entry) => entry.directive_record_id === directive_record_id);
        const row = { directive_record_id, site_id, operation_id, classification_state, latest_delay_minutes, critical_minutes, directive_action, directive_authority, fallback_authority, fallback_status, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayDirectiveRecords.push(row);
      } else if (normalized.startsWith('insert into cloudflare_webhook_delay_directive_deliveries')) {
        const [delivery_id, directive_record_id, site_id, operation_id, carrier_session_id, delivery_state, classification_state, latest_delay_minutes, critical_minutes, directive_authority, dispatch_authority, fallback_authority, fallback_status, delivery_action, session_start_status, session_start_ok, delivery_status, delivery_ok, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, session_start_json, delivery_json, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.webhookDelayDirectiveDeliveries.find((entry) => entry.delivery_id === delivery_id);
        const row = { delivery_id, directive_record_id, site_id, operation_id, carrier_session_id, delivery_state, classification_state, latest_delay_minutes, critical_minutes, directive_authority, dispatch_authority, fallback_authority, fallback_status, delivery_action, session_start_status, session_start_ok, delivery_status, delivery_ok, threshold_policy_json, observation_json, classification_json, directive_intent_json, carrier_admission_json, session_start_json, delivery_json, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.webhookDelayDirectiveDeliveries.push(row);
      } else if (normalized.startsWith('insert into cloudflare_resident_loop_shadow_runs')) {
        const [loop_run_id, site_id, operation_id, source_locus, target_locus, run_started_at, run_finished_at, loop_status, step_count, operator_attention_count, dispatch_authority, shadow_mode, dispatch_action, loop_run_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.residentLoopShadowRuns.find((entry) => entry.loop_run_id === loop_run_id);
        const row = { loop_run_id, site_id, operation_id, source_locus, target_locus, run_started_at, run_finished_at, loop_status, step_count, operator_attention_count, dispatch_authority, shadow_mode, dispatch_action, loop_run_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.residentLoopShadowRuns.push(row);
      } else if (normalized.startsWith('insert into cloudflare_mailbox_status_shadow_reads')) {
        const [read_id, site_id, source_locus, target_locus, source_schema, generated_at, account_ref, mailbox_status, unread_count, pending_draft_count, pending_send_count, latest_message_at, ticket_count, sync_state, mailbox_read_authority, mailbox_write_authority, mailbox_send_admission, mailbox_mutation_admission, shadow_read_posture, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.mailboxStatusShadowReads.find((entry) => entry.read_id === read_id);
        const row = { read_id, site_id, source_locus, target_locus, source_schema, generated_at, account_ref, mailbox_status, unread_count, pending_draft_count, pending_send_count, latest_message_at, ticket_count, sync_state, mailbox_read_authority, mailbox_write_authority, mailbox_send_admission, mailbox_mutation_admission, shadow_read_posture, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.mailboxStatusShadowReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_mailbox_status_source_reads')) {
        const [read_id, site_id, source_locus, source_adapter, generated_at, account_ref, mailbox_status, unread_count, pending_draft_count, pending_send_count, latest_message_at, mailbox_read_authority, mailbox_send_admission, mailbox_mutation_admission, source_response_json, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.mailboxStatusSourceReads.find((entry) => entry.read_id === read_id);
        const row = { read_id, site_id, source_locus, source_adapter, generated_at, account_ref, mailbox_status, unread_count, pending_draft_count, pending_send_count, latest_message_at, mailbox_read_authority, mailbox_send_admission, mailbox_mutation_admission, source_response_json, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.mailboxStatusSourceReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_mailbox_draft_reply_proposals')) {
        const [proposal_id, site_id, source_schema, generated_at, operation_id, account_ref, source_message_ref, proposal_ref, subject, recipient_count, body_preview, body_sha256, rationale, proposal_authority, mailbox_outlook_draft_create_admission, mailbox_send_admission, mailbox_mutation_admission, windows_draft_executor_fallback, proposal_posture, proposal_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.mailboxDraftReplyProposals.find((entry) => entry.proposal_id === proposal_id);
        const row = { proposal_id, site_id, source_schema, generated_at, operation_id, account_ref, source_message_ref, proposal_ref, subject, recipient_count, body_preview, body_sha256, rationale, proposal_authority, mailbox_outlook_draft_create_admission, mailbox_send_admission, mailbox_mutation_admission, windows_draft_executor_fallback, proposal_posture, proposal_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.mailboxDraftReplyProposals.push(row);
      } else if (normalized.startsWith('insert into cloudflare_mailbox_outlook_draft_creates')) {
        const [draft_create_id, site_id, source_schema, generated_at, operation_id, account_ref, source_message_ref, proposal_id, proposal_ref, subject, recipient_count, body_preview, body_sha256, outlook_draft_id, outlook_change_key, draft_create_authority, mailbox_outlook_draft_create_admission, mailbox_send_admission, mailbox_mutation_admission, draft_create_posture, graph_response_json, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.mailboxOutlookDraftCreates.find((entry) => entry.draft_create_id === draft_create_id);
        const row = { draft_create_id, site_id, source_schema, generated_at, operation_id, account_ref, source_message_ref, proposal_id, proposal_ref, subject, recipient_count, body_preview, body_sha256, outlook_draft_id, outlook_change_key, draft_create_authority, mailbox_outlook_draft_create_admission, mailbox_send_admission, mailbox_mutation_admission, draft_create_posture, graph_response_json, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.mailboxOutlookDraftCreates.push(row);
      } else if (normalized.startsWith('insert into cloudflare_mailbox_send_accepted_records')) {
        const [send_accepted_id, site_id, source_schema, generated_at, operation_id, account_ref, outlook_draft_id, draft_create_id, proposal_id, source_message_ref, send_authority, mailbox_send_admission, mailbox_mutation_admission, delivery_confirmation_admission, send_posture, graph_status, graph_response_json, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.mailboxSendAcceptedRecords.find((entry) => entry.send_accepted_id === send_accepted_id);
        const row = { send_accepted_id, site_id, source_schema, generated_at, operation_id, account_ref, outlook_draft_id, draft_create_id, proposal_id, source_message_ref, send_authority, mailbox_send_admission, mailbox_mutation_admission, delivery_confirmation_admission, send_posture, graph_status, graph_response_json, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.mailboxSendAcceptedRecords.push(row);
      } else if (normalized.startsWith('insert into cloudflare_mailbox_send_confirmation_records')) {
        const [send_confirmation_id, site_id, source_schema, generated_at, operation_id, send_accepted_id, account_ref, outlook_draft_id, sent_message_ref, internet_message_id, sent_at, confirmation_authority, delivery_confirmation_admission, mailbox_mutation_admission, confirmation_posture, graph_status, graph_response_json, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.mailboxSendConfirmations.find((entry) => entry.send_confirmation_id === send_confirmation_id);
        const row = { send_confirmation_id, site_id, source_schema, generated_at, operation_id, send_accepted_id, account_ref, outlook_draft_id, sent_message_ref, internet_message_id, sent_at, confirmation_authority, delivery_confirmation_admission, mailbox_mutation_admission, confirmation_posture, graph_status, graph_response_json, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.mailboxSendConfirmations.push(row);
      } else if (normalized.startsWith('insert into cloudflare_mailbox_send_review_records')) {
        const [review_id, site_id, source_schema, generated_at, operation_id, focus_kind, focus_ref, send_accepted_id, send_confirmation_id, review_action, review_status, review_authority, mailbox_mutation_admission, note, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.mailboxSendReviews.find((entry) => entry.review_id === review_id);
        const row = { review_id, site_id, source_schema, generated_at, operation_id, focus_kind, focus_ref, send_accepted_id, send_confirmation_id, review_action, review_status, review_authority, mailbox_mutation_admission, note, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.mailboxSendReviews.push(row);
      } else if (normalized.startsWith('insert into cloudflare_operation_focus_review_records')) {
        const [review_id, site_id, source_schema, generated_at, operation_id, focus_kind, focus_ref, review_action, review_status, review_authority, note, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.operationFocusReviews.find((entry) => entry.review_id === review_id);
        const row = { review_id, site_id, source_schema, generated_at, operation_id, focus_kind, focus_ref, review_action, review_status, review_authority, note, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.operationFocusReviews.push(row);
      } else if (normalized.startsWith('insert into cloudflare_site_file_change_proposals')) {
        const [proposal_id, site_id, source_schema, generated_at, operation_id, task_id, proposal_ref, proposal_summary, authority_locus, filesystem_executor_authority, filesystem_mutation_admission, repository_publication_admission, proposal_posture, file_count, proposal_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.siteFileChangeProposals.find((entry) => entry.proposal_id === proposal_id);
        const row = { proposal_id, site_id, source_schema, generated_at, operation_id, task_id, proposal_ref, proposal_summary, authority_locus, filesystem_executor_authority, filesystem_mutation_admission, repository_publication_admission, proposal_posture, file_count, proposal_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.siteFileChangeProposals.push(row);
      } else if (normalized.startsWith('insert into cloudflare_site_file_materializations')) {
        const [materialization_id, site_id, generated_at, operation_id, task_id, proposal_id, proposal_ref, file_path, content_sha256, content_ref, materialization_authority_ref, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, authority_locus, filesystem_executor_authority, windows_filesystem_mutation_admission, repository_publication_admission, write_effect, materialization_posture, materialization_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.siteFileMaterializations.find((entry) => entry.materialization_id === materialization_id);
        const row = { materialization_id, site_id, generated_at, operation_id, task_id, proposal_id, proposal_ref, file_path, content_sha256, content_ref, materialization_authority_ref, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, authority_locus, filesystem_executor_authority, windows_filesystem_mutation_admission, repository_publication_admission, write_effect, materialization_posture, materialization_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.siteFileMaterializations.push(row);
      } else if (normalized.startsWith('insert into cloudflare_local_ingress_requests')) {
        const [local_ingress_request_id, site_id, generated_at, operation_id, task_id, requested_mutation_class, requested_action_ref, requested_action_summary, governed_request_contract_ref, evidence_return_contract_ref, rollback_plan_ref, authority_locus, target_authority_locus, local_executor_authority, local_execution_admission, direct_cloudflare_filesystem_mutation_admission, repository_publication_admission, request_posture, request_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.localIngressRequests.find((entry) => entry.local_ingress_request_id === local_ingress_request_id);
        const row = { local_ingress_request_id, site_id, generated_at, operation_id, task_id, requested_mutation_class, requested_action_ref, requested_action_summary, governed_request_contract_ref, evidence_return_contract_ref, rollback_plan_ref, authority_locus, target_authority_locus, local_executor_authority, local_execution_admission, direct_cloudflare_filesystem_mutation_admission, repository_publication_admission, request_posture, request_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.localIngressRequests.push(row);
      } else if (normalized.startsWith('insert into cloudflare_local_ingress_evidence')) {
        const [local_ingress_evidence_id, site_id, generated_at, local_ingress_request_id, local_execution_id, requested_mutation_class, windows_admission_action, windows_admission_reason, local_execution_status, local_executor_authority, local_filesystem_mutation_admission, changed_file_count, rollback_evidence_ref, direct_cloudflare_filesystem_mutation_admission, repository_publication_admission, evidence_posture, evidence_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.localIngressEvidence.find((entry) => entry.local_ingress_evidence_id === local_ingress_evidence_id);
        const row = { local_ingress_evidence_id, site_id, generated_at, local_ingress_request_id, local_execution_id, requested_mutation_class, windows_admission_action, windows_admission_reason, local_execution_status, local_executor_authority, local_filesystem_mutation_admission, changed_file_count, rollback_evidence_ref, direct_cloudflare_filesystem_mutation_admission, repository_publication_admission, evidence_posture, evidence_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.localIngressEvidence.push(row);
      } else if (normalized.startsWith('insert into cloudflare_local_ingress_provider_heartbeats')) {
        const [local_ingress_provider_heartbeat_id, site_id, generated_at, last_run_at, provider_id, provider_authority, provider_embodiment, status, heartbeat_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.localIngressProviderHeartbeats.find((entry) => entry.local_ingress_provider_heartbeat_id === local_ingress_provider_heartbeat_id);
        const row = { local_ingress_provider_heartbeat_id, site_id, generated_at, last_run_at, provider_id, provider_authority, provider_embodiment, status, heartbeat_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.localIngressProviderHeartbeats.push(row);
      } else if (normalized.startsWith('insert into cloudflare_repository_publication_requests')) {
        const [repository_publication_request_id, site_id, generated_at, operation_id, task_id, publication_ref, requested_action_ref, requested_action_summary, repository_ref, branch_ref, source_change_ref, governed_request_contract_ref, evidence_return_contract_ref, rollback_plan_ref, authority_locus, repository_publication_executor_authority, repository_publication_admission, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, request_posture, request_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.repositoryPublicationRequests.find((entry) => entry.repository_publication_request_id === repository_publication_request_id);
        const row = { repository_publication_request_id, site_id, generated_at, operation_id, task_id, publication_ref, requested_action_ref, requested_action_summary, repository_ref, branch_ref, source_change_ref, governed_request_contract_ref, evidence_return_contract_ref, rollback_plan_ref, authority_locus, repository_publication_executor_authority, repository_publication_admission, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, request_posture, request_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.repositoryPublicationRequests.push(row);
      } else if (normalized.startsWith('insert into cloudflare_repository_publication_admissions')) {
        const [repository_publication_admission_id, site_id, generated_at, repository_publication_request_id, admission_action, admission_reason, authority_locus, repository_publication_admission, repository_publication_executor_authority, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, admission_posture, admission_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.repositoryPublicationAdmissions.find((entry) => entry.repository_publication_admission_id === repository_publication_admission_id);
        const row = { repository_publication_admission_id, site_id, generated_at, repository_publication_request_id, admission_action, admission_reason, authority_locus, repository_publication_admission, repository_publication_executor_authority, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, admission_posture, admission_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.repositoryPublicationAdmissions.push(row);
      } else if (normalized.startsWith('insert into cloudflare_repository_publication_executions')) {
        const [repository_publication_execution_id, site_id, generated_at, repository_publication_request_id, publication_ref, requested_action_ref, repository_ref, branch_ref, source_change_ref, publication_status, repository_publication_executor_authority, repository_publication_admission_authority, repository_publication_admission, cloudflare_repository_publication_admission_id, cloudflare_repository_publication_admission_action, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, published_commit_ref, github_http_status, rollback_evidence_ref, execution_posture, execution_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.repositoryPublicationExecutions.find((entry) => entry.repository_publication_execution_id === repository_publication_execution_id);
        const row = { repository_publication_execution_id, site_id, generated_at, repository_publication_request_id, publication_ref, requested_action_ref, repository_ref, branch_ref, source_change_ref, publication_status, repository_publication_executor_authority, repository_publication_admission_authority, repository_publication_admission, cloudflare_repository_publication_admission_id, cloudflare_repository_publication_admission_action, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, published_commit_ref, github_http_status, rollback_evidence_ref, execution_posture, execution_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.repositoryPublicationExecutions.push(row);
      } else if (normalized.startsWith('insert into cloudflare_repository_publication_evidence')) {
        const [repository_publication_evidence_id, site_id, generated_at, repository_publication_request_id, publication_execution_id, publication_ref, requested_action_ref, repository_ref, branch_ref, source_change_ref, windows_admission_action, windows_admission_reason, publication_status, repository_publication_executor_authority, published_commit_ref, rollback_evidence_ref, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, evidence_posture, evidence_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.repositoryPublicationEvidence.find((entry) => entry.repository_publication_evidence_id === repository_publication_evidence_id);
        const row = { repository_publication_evidence_id, site_id, generated_at, repository_publication_request_id, publication_execution_id, publication_ref, requested_action_ref, repository_ref, branch_ref, source_change_ref, windows_admission_action, windows_admission_reason, publication_status, repository_publication_executor_authority, published_commit_ref, rollback_evidence_ref, cloudflare_git_push_admission, direct_cloudflare_repository_mutation_admission, evidence_posture, evidence_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.repositoryPublicationEvidence.push(row);
      } else if (normalized.startsWith('insert into cloudflare_repository_publication_provider_heartbeats')) {
        const [repository_publication_provider_heartbeat_id, site_id, generated_at, last_run_at, provider_id, provider_authority, provider_embodiment, status, heartbeat_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.repositoryPublicationProviderHeartbeats.find((entry) => entry.repository_publication_provider_heartbeat_id === repository_publication_provider_heartbeat_id);
        const row = { repository_publication_provider_heartbeat_id, site_id, generated_at, last_run_at, provider_id, provider_authority, provider_embodiment, status, heartbeat_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.repositoryPublicationProviderHeartbeats.push(row);
      } else if (normalized.startsWith('insert into cloudflare_task_lifecycle_shadow_reads')) {
        const [read_id, site_id, source_locus, target_locus, source_url_host, source_db_path, source_schema, generated_at, task_count, status_counts_json, tasks_json, mutation_authority, shadow_read_posture, cloudflare_write_admission, dispatch_authority, shadow_mode, dispatch_action, record_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.taskLifecycleShadowReads.find((entry) => entry.read_id === read_id);
        const row = { read_id, site_id, source_locus, target_locus, source_url_host, source_db_path, source_schema, generated_at, task_count, status_counts_json, tasks_json, mutation_authority, shadow_read_posture, cloudflare_write_admission, dispatch_authority, shadow_mode, dispatch_action, record_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.taskLifecycleShadowReads.push(row);
      } else if (normalized.startsWith('insert into cloudflare_task_lifecycle_write_admissions')) {
        const [admission_id, site_id, mutation_class, admission_action, admission_reason, authority_locus, target_authority_locus, mutation_authority, cloudflare_write_admission, write_effect, decision_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.taskLifecycleWriteAdmissions.find((entry) => entry.admission_id === admission_id);
        const row = { admission_id, site_id, mutation_class, admission_action, admission_reason, authority_locus, target_authority_locus, mutation_authority, cloudflare_write_admission, write_effect, decision_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.taskLifecycleWriteAdmissions.push(row);
      } else if (normalized.startsWith('insert into cloudflare_task_lifecycle_tasks')) {
        const [site_id, task_id, task_number, title, description, status, source, authority_locus, mutation_authority, cloudflare_write_admission, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, task_json, created_by_principal_id, created_at, updated_at] = bindings;
        const existing = state.taskLifecycleTasks.find((entry) => entry.site_id === site_id && entry.task_id === task_id);
        const row = { site_id, task_id, task_number, title, description, status, source, authority_locus, mutation_authority, cloudflare_write_admission, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, task_json, created_by_principal_id, created_at, updated_at };
        if (existing) Object.assign(existing, row);
        else state.taskLifecycleTasks.push(row);
      } else if (normalized.startsWith('update cloudflare_task_lifecycle_tasks')) {
        const [status, task_json, updated_at, site_id, task_id] = bindings;
        const existing = state.taskLifecycleTasks.find((entry) => entry.site_id === site_id && entry.task_id === task_id);
        if (existing) Object.assign(existing, { status, task_json, updated_at });
      } else if (normalized.startsWith('insert into cloudflare_resident_dispatch_decisions')) {
        const [dispatch_decision_id, site_id, operation_id, carrier_session_id, decision_state, dispatch_authority, fallback_authority, fallback_status, dispatch_action, dispatch_scope, session_start_status, session_start_ok, decision_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.residentDispatchDecisions.find((entry) => entry.dispatch_decision_id === dispatch_decision_id);
        const row = { dispatch_decision_id, site_id, operation_id, carrier_session_id, decision_state, dispatch_authority, fallback_authority, fallback_status, dispatch_action, dispatch_scope, session_start_status, session_start_ok, decision_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.residentDispatchDecisions.push(row);
      } else if (normalized.startsWith('insert into cloudflare_resident_dispatch_windows_fallback_requests')) {
        const [fallback_request_id, site_id, generated_at, operation_id, dispatch_decision_id, carrier_session_id, requested_action_ref, requested_action_summary, governed_request_contract_ref, evidence_return_contract_ref, rollback_plan_ref, authority_locus, windows_fallback_ref, local_executor_authority, local_execution_admission, direct_cloudflare_session_start_admission, request_posture, request_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.residentDispatchWindowsFallbackRequests.find((entry) => entry.fallback_request_id === fallback_request_id);
        const row = { fallback_request_id, site_id, generated_at, operation_id, dispatch_decision_id, carrier_session_id, requested_action_ref, requested_action_summary, governed_request_contract_ref, evidence_return_contract_ref, rollback_plan_ref, authority_locus, windows_fallback_ref, local_executor_authority, local_execution_admission, direct_cloudflare_session_start_admission, request_posture, request_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.residentDispatchWindowsFallbackRequests.push(row);
      } else if (normalized.startsWith('insert into cloudflare_resident_dispatch_windows_fallback_evidence')) {
        const [fallback_evidence_id, site_id, generated_at, fallback_request_id, operation_id, dispatch_decision_id, local_execution_id, windows_admission_action, windows_admission_reason, local_execution_status, local_executor_authority, local_session_start_admission, local_resident_session_ref, rollback_evidence_ref, direct_cloudflare_session_start_admission, evidence_posture, evidence_json, recorded_by_principal_id, recorded_at] = bindings;
        const existing = state.residentDispatchWindowsFallbackEvidence.find((entry) => entry.fallback_evidence_id === fallback_evidence_id);
        const row = { fallback_evidence_id, site_id, generated_at, fallback_request_id, operation_id, dispatch_decision_id, local_execution_id, windows_admission_action, windows_admission_reason, local_execution_status, local_executor_authority, local_session_start_admission, local_resident_session_ref, rollback_evidence_ref, direct_cloudflare_session_start_admission, evidence_posture, evidence_json, recorded_by_principal_id, recorded_at };
        if (existing) Object.assign(existing, row);
        else state.residentDispatchWindowsFallbackEvidence.push(row);
      } else if (normalized.startsWith('insert into cloudflare_carrier_session_events')) {
        const [carrier_session_id, sequence, event_id, site_id, operation_id, agent_id, event_kind, occurred_at, event_json, indexed_at] = bindings;
        const existing = state.carrierSessionEvents.find((entry) => entry.carrier_session_id === carrier_session_id && Number(entry.sequence) === Number(sequence));
        const row = { carrier_session_id, sequence: Number(sequence), event_id, site_id, operation_id, agent_id, event_kind, occurred_at, event_json, indexed_at };
        if (existing) Object.assign(existing, row);
        else state.carrierSessionEvents.push(row);
      }
      return { success: true };
    },
    async first() {
      if (normalized.includes('from cloudflare_sites where site_id = ?')) {
        const [siteId] = bindings;
        return clone(state.sites.find((site) => site.site_id === siteId));
      }
      if (normalized.includes('from cloudflare_site_memberships where site_id = ? and principal_id = ?')) {
        const [siteId, principalId] = bindings;
        return clone(state.memberships.find((membership) => membership.site_id === siteId && membership.principal_id === principalId));
      }
      if (normalized.includes('from cloudflare_site_carrier_sessions where carrier_session_id = ?')) {
        const [carrierSessionId] = bindings;
        return clone(state.carrierSessions.find((entry) => entry.carrier_session_id === carrierSessionId));
      }
      if (normalized.includes('from cloudflare_site_operations where operation_id = ?')) {
        const [operationId] = bindings;
        return clone(state.operations.find((entry) => entry.operation_id === operationId));
      }
      if (normalized.includes('from cloudflare_site_continuity_packets where packet_id = ?')) {
        const [packetId] = bindings;
        return clone(state.continuityPackets.find((entry) => entry.packet_id === packetId));
      }
      if (normalized.includes('from cloudflare_operator_sessions')) {
        const [operatorSessionId, now] = bindings;
        return clone(state.operatorSessions.find((entry) => (
          entry.operator_session_id === operatorSessionId
          && entry.revoked_at == null
          && entry.expires_at > now
        )));
      }
      if (normalized.includes('max(task_number)') && normalized.includes('from cloudflare_task_lifecycle_tasks')) {
        const [siteId] = bindings;
        const maxTaskNumber = state.taskLifecycleTasks
          .filter((entry) => entry.site_id === siteId)
          .reduce((max, entry) => Math.max(max, Number(entry.task_number)), 0);
        return { next_task_number: maxTaskNumber + 1 };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_tasks') && normalized.includes('task_id = ?')) {
        const [siteId, taskId] = bindings;
        return clone(state.taskLifecycleTasks.find((entry) => entry.site_id === siteId && entry.task_id === taskId));
      }
      if (normalized.includes('from cloudflare_mailbox_send_accepted_records') && normalized.includes('send_accepted_id = ?')) {
        const [siteId, sendAcceptedId] = bindings;
        return clone(state.mailboxSendAcceptedRecords.find((entry) => entry.site_id === siteId && entry.send_accepted_id === sendAcceptedId));
      }
      return null;
    },
    async all() {
      if (normalized.includes('from cloudflare_sites s join cloudflare_site_memberships m')) {
        const [principalId] = bindings;
        const visibleSiteIds = new Set(state.memberships
          .filter((membership) => membership.principal_id === principalId && membership.status === 'active')
          .map((membership) => membership.site_id));
        return {
          results: state.sites
            .filter((site) => visibleSiteIds.has(site.site_id) && site.status === 'active')
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .map((site) => clone(site)),
        };
      }
      if (normalized.includes('from cloudflare_site_carrier_sessions')) {
        if (normalized.includes('where operation_id = ?')) {
          const [operationId, limit] = bindings;
          return {
            results: state.carrierSessions
              .filter((entry) => entry.operation_id === operationId)
              .sort((left, right) => right.created_at.localeCompare(left.created_at))
              .slice(0, Number(limit))
              .map((entry) => clone(entry)),
          };
        }
        const [siteId, limit] = bindings;
        return {
          results: state.carrierSessions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.created_at.localeCompare(left.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_mailbox_status_source_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.mailboxStatusSourceReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_mailbox_draft_reply_proposals')) {
        const [siteId, limit] = bindings;
        return {
          results: state.mailboxDraftReplyProposals
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_mailbox_outlook_draft_creates')) {
        const [siteId, limit] = bindings;
        return {
          results: state.mailboxOutlookDraftCreates
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_mailbox_send_accepted_records')) {
        const [siteId, limit] = bindings;
        return {
          results: state.mailboxSendAcceptedRecords
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_mailbox_send_confirmation_records')) {
        const [siteId, limit] = bindings;
        return {
          results: state.mailboxSendConfirmations
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_mailbox_send_review_records')) {
        const [siteId, limit] = bindings;
        return {
          results: state.mailboxSendReviews
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_operation_focus_review_records')) {
        const [siteId, limit] = bindings;
        return {
          results: state.operationFocusReviews
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_continuity_reconciliation_executions')) {
        const [siteId, limit] = bindings;
        return {
          results: state.continuityReconciliationExecutions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_continuity_loop_reports')) {
        const [siteId, limit] = bindings;
        return {
          results: state.continuityLoopReports
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_carrier_session_events')) {
        const [carrierSessionId, limit] = bindings;
        return {
          results: state.carrierSessionEvents
            .filter((entry) => entry.carrier_session_id === carrierSessionId)
            .sort((left, right) => Number(left.sequence) - Number(right.sequence))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_authority_events')) {
        const [siteId, limit] = bindings;
        return {
          results: state.authorityEvents
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_settings')) {
        const [siteId] = bindings;
        return { results: state.settings.filter((entry) => entry.site_id === siteId).map((entry) => clone(entry)) };
      }
      if (normalized.includes('from cloudflare_site_operations')) {
        const [siteId, limit] = bindings;
        return {
          results: state.operations
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_continuity_packets')) {
        const [siteId, limit] = bindings;
        return {
          results: state.continuityPackets
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.imported_at.localeCompare(left.imported_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_shadow_observations')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayShadowObservations
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_remote_source_samples')) {
        const [siteId, sourceAdapterId, limit] = bindings;
        return {
          results: state.webhookDelayRemoteSourceSamples
            .filter((entry) => entry.site_id === siteId && entry.source_adapter_id === sourceAdapterId)
            .sort((left, right) => right.observed_at.localeCompare(left.observed_at) || right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_scheduled_source_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayScheduledSourceReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.scheduled_at.localeCompare(left.scheduled_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_observation_primary_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayObservationPrimaryReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_directive_dual_records')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayDirectiveRecords
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_webhook_delay_directive_deliveries')) {
        const [siteId, limit] = bindings;
        return {
          results: state.webhookDelayDirectiveDeliveries
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_resident_loop_shadow_runs')) {
        const [siteId, limit] = bindings;
        return {
          results: state.residentLoopShadowRuns
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_mailbox_status_shadow_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.mailboxStatusShadowReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_file_change_proposals')) {
        const [siteId, limit] = bindings;
        return {
          results: state.siteFileChangeProposals
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_file_materializations')) {
        const [siteId, limit] = bindings;
        return {
          results: state.siteFileMaterializations
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_local_ingress_requests')) {
        const [siteId, limit] = bindings;
        return {
          results: state.localIngressRequests
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_local_ingress_evidence')) {
        const [siteId, maybeRequestId, maybeLimit] = bindings;
        const hasRequestFilter = normalized.includes('local_ingress_request_id = ?');
        const requestId = hasRequestFilter ? maybeRequestId : null;
        const limit = hasRequestFilter ? maybeLimit : maybeRequestId;
        return {
          results: state.localIngressEvidence
            .filter((entry) => entry.site_id === siteId && (!requestId || entry.local_ingress_request_id === requestId))
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_local_ingress_provider_heartbeats')) {
        const [siteId, limit] = bindings;
        return {
          results: state.localIngressProviderHeartbeats
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_repository_publication_requests')) {
        const [siteId, limit] = bindings;
        return {
          results: state.repositoryPublicationRequests
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_repository_publication_admissions')) {
        const [siteId, maybeRequestId, maybeLimit] = bindings;
        const hasRequestFilter = normalized.includes('repository_publication_request_id = ?');
        const requestId = hasRequestFilter ? maybeRequestId : null;
        const limit = hasRequestFilter ? maybeLimit : maybeRequestId;
        return {
          results: state.repositoryPublicationAdmissions
            .filter((entry) => entry.site_id === siteId && (!requestId || entry.repository_publication_request_id === requestId))
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_repository_publication_executions')) {
        const [siteId, maybeRequestId, maybeLimit] = bindings;
        const hasRequestFilter = normalized.includes('repository_publication_request_id = ?');
        const requestId = hasRequestFilter ? maybeRequestId : null;
        const limit = hasRequestFilter ? maybeLimit : maybeRequestId;
        return {
          results: state.repositoryPublicationExecutions
            .filter((entry) => entry.site_id === siteId && (!requestId || entry.repository_publication_request_id === requestId))
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_repository_publication_evidence')) {
        const [siteId, maybeRequestId, maybeLimit] = bindings;
        const hasRequestFilter = normalized.includes('repository_publication_request_id = ?');
        const requestId = hasRequestFilter ? maybeRequestId : null;
        const limit = hasRequestFilter ? maybeLimit : maybeRequestId;
        return {
          results: state.repositoryPublicationEvidence
            .filter((entry) => entry.site_id === siteId && (!requestId || entry.repository_publication_request_id === requestId))
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_repository_publication_provider_heartbeats')) {
        const [siteId, limit] = bindings;
        return {
          results: state.repositoryPublicationProviderHeartbeats
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_shadow_reads')) {
        const [siteId, limit] = bindings;
        return {
          results: state.taskLifecycleShadowReads
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_write_admissions')) {
        const [siteId, limit] = bindings;
        return {
          results: state.taskLifecycleWriteAdmissions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_task_lifecycle_tasks')) {
        const [siteId, limit] = bindings;
        return {
          results: state.taskLifecycleTasks
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => Number(left.task_number) - Number(right.task_number))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_resident_dispatch_decisions')) {
        const [siteId, limit] = bindings;
        return {
          results: state.residentDispatchDecisions
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_resident_dispatch_windows_fallback_requests')) {
        const [siteId, limit] = bindings;
        return {
          results: state.residentDispatchWindowsFallbackRequests
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_resident_dispatch_windows_fallback_evidence')) {
        const [siteId, limit] = bindings;
        return {
          results: state.residentDispatchWindowsFallbackEvidence
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at) || right.generated_at.localeCompare(left.generated_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      if (normalized.includes('from cloudflare_site_memberships')) {
        const [siteId, limit] = bindings;
        return {
          results: state.memberships
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => left.created_at.localeCompare(right.created_at))
            .slice(0, Number(limit))
            .map((entry) => clone(entry)),
        };
      }
      return { results: [] };
    },
  };
}

function fakeD1Statement(rows, sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  let bindings = [];
  return {
    bind(...values) {
      bindings = values;
      return this;
    },
    async run() {
      if (normalized.startsWith('insert into narada_tasks')) {
        const [site_id, task_id, task_number, title, description, status, source, note, created_at, updated_at, carrier_session_id, agent_id, site_root] = bindings;
        rows.push({ site_id, task_id, task_number, title, description, status, source, note, created_at, updated_at, carrier_session_id, agent_id, site_root });
      } else if (normalized.startsWith('update narada_tasks set')) {
        const [status, note, updated_at, siteId, taskId] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && entry.task_id === taskId);
        if (row) Object.assign(row, { status, note, updated_at });
      }
      return { success: true };
    },
    async first() {
      if (normalized.startsWith('select coalesce(max(task_number)')) {
        const [siteId] = bindings;
        const max = rows.filter((entry) => entry.site_id === siteId).reduce((value, entry) => Math.max(value, Number(entry.task_number)), 0);
        return { next_task_number: max + 1 };
      }
      if (normalized.includes('where site_id = ? and task_id = ?')) {
        const [siteId, taskId] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && entry.task_id === taskId);
        return row ? clone(row) : null;
      }
      if (normalized.includes('where site_id = ? and task_number = ?')) {
        const [siteId, taskNumber] = bindings;
        const row = rows.find((entry) => entry.site_id === siteId && Number(entry.task_number) === Number(taskNumber));
        return row ? clone(row) : null;
      }
      return null;
    },
    async all() {
      if (normalized.includes('where site_id = ? order by task_number')) {
        const [siteId] = bindings;
        return {
          results: rows
            .filter((entry) => entry.site_id === siteId)
            .sort((left, right) => Number(left.task_number) - Number(right.task_number))
            .map((entry) => clone(entry)),
        };
      }
      return { results: [] };
    },
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
