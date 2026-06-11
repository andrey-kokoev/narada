-- cloudflare_site_continuity_loop_reports
CREATE TABLE IF NOT EXISTS cloudflare_site_continuity_loop_reports (
    report_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    status TEXT NOT NULL,
    generated_at TEXT,
    cloudflare_source TEXT,
    cloudflare_push_status TEXT,
    windows_packet_count INTEGER NOT NULL,
    cloudflare_credential_source TEXT,
    report_json TEXT NOT NULL,
    recorded_by_principal_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

-- cloudflare_site_continuity_reconciliation_executions
CREATE TABLE IF NOT EXISTS cloudflare_site_continuity_reconciliation_executions (
    execution_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    status TEXT NOT NULL,
    generated_at TEXT,
    persisted_at TEXT,
    reconciliation_plan_status TEXT,
    selected_site_count INTEGER NOT NULL,
    executed_site_count INTEGER NOT NULL,
    completed_site_count INTEGER NOT NULL,
    failed_site_count INTEGER NOT NULL,
    refusal_reason TEXT,
    execution_json TEXT NOT NULL,
    recorded_by_principal_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );

-- cloudflare_resident_dispatch_decisions
CREATE TABLE IF NOT EXISTS cloudflare_resident_dispatch_decisions (
      dispatch_decision_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      carrier_session_id TEXT,
      decision_state TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      dispatch_scope TEXT NOT NULL,
      session_start_status INTEGER NOT NULL,
      session_start_ok INTEGER NOT NULL,
      decision_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_mailbox_status_shadow_reads
CREATE TABLE IF NOT EXISTS cloudflare_mailbox_status_shadow_reads (
      read_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      account_ref TEXT NOT NULL,
      mailbox_status TEXT NOT NULL,
      unread_count INTEGER NOT NULL,
      pending_draft_count INTEGER NOT NULL,
      pending_send_count INTEGER NOT NULL,
      latest_message_at TEXT,
      ticket_count INTEGER NOT NULL,
      sync_state TEXT NOT NULL,
      mailbox_read_authority TEXT NOT NULL,
      mailbox_write_authority TEXT NOT NULL,
      mailbox_send_admission TEXT NOT NULL,
      mailbox_mutation_admission TEXT NOT NULL,
      shadow_read_posture TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_mailbox_status_source_reads
CREATE TABLE IF NOT EXISTS cloudflare_mailbox_status_source_reads (
      read_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      source_adapter TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      account_ref TEXT NOT NULL,
      mailbox_status TEXT NOT NULL,
      unread_count INTEGER NOT NULL,
      pending_draft_count INTEGER NOT NULL,
      pending_send_count INTEGER NOT NULL,
      latest_message_at TEXT,
      mailbox_read_authority TEXT NOT NULL,
      mailbox_send_admission TEXT NOT NULL,
      mailbox_mutation_admission TEXT NOT NULL,
      source_response_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_mailbox_draft_reply_proposals
CREATE TABLE IF NOT EXISTS cloudflare_mailbox_draft_reply_proposals (
      proposal_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      account_ref TEXT NOT NULL,
      source_message_ref TEXT NOT NULL,
      proposal_ref TEXT NOT NULL,
      subject TEXT NOT NULL,
      recipient_count INTEGER NOT NULL,
      body_preview TEXT NOT NULL,
      body_sha256 TEXT,
      rationale TEXT NOT NULL,
      proposal_authority TEXT NOT NULL,
      mailbox_outlook_draft_create_admission TEXT NOT NULL,
      mailbox_send_admission TEXT NOT NULL,
      mailbox_mutation_admission TEXT NOT NULL,
      windows_draft_executor_fallback TEXT NOT NULL,
      proposal_posture TEXT NOT NULL,
      proposal_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_mailbox_outlook_draft_creates
CREATE TABLE IF NOT EXISTS cloudflare_mailbox_outlook_draft_creates (
      draft_create_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, account_ref TEXT NOT NULL, source_message_ref TEXT, proposal_id TEXT, proposal_ref TEXT, subject TEXT NOT NULL, recipient_count INTEGER NOT NULL, body_preview TEXT NOT NULL, body_sha256 TEXT, outlook_draft_id TEXT NOT NULL, outlook_change_key TEXT, draft_create_authority TEXT NOT NULL, mailbox_outlook_draft_create_admission TEXT NOT NULL, mailbox_send_admission TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, draft_create_posture TEXT NOT NULL, graph_response_json TEXT NOT NULL, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    );

-- cloudflare_mailbox_send_accepted_records
CREATE TABLE IF NOT EXISTS cloudflare_mailbox_send_accepted_records (
      send_accepted_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, account_ref TEXT NOT NULL, outlook_draft_id TEXT NOT NULL, draft_create_id TEXT, proposal_id TEXT, source_message_ref TEXT, send_authority TEXT NOT NULL, mailbox_send_admission TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, delivery_confirmation_admission TEXT NOT NULL, send_posture TEXT NOT NULL, graph_status INTEGER NOT NULL, graph_response_json TEXT NOT NULL, cutover_point_ref TEXT NOT NULL, governed_write_contract_ref TEXT NOT NULL, confirmation_evidence_ref TEXT NOT NULL, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    );

-- cloudflare_mailbox_send_confirmation_records
CREATE TABLE IF NOT EXISTS cloudflare_mailbox_send_confirmation_records (
      send_confirmation_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, send_accepted_id TEXT NOT NULL, account_ref TEXT NOT NULL, outlook_draft_id TEXT, sent_message_ref TEXT NOT NULL, internet_message_id TEXT, sent_at TEXT, confirmation_authority TEXT NOT NULL, delivery_confirmation_admission TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, confirmation_posture TEXT NOT NULL, graph_status INTEGER NOT NULL, graph_response_json TEXT NOT NULL, cutover_point_ref TEXT, governed_write_contract_ref TEXT, confirmation_evidence_ref TEXT, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    );

-- cloudflare_mailbox_send_review_records
CREATE TABLE IF NOT EXISTS cloudflare_mailbox_send_review_records (
      review_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, focus_kind TEXT NOT NULL, focus_ref TEXT NOT NULL, send_accepted_id TEXT, send_confirmation_id TEXT, review_action TEXT NOT NULL, review_status TEXT NOT NULL, review_authority TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, note TEXT, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    );

-- cloudflare_operation_focus_review_records
CREATE TABLE IF NOT EXISTS cloudflare_operation_focus_review_records (
      review_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      focus_kind TEXT NOT NULL,
      focus_ref TEXT NOT NULL,
      review_action TEXT NOT NULL,
      review_status TEXT NOT NULL,
      review_authority TEXT NOT NULL,
      note TEXT,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_resident_loop_shadow_runs
CREATE TABLE IF NOT EXISTS cloudflare_resident_loop_shadow_runs (
      loop_run_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      run_started_at TEXT NOT NULL,
      run_finished_at TEXT,
      loop_status TEXT NOT NULL,
      step_count INTEGER NOT NULL,
      operator_attention_count INTEGER NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      loop_run_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_task_lifecycle_shadow_reads
CREATE TABLE IF NOT EXISTS cloudflare_task_lifecycle_shadow_reads (
      read_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      source_url_host TEXT,
      source_db_path TEXT,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      task_count INTEGER NOT NULL,
      status_counts_json TEXT NOT NULL,
      tasks_json TEXT NOT NULL,
      mutation_authority TEXT NOT NULL,
      shadow_read_posture TEXT NOT NULL,
      cloudflare_write_admission TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_task_lifecycle_write_admissions
CREATE TABLE IF NOT EXISTS cloudflare_task_lifecycle_write_admissions (
      admission_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      mutation_class TEXT NOT NULL,
      admission_action TEXT NOT NULL,
      admission_reason TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      target_authority_locus TEXT NOT NULL,
      mutation_authority TEXT NOT NULL,
      cloudflare_write_admission TEXT NOT NULL,
      write_effect TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_task_lifecycle_tasks
CREATE TABLE IF NOT EXISTS cloudflare_task_lifecycle_tasks (
      site_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      mutation_authority TEXT NOT NULL,
      cloudflare_write_admission TEXT NOT NULL,
      cutover_point_ref TEXT NOT NULL,
      governed_write_contract_ref TEXT NOT NULL,
      confirmation_evidence_ref TEXT NOT NULL,
      task_json TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, task_id)
    );

-- cloudflare_site_file_change_proposals
CREATE TABLE IF NOT EXISTS cloudflare_site_file_change_proposals (
      proposal_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      proposal_ref TEXT NOT NULL,
      proposal_summary TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      filesystem_executor_authority TEXT NOT NULL,
      filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      proposal_posture TEXT NOT NULL,
      file_count INTEGER NOT NULL,
      proposal_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_site_file_materializations
CREATE TABLE IF NOT EXISTS cloudflare_site_file_materializations (
      materialization_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      proposal_id TEXT,
      proposal_ref TEXT,
      file_path TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      content_ref TEXT,
      materialization_authority_ref TEXT NOT NULL,
      cutover_point_ref TEXT NOT NULL,
      governed_write_contract_ref TEXT NOT NULL,
      confirmation_evidence_ref TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      filesystem_executor_authority TEXT NOT NULL,
      windows_filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      write_effect TEXT NOT NULL,
      materialization_posture TEXT NOT NULL,
      materialization_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_local_ingress_requests
CREATE TABLE IF NOT EXISTS cloudflare_local_ingress_requests (
      local_ingress_request_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      requested_mutation_class TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      requested_action_summary TEXT NOT NULL,
      governed_request_contract_ref TEXT NOT NULL,
      evidence_return_contract_ref TEXT NOT NULL,
      rollback_plan_ref TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      target_authority_locus TEXT NOT NULL,
      local_executor_authority TEXT NOT NULL,
      local_execution_admission TEXT NOT NULL,
      direct_cloudflare_filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      request_posture TEXT NOT NULL,
      request_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_repository_publication_requests
CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_requests (
      repository_publication_request_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      publication_ref TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      requested_action_summary TEXT NOT NULL,
      repository_ref TEXT NOT NULL,
      branch_ref TEXT NOT NULL,
      source_change_ref TEXT NOT NULL,
      governed_request_contract_ref TEXT NOT NULL,
      evidence_return_contract_ref TEXT NOT NULL,
      rollback_plan_ref TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      request_posture TEXT NOT NULL,
      request_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_repository_publication_admissions
CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_admissions (
      repository_publication_admission_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      repository_publication_request_id TEXT NOT NULL,
      admission_action TEXT NOT NULL,
      admission_reason TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      admission_posture TEXT NOT NULL,
      admission_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_repository_publication_executions
CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_executions (
      repository_publication_execution_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      repository_publication_request_id TEXT NOT NULL,
      publication_ref TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      repository_ref TEXT NOT NULL,
      branch_ref TEXT NOT NULL,
      source_change_ref TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      repository_publication_admission_authority TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      cloudflare_repository_publication_admission_id TEXT NOT NULL,
      cloudflare_repository_publication_admission_action TEXT NOT NULL,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      published_commit_ref TEXT,
      github_http_status INTEGER NOT NULL,
      rollback_evidence_ref TEXT NOT NULL,
      execution_posture TEXT NOT NULL,
      execution_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_local_ingress_evidence
CREATE TABLE IF NOT EXISTS cloudflare_local_ingress_evidence (
      local_ingress_evidence_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      local_ingress_request_id TEXT NOT NULL,
      local_execution_id TEXT NOT NULL,
      requested_mutation_class TEXT NOT NULL,
      windows_admission_action TEXT NOT NULL,
      windows_admission_reason TEXT NOT NULL,
      local_execution_status TEXT NOT NULL,
      local_executor_authority TEXT NOT NULL,
      local_filesystem_mutation_admission TEXT NOT NULL,
      changed_file_count INTEGER NOT NULL,
      rollback_evidence_ref TEXT,
      direct_cloudflare_filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      evidence_posture TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_local_ingress_provider_heartbeats
CREATE TABLE IF NOT EXISTS cloudflare_local_ingress_provider_heartbeats (
      local_ingress_provider_heartbeat_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      last_run_at TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_authority TEXT NOT NULL,
      provider_embodiment TEXT NOT NULL,
      status TEXT NOT NULL,
      heartbeat_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_repository_publication_evidence
CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_evidence (
      repository_publication_evidence_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      repository_publication_request_id TEXT NOT NULL,
      publication_execution_id TEXT NOT NULL,
      publication_ref TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      repository_ref TEXT NOT NULL,
      branch_ref TEXT NOT NULL,
      source_change_ref TEXT NOT NULL,
      windows_admission_action TEXT NOT NULL,
      windows_admission_reason TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      published_commit_ref TEXT,
      rollback_evidence_ref TEXT,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      evidence_posture TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_repository_publication_provider_heartbeats
CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_provider_heartbeats (
      repository_publication_provider_heartbeat_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      last_run_at TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_authority TEXT NOT NULL,
      provider_embodiment TEXT NOT NULL,
      status TEXT NOT NULL,
      heartbeat_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_webhook_delay_shadow_observations
CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_shadow_observations (
      observation_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      classification_state TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_webhook_delay_observation_primary_reads
CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_observation_primary_reads (
      observation_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      source_material_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      classification_state TEXT NOT NULL,
      observation_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_webhook_delay_scheduled_source_reads
CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_scheduled_source_reads (
      scheduled_run_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_adapter_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      trigger_authority TEXT NOT NULL,
      trigger_kind TEXT NOT NULL,
      cron TEXT,
      scheduled_at TEXT NOT NULL,
      run_status TEXT NOT NULL,
      failure_code TEXT,
      source_material_locus TEXT NOT NULL,
      source_authority TEXT NOT NULL,
      source_sample_count INTEGER,
      classification_state TEXT,
      latest_delay_minutes REAL,
      critical_minutes REAL NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_webhook_delay_remote_source_samples
CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_remote_source_samples (
      sample_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_adapter_id TEXT NOT NULL,
      sample_role TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      observed_at_ct TEXT,
      elapsed_minutes REAL,
      delay_minutes REAL NOT NULL,
      sample_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_webhook_delay_directive_dual_records
CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_directive_dual_records (
      directive_record_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      classification_state TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      directive_action TEXT NOT NULL,
      directive_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      threshold_policy_json TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      directive_intent_json TEXT NOT NULL,
      carrier_admission_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_webhook_delay_directive_deliveries
CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_directive_deliveries (
      delivery_id TEXT PRIMARY KEY,
      directive_record_id TEXT,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      carrier_session_id TEXT NOT NULL,
      delivery_state TEXT NOT NULL,
      classification_state TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      directive_authority TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      delivery_action TEXT NOT NULL,
      session_start_status INTEGER NOT NULL,
      session_start_ok INTEGER NOT NULL,
      delivery_status INTEGER NOT NULL,
      delivery_ok INTEGER NOT NULL,
      threshold_policy_json TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      directive_intent_json TEXT NOT NULL,
      carrier_admission_json TEXT NOT NULL,
      session_start_json TEXT NOT NULL,
      delivery_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

-- cloudflare_carrier_session_events
CREATE TABLE IF NOT EXISTS cloudflare_carrier_session_events (
      carrier_session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      site_id TEXT,
      operation_id TEXT,
      agent_id TEXT,
      event_kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      event_json TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      PRIMARY KEY (carrier_session_id, sequence)
    );
