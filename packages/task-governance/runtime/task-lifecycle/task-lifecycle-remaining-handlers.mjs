export function createTaskLifecycleRemainingHandlers(context) {
  const {
    NO_FILES_CHANGED_MARKER,
    store,
    siteRoot,
    jsonToolResult,
    stringField,
    numberField,
    booleanField,
    objectField,
    stringArrayField,
    nullableStringField,
    arrayOfStrings,
    enforceSessionIdentity,
    verifySessionIdentity,
    admitRosterIdentity,
    validateSelfCertificationPacket,
    validateRecoveryTruthfulnessPacket,
    validateSelfCertificationBody,
    validateRecoveryTruthfulnessBody,
    admitTaskEvidence,
    proveTaskCriteria,
    taskLifecycleDispositionCloseout,
    finishTaskService,
    closeTaskService,
    transitionLifecycleTask,
    unDeferLifecycleTask,
    reviewTaskService,
    withAuthoredRosterJsonPreserved,
    openTaskLifecycleStore,
    detectSameOperatorReview,
    detectSelfReview,
    validateTaskFinishRecoveryTruthfulness,
    finishGateExamples,
    buildStateAwareFinishBlockerRemediation,
    detectGitChangedFiles,
    buildTaskEvidencePreflight,
    buildPostCloseoutContinuation,
    emitCheckpoint,
    evaluatePostTransitionFollowups,
    pollInboxBridge,
    targetInboxEnvelope,
    roleExistsInRoster,
    agentExistsWithRole,
    resolveAgentRoleWithDiagnostics,
    ensureTaskRoutingTables,
    getTaskRouting,
    findTaskFile,
    readTaskFile,
    writeTaskProjection,
    testMcpTool,
    testTargetsForSelector,
    allocateTaskNumbers,
    slugify,
    todayYmd,
    renderTaskBodyFromSpec,
    writeFileSync,
    join,
    randomUUID,
    attachPayloadSource,
    normalizeRecurringAuthorityBasis,
    requireRecurringAuthorityActor,
    ensureRecurringTaskTables,
    insertRecurringDefinition,
    insertRecurringEvent,
    hydrateRecurringDefinition,
    getRecurringDefinition,
    listRecurringRuns,
    listRecurringDefinitions,
    updateRecurringDefinitionStatus,
    parseIsoOrNow,
    listDueRecurringDefinitions,
    recurringDueKey,
    createRecurringTaskInstance,
    insertRecurringRun,
  } = context;

async function dispatchRemainingDomainTool(canonicalName, args, dispatchContext = {}) {
  switch (canonicalName) {
    case 'task_lifecycle_roster_admit': {
      return jsonToolResult(admitRosterIdentity(args));
    }

    case 'task_lifecycle_self_certification_preflight': {
      const packet = objectField(args, 'self_certification');
      if (!packet) throw new Error('self_certification_required');
      const validation = validateSelfCertificationPacket({
        ...packet,
        surface: stringField(args, 'surface') ?? packet.surface,
        summary: stringField(args, 'summary') ?? packet.summary,
        body: stringField(args, 'body') ?? packet.body,
        actor_principal: stringField(args, 'actor_principal') ?? packet.actor_principal ?? packet.closer_principal ?? packet.reviewer_principal,
        terminal_correction_claim: booleanField(args, 'terminal_correction_claim') === true || packet.terminal_correction_claim === true,
      });
      return jsonToolResult({
        status: validation.ok ? 'allowed' : 'blocked',
        schema: 'narada.task.mcp.self_certification_preflight.v0',
        ok: validation.ok,
        close_blocked: !validation.ok,
        blockers: validation.errors,
        evaluation: validation.evaluation,
        required_fields: validation.evaluation.required_fields,
        allowed_pending_states: validation.evaluation.allowed_pending_states,
      }, !validation.ok);
    }

    case 'task_lifecycle_admit_evidence': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const selfCertification = objectField(args, 'self_certification');
      if (selfCertification) {
        const validation = validateSelfCertificationPacket({
          ...selfCertification,
          surface: 'evidence_admission',
          actor_principal: selfCertification.actor_principal ?? agentId,
        });
        if (!validation.ok) {
          return jsonToolResult({
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: validation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.evidence.self_certification_gate.v0',
            evaluation: validation.evaluation,
            remediation: 'Evidence admission may preserve same-subject evidence, but closure-sensitive architect-failure/deception/trust evidence must carry valid guard metadata and cannot assert terminal correction without independent review or operator acceptance.',
          }, true);
        }
      }
      const admission = await admitTaskEvidence({ cwd: siteRoot, taskNumber, admittedBy: agentId, methods: ['admission'] });
      return jsonToolResult({
        status: admission.blockers.length === 0 ? 'admitted' : 'rejected',
        task_number: taskNumber,
        admission_id: admission.result.admission_id,
        blockers: admission.blockers,
        verdict: admission.result.verdict,
        evidence_preflight: admission.blockers.length > 0 ? await buildTaskEvidencePreflight({ siteRoot, store, taskNumber }) : null,
        schema: 'narada.task.mcp.admit_evidence.v0',
      });
    }

    case 'task_lifecycle_prove_criteria': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      return jsonToolResult(await proveTaskCriteria({ siteRoot, store, taskNumber, agentId }));
    }

    case 'task_lifecycle_disposition_closeout': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const result = await taskLifecycleDispositionCloseout({
        siteRoot,
        store,
        taskNumber,
        agentId,
        envelopeId: stringField(args, 'envelope_id'),
        disposition: stringField(args, 'disposition'),
        summary: stringField(args, 'summary'),
        dryRun: booleanField(args, 'dry_run') === true,
        proveCriteria: booleanField(args, 'prove_criteria') === true,
        finish: booleanField(args, 'finish') === true,
        changedFiles: stringArrayField(args, 'changed_files'),
        noFilesChanged: booleanField(args, 'no_files_changed') === true,
      });
      return jsonToolResult(result, result.status === 'error');
    }

    case 'task_lifecycle_finish': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const summary = stringField(args, 'summary');
      const verdict = stringField(args, 'verdict');
      const reviewer = stringField(args, 'reviewer');
      const changedFiles = stringArrayField(args, 'changed_files');
      const noFilesChanged = booleanField(args, 'no_files_changed') === true;
      const recoveryTruthfulness = objectField(args, 'recovery_truthfulness');
      const selfCertification = objectField(args, 'self_certification');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      if (changedFiles && noFilesChanged) {
        return jsonToolResult({
          status: 'error',
          error: 'changed_files_conflicts_with_no_files_changed',
          schema: 'narada.task.mcp.finish.changed_file_evidence.v0',
          remediation: 'Provide changed_files for code/document edits, or no_files_changed=true for legitimate design-only/research tasks, but not both.',
          examples: finishGateExamples('changed_files'),
        }, true);
      }
      enforceSessionIdentity(agentId);
      const identityWarning = verifySessionIdentity(agentId);
      const truthfulnessGate = validateTaskFinishRecoveryTruthfulness({
        taskNumber,
        summary,
        changedFiles,
        noFilesChanged,
        recoveryTruthfulness,
      });
      if (!truthfulnessGate.ok) {
        const payload = {
          status: 'blocked',
          error: 'recovery_truthfulness_guard_failed',
          close_blocked: true,
          task_number: taskNumber,
          schema: 'narada.task.mcp.finish.recovery_truthfulness_gate.v0',
          close_blockers: truthfulnessGate.errors,
          evaluation: truthfulnessGate.evaluation,
          recovery_state_vocabulary: truthfulnessGate.evaluation.state_vocabulary,
          required_fields: truthfulnessGate.evaluation.required_fields,
          remediation: 'For serious-failure recovery finish/report claims, provide recovery_truthfulness with known_facts, inferences, uncertainty, changed, not_changed, remaining_work, evidence_limits, capa_open_status, and state. Use terminal_corrected only when corrective implementation is complete, no related CAPA/task/review remains open, and repository_durability names committed/pushed state; task creation alone is not correction.',
          examples: finishGateExamples('recovery_truthfulness'),
        };
        if (identityWarning) {
          payload.identity_warning = identityWarning;
        }
        return jsonToolResult(payload, true);
      }
      const lifecycle = store.getLifecycleByNumber(taskNumber);
      const testGate = lifecycle ? testResultArtifactGate(store, lifecycle.task_id) : { failed_test_artifacts: [], latest_passing_artifacts: [] };
      if (testGate.failed_test_artifacts.length > 0) {
        const payload = {
          status: 'blocked',
          schema: 'narada.task.mcp.finish.test_gate.v0',
          task_number: taskNumber,
          close_blocked: true,
          close_blockers: ['Task has current failed structured test evidence. Run the same selector again and produce a newer passing artifact before finish.'],
          failed_test_artifacts: testGate.failed_test_artifacts,
          latest_passing_artifacts: testGate.latest_passing_artifacts,
          remediation: 'Run task_lifecycle_run_tests with the same selector as each failed artifact. A newer passed artifact for that selector supersedes earlier failures.',
        };
        if (identityWarning) {
          payload.identity_warning = identityWarning;
        }
        return jsonToolResult(payload, true);
      }
      const taskFile = await findTaskFile(siteRoot, taskNumber);
      if (taskFile) {
        const { body } = await readTaskFile(taskFile.path);
        const selfCertificationValidation = selfCertification
          ? validateSelfCertificationPacket({
            ...selfCertification,
            actor_principal: selfCertification.actor_principal ?? selfCertification.closer_principal ?? agentId,
            summary,
            body,
            terminal_correction_claim: true,
            surface: 'task_lifecycle_finish',
          })
          : validateSelfCertificationBody({ body, summary, actor_principal: agentId });
        if (!selfCertificationValidation.ok) {
          const payload = {
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: selfCertificationValidation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.finish.self_certification_gate.v0',
            evaluation: selfCertificationValidation.evaluation,
            required_fields: selfCertificationValidation.evaluation.required_fields,
            allowed_pending_states: selfCertificationValidation.evaluation.allowed_pending_states,
            remediation: 'For architect-failure/deception/trust same-subject terminal correction, provide self_certification with target_category, subject_principal, requires_independent_review, misleading_completion_answer, allowed_pending_state, and either eligible independent review refs or explicit operator acceptance. Otherwise keep the work in a review-required/pending/blocker state.',
          };
          if (identityWarning) {
            payload.identity_warning = identityWarning;
          }
          return jsonToolResult(payload, true);
        }
        const followUpValidation = validateFollowUpLedger(body);
        if (!followUpValidation.ok) {
          const payload = {
            status: 'error',
            error: 'follow_up_ledger_required',
            close_blocked: true,
            close_blockers: followUpValidation.errors,
            task_number: taskNumber,
            next_command: `Update task ${taskNumber} with a ## Follow-Up Ledger linking each preserved follow-up to created #N, covered by #N, envelope env_<id>, CAPA <capa_id>, deferred: <reason>, or no follow-up needed: <rationale>.`,
            schema: 'narada.task.mcp.finish.follow_up_ledger_gate.v0',
            examples: finishGateExamples('follow_up_ledger'),
          };
          if (identityWarning) {
            payload.identity_warning = identityWarning;
          }
          return jsonToolResult(payload, true);
        }
        const recoveryTruthfulnessValidation = recoveryTruthfulness
          ? { ok: true }
          : validateRecoveryTruthfulnessBody({ body, summary, context: `task:${taskNumber}` });
        if (!recoveryTruthfulnessValidation.ok) {
          const payload = {
            status: 'error',
            error: 'recovery_truthfulness_guard_required',
            close_blocked: true,
            close_blockers: recoveryTruthfulnessValidation.errors,
            task_number: taskNumber,
            trigger_evaluation: recoveryTruthfulnessValidation.evaluation,
            next_command: `Update task ${taskNumber} with a ## Recovery Truthfulness section naming known facts, inferences, uncertainty, changed, not changed, remaining work, evidence limits, CAPA-open status, and state. For terminal_corrected, also name repository durability / commit-push state.`,
            schema: 'narada.task.mcp.finish.recovery_truthfulness_gate.v0',
            examples: finishGateExamples('recovery_truthfulness'),
          };
          if (identityWarning) {
            payload.identity_warning = identityWarning;
          }
          return jsonToolResult(payload, true);
        }
      }
      ensureStaticRosterAgentInSql(store, siteRoot, agentId);
      const autoDetectedChangedFiles = !changedFiles && !noFilesChanged ? detectGitChangedFiles(siteRoot) : [];
      const finishOptions = { cwd: siteRoot, taskNumber, agent: agentId, summary, verdict, close: true };
      if (reviewer) finishOptions.reviewer = reviewer;
      if (changedFiles) finishOptions.changedFiles = JSON.stringify(changedFiles);
      if (!changedFiles && autoDetectedChangedFiles.length > 0) finishOptions.changedFiles = JSON.stringify(autoDetectedChangedFiles);
      if (noFilesChanged) finishOptions.changedFiles = JSON.stringify([NO_FILES_CHANGED_MARKER]);
      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => finishTaskService(finishOptions));
      const payload = result.result || result;
      const isBlocked = payload.close_action === 'blocked';
      if (isBlocked) {
        payload.close_blocked = true;
        payload.evidence_preflight = await buildTaskEvidencePreflight({ siteRoot, store, taskNumber });
        if (!payload.evidence_reason && payload.close_blockers?.length > 0) {
          payload.evidence_reason = payload.close_blockers.join('; ');
        }
        const remediation = buildStateAwareFinishBlockerRemediation({ taskNumber, agentId, lifecycle, payload });
        payload.next_action = remediation.next_action;
        payload.next_command = remediation.next_command;
        payload.remediation = remediation.remediation;
      }
      payload.follow_up_policy = evaluatePostTransitionFollowups({
        event: { transition_kind: payload.close_action ?? 'finish', task_number: taskNumber, task_id: payload.task_id, agent_id: agentId },
        source_task: { task_number: taskNumber, task_id: payload.task_id },
        actor: { agent_id: agentId },
        result: payload,
        signals: { evidence_blocked: isBlocked },
      });
      if (!isBlocked && result.exitCode === 0) {
        payload.post_closeout_continuation = buildPostCloseoutContinuation({ agentId, result: payload });
      }
      if (!isBlocked && result.exitCode === 0) {
        try {
          const checkpointResult = await emitCheckpoint({
            cwd: siteRoot,
            agentId,
            sessionId: process.env.KIMI_SESSION_ID || process.env.SESSION_ID || 'unknown',
            taskNumber,
            taskId: payload.task_id || null,
            boundaryType: 'finish',
            summary,
          });
          payload.checkpoint_event = checkpointResult;
        } catch {
          // Non-blocking: checkpoint emission failure must not prevent finish
        }
      }
      if (identityWarning) {
        payload.identity_warning = identityWarning;
      }
      return jsonToolResult(payload, result.exitCode !== 0 || isBlocked);
    }

    case 'task_lifecycle_close': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const mode = stringField(args, 'mode') || 'agent_finish';
      const noContinuationNeeded = stringField(args, 'no_continuation_needed');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const selfCertification = objectField(args, 'self_certification');
      if (selfCertification) {
        const validation = validateSelfCertificationPacket({
          ...selfCertification,
          surface: 'task_lifecycle_close',
          actor_principal: selfCertification.actor_principal ?? selfCertification.closer_principal ?? agentId,
          terminal_correction_claim: true,
        });
        if (!validation.ok) {
          return jsonToolResult({
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: validation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.close.self_certification_gate.v0',
            evaluation: validation.evaluation,
            remediation: 'Task close for same-subject architect-failure/deception/trust material requires eligible independent review or explicit operator acceptance, otherwise use a pending/blocker state.',
          }, true);
        }
      }
      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => closeTaskService({ cwd: siteRoot, taskNumber, agent: agentId, mode, noContinuationNeeded }));
      const payload = result.result || result;
      const isBlocked = result.exitCode !== 0 || payload.close_action === 'blocked';
      if (!isBlocked) {
        payload.post_closeout_continuation = buildPostCloseoutContinuation({ agentId, result: payload });
      }
      return jsonToolResult(payload, isBlocked);
    }

    case 'task_lifecycle_defer': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const serviceResult = await transitionLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, toStatus: 'deferred', resultStatus: 'deferred' });
      return jsonToolResult(serviceResult, serviceResult.status === 'error');
    }

    case 'task_lifecycle_un_defer': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      const authorityBasis = objectField(args, 'authority_basis');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const serviceResult = await unDeferLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, authorityBasis });
      return jsonToolResult(serviceResult, serviceResult.status === 'error');
    }

    case 'task_lifecycle_reopen': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const reason = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const serviceResult = await transitionLifecycleTask({ siteRoot, store, taskNumber, agentId, reason, toStatus: 'opened', resultStatus: 'reopened' });
      return jsonToolResult(serviceResult, serviceResult.status === 'error');
    }

    case 'task_lifecycle_review': {
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const verdict = stringField(args, 'verdict');
      let findings = args.findings;
      if (Array.isArray(findings)) {
        findings = JSON.stringify(findings);
      }
      if (!taskNumber) throw new Error('task_number_required');
      if (!agentId) throw new Error('agent_id_required');
      if (!verdict) throw new Error('verdict_required');
      enforceSessionIdentity(agentId);
      const identityWarning = verifySessionIdentity(agentId);
      const selfCertification = objectField(args, 'self_certification');
      if (selfCertification) {
        const validation = validateSelfCertificationPacket({
          ...selfCertification,
          surface: 'task_lifecycle_review',
          actor_principal: selfCertification.actor_principal ?? selfCertification.reviewer_principal ?? agentId,
          terminal_correction_claim: ['accepted', 'accepted_with_notes'].includes(verdict),
        });
        if (!validation.ok) {
          const payload = {
            status: 'blocked',
            error: 'self_certification_guard_failed',
            close_blocked: true,
            close_blockers: validation.errors,
            task_number: taskNumber,
            schema: 'narada.task.mcp.review.self_certification_gate.v0',
            evaluation: validation.evaluation,
            remediation: 'Same-subject review cannot satisfy final independent review for architect-failure/deception/trust material without eligible independent-review metadata or explicit operator acceptance.',
          };
          if (identityWarning) payload.identity_warning = identityWarning;
          return jsonToolResult(payload, true);
        }
      }

      // Same-operator and self-review detection
      let structuralReviewInfo = null;
      try {
        const store = openTaskLifecycleStore(siteRoot);
        try {
          structuralReviewInfo = detectSameOperatorReview(store, agentId, taskNumber);
          if (!structuralReviewInfo?.sameOperator) {
            structuralReviewInfo = detectSelfReview(store, agentId, taskNumber);
          }
        } finally {
          store.db.close();
        }
      } catch {
        // Best-effort
      }

      const isStructuralReview = structuralReviewInfo?.sameOperator || structuralReviewInfo?.selfReview;
      if (isStructuralReview && !args.single_operator_review) {
        return jsonToolResult({
          status: 'error',
          error: 'single_operator_review_blocked',
          message: structuralReviewInfo.warning,
          hint: 'Pass single_operator_review: true to allow single-operator review with annotation recorded.',
        }, true);
      }

      // Prepend annotation when single-operator review is explicitly requested
      let parsedFindings = null;
      if (findings) {
        try {
          parsedFindings = JSON.parse(findings);
          if (!Array.isArray(parsedFindings)) parsedFindings = null;
        } catch {
          parsedFindings = null;
        }
      }
      if (isStructuralReview && args.single_operator_review) {
        const annotation = {
          severity: 'note',
          description: `single_operator_review: ${structuralReviewInfo.warning} This review is annotated as single-operator review (kind: ${structuralReviewInfo.kind || 'same_operator'}).`,
          location: 'review_authority',
        };
        if (Array.isArray(parsedFindings)) {
          parsedFindings.unshift(annotation);
        } else {
          parsedFindings = [annotation];
        }
        findings = JSON.stringify(parsedFindings);
      }

      const result = await withAuthoredRosterJsonPreserved(siteRoot, () => reviewTaskService({ cwd: siteRoot, taskNumber, agent: agentId, verdict, findings }));
      const payload = result.result || result;
      const isBlocked = payload.evidence_blocked === true || payload.close_action === 'blocked';
      if (isBlocked) {
        payload.close_blocked = true;
      }
      if (isStructuralReview) {
        payload.single_operator_review = true;
        payload.single_operator_annotation = structuralReviewInfo.warning;
        payload.single_operator_kind = structuralReviewInfo.kind || 'same_operator';
      }
      if (identityWarning) {
        payload.identity_warning = identityWarning;
      }
      return jsonToolResult(payload, result.exitCode !== 0 || isBlocked);
    }

    case 'task_lifecycle_submit_observation': {
      const taskNumber = numberField(args, 'task_number');
      const artifactUri = stringField(args, 'artifact_uri');
      const content = args.content;
      if (!artifactUri) throw new Error('artifact_uri_required');
      const taskId = taskNumber ? store.getLifecycleByNumber(taskNumber)?.task_id : null;
      const artifactId = randomUUID();
      const admittedView = JSON.stringify(content ?? {});
      store.upsertObservationArtifact({
        artifact_id: artifactId,
        artifact_type: 'observation',
        source_operator: stringField(args, 'source_operator') ?? 'mcp_agent',
        task_id: taskId ?? null,
        task_number: taskNumber ?? null,
        agent_id: stringField(args, 'agent_id') ?? null,
        artifact_uri: artifactUri,
        digest: artifactId.slice(0, 16),
        admitted_view_json: admittedView,
        created_at: new Date().toISOString(),
      });
      return jsonToolResult({ status: 'submitted', artifact_id: artifactId, artifact_uri: artifactUri });
    }

    case 'task_lifecycle_bridge_poll': {
      const dryRun = booleanField(args, 'dry_run') ?? false;
      const threshold = numberField(args, 'threshold');
      const limit = numberField(args, 'limit');
      const result = await pollInboxBridge(siteRoot, { dryRun, threshold, limit });
      return jsonToolResult(result, result.status === 'error');
    }

    case 'task_lifecycle_inbox_target': {
      const envelopeId = stringField(args, 'envelope_id');
      const dryRun = booleanField(args, 'dry_run') ?? false;
      const disposition = stringField(args, 'disposition') ?? 'materialize';
      const principal = stringField(args, 'principal') ?? stringField(args, 'agent_id') ?? 'task_lifecycle_mcp';
      const reason = stringField(args, 'reason');
      const result = await targetInboxEnvelope(siteRoot, { envelopeId, dryRun, disposition, principal, reason });
      return jsonToolResult(result, result.status === 'not_found');
    }

    case 'task_lifecycle_set_routing': {
      const taskNumber = numberField(args, 'task_number');
      const actorAgentId = stringField(args, 'actor_agent_id');
      const targetRole = nullableStringField(args, 'target_role');
      const preferredAgentId = nullableStringField(args, 'preferred_agent_id');
      const relativePriority = numberField(args, 'relative_priority');
      const reason = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!reason) throw new Error('reason_required');
      if (targetRole === undefined && preferredAgentId === undefined && relativePriority === undefined) {
        throw new Error('routing_change_required');
      }
      enforceSessionIdentity(actorAgentId);

      const lifecycle = store.getLifecycleByNumber(taskNumber);
      if (!lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      if (lifecycle.status !== 'opened') {
        return jsonToolResult({
          status: 'blocked',
          reason: 'task_not_opened',
          task_number: taskNumber,
          current_status: lifecycle.status,
          message: 'Routing is only allowed for opened tasks; claim/finish ownership gates remain separate.',
        }, true);
      }

      const actorRoleResolution = resolveAgentRoleWithDiagnostics(store, siteRoot, actorAgentId);
      const actorRole = actorRoleResolution.role;
      if (!['architect', 'operator'].includes(actorRole)) {
        return jsonToolResult({
          status: 'blocked',
          reason: 'routing_actor_not_authorized',
          actor_agent_id: actorAgentId,
          actor_role: actorRole,
          role_resolution: actorRoleResolution,
          message: 'Only architect/operator agents can route tasks through this tool.',
        }, true);
      }

      if (targetRole && !roleExistsInRoster(store, siteRoot, targetRole)) {
        return jsonToolResult({ status: 'blocked', reason: 'target_role_not_in_roster', target_role: targetRole }, true);
      }

      if (preferredAgentId) {
        const preferred = agentExistsWithRole(store, siteRoot, preferredAgentId);
        if (!preferred.exists) {
          return jsonToolResult({ status: 'blocked', reason: 'preferred_agent_not_in_roster', preferred_agent_id: preferredAgentId, role_resolution: preferred.role_resolution }, true);
        }
        if (targetRole && preferred.role !== targetRole) {
          return jsonToolResult({
            status: 'blocked',
            reason: 'preferred_agent_role_mismatch',
            preferred_agent_id: preferredAgentId,
            preferred_agent_role: preferred.role,
            target_role: targetRole,
            role_resolution: preferred.role_resolution,
          }, true);
        }
      }

      ensureTaskRoutingTables(store);
      const now = new Date().toISOString();
      const previousRouting = getTaskRouting(store, lifecycle.task_id);
      const nextRouting = {
        target_role: targetRole !== undefined ? targetRole : previousRouting.target_role,
        preferred_agent_id: preferredAgentId !== undefined ? preferredAgentId : previousRouting.preferred_agent_id,
        relative_priority: relativePriority !== undefined ? relativePriority : previousRouting.relative_priority,
      };
      const changedFields = {};
      for (const field of ['target_role', 'preferred_agent_id', 'relative_priority']) {
        if (previousRouting[field] !== nextRouting[field]) {
          changedFields[field] = { before: previousRouting[field], after: nextRouting[field] };
        }
      }
      if (Object.keys(changedFields).length === 0) {
        return jsonToolResult({
          schema: 'narada.task.routing.v0',
          status: 'unchanged',
          task_number: taskNumber,
          task_id: lifecycle.task_id,
          routing: nextRouting,
        });
      }

      store.db.exec('BEGIN');
      try {
        store.db.prepare(`
          INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            preferred_role = excluded.preferred_role,
            target_role = excluded.target_role,
            preferred_agent_id = excluded.preferred_agent_id,
            updated_at = excluded.updated_at
        `).run(lifecycle.task_id, nextRouting.target_role, nextRouting.target_role, nextRouting.preferred_agent_id, now);
        store.db.prepare(`
          UPDATE task_lifecycle
          SET relative_priority = ?, priority_reason = ?, updated_at = ?
          WHERE task_id = ?
        `).run(nextRouting.relative_priority, reason, now, lifecycle.task_id);
        const eventId = `route-${randomUUID()}`;
        store.db.prepare(`
          INSERT INTO task_routing_events (
            event_id, task_id, task_number, actor_agent_id, actor_role,
            reason, changed_fields_json, previous_routing_json, new_routing_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          eventId,
          lifecycle.task_id,
          taskNumber,
          actorAgentId,
          actorRole,
          reason,
          JSON.stringify(changedFields),
          JSON.stringify(previousRouting),
          JSON.stringify(nextRouting),
          now,
        );
        store.db.exec('COMMIT');

        try {
          const taskFile = await findTaskFile(siteRoot, taskNumber);
          if (taskFile) {
            const { frontMatter, body } = await readTaskFile(taskFile.path);
            if (nextRouting.target_role) {
              frontMatter.target_role = nextRouting.target_role;
              frontMatter.preferred_role = nextRouting.target_role;
            } else {
              delete frontMatter.target_role;
              delete frontMatter.preferred_role;
            }
            if (nextRouting.preferred_agent_id) {
              frontMatter.preferred_agent_id = nextRouting.preferred_agent_id;
            } else {
              delete frontMatter.preferred_agent_id;
            }
            const shouldProjectPriority = nextRouting.relative_priority !== null
              && nextRouting.relative_priority !== undefined
              && (
                relativePriority !== undefined
                || Object.prototype.hasOwnProperty.call(frontMatter, 'relative_priority')
                || nextRouting.relative_priority !== 0
              );
            if (shouldProjectPriority) {
              frontMatter.relative_priority = nextRouting.relative_priority;
            } else {
              delete frontMatter.relative_priority;
            }
            await writeTaskProjection(taskFile.path, frontMatter, body);
          }
        } catch {
          // Projection write is compatibility-only; SQLite routing state is authoritative.
        }

        return jsonToolResult({
          schema: 'narada.task.routing.v0',
          status: 'routed',
          task_number: taskNumber,
          task_id: lifecycle.task_id,
          actor_agent_id: actorAgentId,
          actor_role: actorRole,
          reason,
          changed_fields: changedFields,
          routing: nextRouting,
          audit_event_id: eventId,
        });
      } catch (error) {
        try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
        throw error;
      }
    }

    case 'task_lifecycle_test_mcp_tool': {
      const serverPath = stringField(args, 'server_path');
      const toolName = stringField(args, 'tool_name');
      const toolArgs = args.arguments ?? {};
      const timeoutSeconds = numberField(args, 'timeout_seconds');
      if (!serverPath) throw new Error('server_path_required');
      if (!toolName) throw new Error('tool_name_required');

      const result = await testMcpTool(siteRoot, serverPath, toolName, toolArgs, { timeoutSeconds });
      return jsonToolResult(result);
    }
    case 'task_lifecycle_run_tests': {
      const selector = stringField(args, 'selector') || 'task-lifecycle';
      const taskNumber = numberField(args, 'task_number');
      const agentId = stringField(args, 'agent_id');
      const timeoutSeconds = numberField(args, 'timeout_seconds') || 120;
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const lifecycle = taskNumber ? store.getLifecycleByNumber(taskNumber) : null;
      if (taskNumber && !lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      const targets = testTargetsForSelector(selector);
      const results = [];
      for (const target of targets) {
        const result = await testMcpTool(siteRoot, 'tools/mcp-servers/test/test-mcp-server.mjs', 'run_test', target, { timeoutSeconds });
        results.push(result);
      }
      const failed = results.filter((result) => result.status !== 'passed');
      const payload = {
        schema: 'narada.task_lifecycle.run_tests.v0',
        status: failed.length === 0 ? 'passed' : 'failed',
        selector,
        task_number: taskNumber ?? null,
        task_id: lifecycle?.task_id ?? null,
        agent_id: agentId,
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        results,
      };
      if (taskNumber) {
        const artifactId = randomUUID();
        store.upsertObservationArtifact({
          artifact_id: artifactId,
          artifact_type: 'test_result',
          source_operator: agentId,
          task_id: lifecycle.task_id,
          task_number: taskNumber,
          agent_id: agentId,
          artifact_uri: `task://${taskNumber}/test-results/${artifactId}`,
          digest: artifactId.slice(0, 16),
          admitted_view_json: JSON.stringify(payload),
          created_at: new Date().toISOString(),
        });
        payload.artifact_id = artifactId;
      }
      return jsonToolResult(payload, failed.length > 0);
    }

    case 'task_lifecycle_create': {
      const payloadSource = dispatchContext.payloadSource ?? null;
      const title = stringField(args, 'title');
      if (!title) throw new Error('title_required');
      const goal = stringField(args, 'goal') || title;
      const context = stringField(args, 'context') || null;
      const requiredWork = stringField(args, 'required_work') || '1. TBD';
      const nonGoals = stringField(args, 'non_goals') || null;
      const preferredRole = stringField(args, 'preferred_role') || null;
      const targetRole = stringField(args, 'target_role') || null;
      const acceptanceCriteria = Array.isArray(args.acceptance_criteria) && args.acceptance_criteria.length > 0
        ? args.acceptance_criteria
        : ['TBD'];

      const taskNumber = (await allocateTaskNumbers(siteRoot, 1))[0];
      const slug = slugify(title);
      const taskId = `${todayYmd()}-${taskNumber}-${slug}`;
      const tasksDir = join(siteRoot, '.ai', 'do-not-open', 'tasks');
      const filePath = join(tasksDir, `${taskId}.md`);

      const body = renderTaskBodyFromSpec({
        spec: {
          title,
          goal,
          context,
          required_work: requiredWork,
          non_goals: nonGoals,
          acceptance_criteria: acceptanceCriteria,
        },
        executionNotes: null,
        verification: null,
      });

      const frontMatterLines = [
        '---',
        `number: ${taskNumber}`,
        `governed_by: ${preferredRole || 'unknown'}`,
        'status: opened',
      ];
      if (preferredRole) {
        frontMatterLines.push(`preferred_role: ${preferredRole}`);
      }
      if (targetRole) {
        frontMatterLines.push(`target_role: ${targetRole}`);
      }
      if (payloadSource?.ref) {
        frontMatterLines.push(`creation_payload_ref: ${payloadSource.ref}`);
      }
      if (payloadSource?.sha256) {
        frontMatterLines.push(`creation_payload_sha256: ${payloadSource.sha256}`);
      }
      frontMatterLines.push('---');

      const fileContent = `${frontMatterLines.join('\n')}\n${body}`;
      writeFileSync(filePath, fileContent, 'utf8');

      const now = new Date().toISOString();
      store.upsertLifecycle({
        task_id: taskId,
        task_number: taskNumber,
        status: 'opened',
        governed_by: preferredRole || null,
        closed_at: null,
        closed_by: null,
        reopened_at: null,
        reopened_by: null,
        continuation_packet_json: null,
        updated_at: now,
      });
      store.upsertTaskSpec({
        task_id: taskId,
        task_number: taskNumber,
        title,
        chapter_markdown: null,
        goal_markdown: goal,
        context_markdown: context,
        required_work_markdown: requiredWork,
        non_goals_markdown: nonGoals,
        acceptance_criteria_json: JSON.stringify(acceptanceCriteria),
        dependencies_json: '[]',
        updated_at: now,
      });
      ensureTaskRoutingTables(store);
      if (preferredRole || targetRole) {
        store.db.prepare(`
          INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(task_id) DO UPDATE SET
            preferred_role = excluded.preferred_role,
            target_role = excluded.target_role,
            preferred_agent_id = excluded.preferred_agent_id,
            updated_at = excluded.updated_at
        `).run(taskId, preferredRole, targetRole || preferredRole, null, now);
      }

      return jsonToolResult(attachPayloadSource({
        schema: 'narada.task.create.v0',
        status: 'created',
        task_number: taskNumber,
        task_id: taskId,
        file_path: filePath,
        title,
        target_role: targetRole || preferredRole,
        preferred_role: preferredRole,
        payload_ref: payloadSource?.ref ?? null,
        payload_sha256: payloadSource?.sha256 ?? null,
      }, payloadSource));
    }

    case 'task_lifecycle_recurring_create': {
      const title = stringField(args, 'title');
      const actorAgentId = stringField(args, 'actor_agent_id');
      const authorityBasis = normalizeRecurringAuthorityBasis(args.authority_basis);
      if (!title) throw new Error('title_required');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!authorityBasis) throw new Error('valid_authority_basis_required');
      enforceSessionIdentity(actorAgentId);
      const actorRole = requireRecurringAuthorityActor({ store, siteRoot, actorAgentId });
      const initialStatus = stringField(args, 'initial_status') || 'active';
      if (!['draft', 'active'].includes(initialStatus)) throw new Error('invalid_initial_status');
      const targetRole = stringField(args, 'target_role') || null;
      const preferredRole = stringField(args, 'preferred_role') || targetRole;
      if (targetRole && !roleExistsInRoster(store, siteRoot, targetRole)) {
        return jsonToolResult({ status: 'blocked', reason: 'target_role_not_in_roster', target_role: targetRole }, true);
      }
      if (preferredRole && !roleExistsInRoster(store, siteRoot, preferredRole)) {
        return jsonToolResult({ status: 'blocked', reason: 'preferred_role_not_in_roster', preferred_role: preferredRole }, true);
      }
      const triggerMode = stringField(args, 'trigger_mode') || 'manual';
      if (!['manual', 'schedule'].includes(triggerMode)) throw new Error('invalid_trigger_mode');
      const scheduleKind = stringField(args, 'schedule_kind') || (triggerMode === 'schedule' ? 'daily' : null);
      if (triggerMode === 'schedule' && scheduleKind !== 'daily') throw new Error('unsupported_schedule_kind');
      if (triggerMode === 'manual' && scheduleKind) throw new Error('schedule_kind_requires_schedule_trigger_mode');
      const scheduleTimezone = stringField(args, 'schedule_timezone') || (triggerMode === 'schedule' ? 'UTC' : null);
      if (scheduleTimezone && scheduleTimezone !== 'UTC') throw new Error('unsupported_schedule_timezone');
      const recurrenceId = `rtask_${randomUUID()}`;
      const now = new Date().toISOString();
      const definition = {
        recurrence_id: recurrenceId,
        title,
        status: initialStatus,
        trigger_mode: triggerMode,
        trigger_description: stringField(args, 'trigger_description') || null,
        schedule_kind: scheduleKind,
        schedule_interval: triggerMode === 'schedule' ? 1 : null,
        schedule_timezone: scheduleTimezone,
        last_due_key: null,
        last_auto_triggered_at: null,
        target_role: targetRole,
        preferred_role: preferredRole,
        goal_markdown: stringField(args, 'goal') || title,
        context_markdown: stringField(args, 'context') || null,
        required_work_markdown: stringField(args, 'required_work') || '1. Execute the recurring task instance.',
        non_goals_markdown: stringField(args, 'non_goals') || null,
        acceptance_criteria_json: JSON.stringify(arrayOfStrings(args.acceptance_criteria, ['Complete the recurring task instance with verification evidence.'])),
        evidence_requirements_json: JSON.stringify(arrayOfStrings(args.evidence_requirements, [])),
        created_by: actorAgentId,
        created_at: now,
        updated_at: now,
        suspended_at: null,
        retired_at: null,
      };
      ensureRecurringTaskTables(store);
      store.db.exec('BEGIN');
      try {
        insertRecurringDefinition(store, definition);
        insertRecurringEvent(store, {
          recurrenceId,
          eventType: 'created',
          stateAfter: initialStatus,
          actorAgentId,
          authorityBasis,
          event: { actor_role: actorRole, title },
          now,
        });
        store.db.exec('COMMIT');
      } catch (error) {
        try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
        throw error;
      }
      return jsonToolResult({
        schema: 'narada.task.recurring.definition.v0',
        status: 'created',
        recurrence_id: recurrenceId,
        definition: hydrateRecurringDefinition(definition),
      });
    }

    case 'task_lifecycle_recurring_show': {
      const recurrenceId = stringField(args, 'recurrence_id');
      if (!recurrenceId) throw new Error('recurrence_id_required');
      const definition = getRecurringDefinition(store, recurrenceId);
      if (!definition) return jsonToolResult({ status: 'not_found', recurrence_id: recurrenceId }, true);
      const includeRuns = booleanField(args, 'include_runs') ?? true;
      return jsonToolResult({
        schema: 'narada.task.recurring.show.v0',
        status: 'ok',
        definition,
        runs: includeRuns ? listRecurringRuns(store, recurrenceId, 20) : [],
      });
    }

    case 'task_lifecycle_recurring_list': {
      const status = stringField(args, 'status');
      const limit = numberField(args, 'limit') ?? 50;
      return jsonToolResult({
        schema: 'narada.task.recurring.list.v0',
        status: 'ok',
        definitions: listRecurringDefinitions(store, { status, limit }),
      });
    }

    case 'task_lifecycle_recurring_suspend': {
      return jsonToolResult(updateRecurringDefinitionStatus({
        store,
        siteRoot,
        recurrenceId: stringField(args, 'recurrence_id'),
        actorAgentId: stringField(args, 'actor_agent_id'),
        authorityBasis: normalizeRecurringAuthorityBasis(args.authority_basis),
        nextStatus: 'suspended',
        eventType: 'suspended',
        reason: stringField(args, 'reason'),
      }));
    }

    case 'task_lifecycle_recurring_retire': {
      return jsonToolResult(updateRecurringDefinitionStatus({
        store,
        siteRoot,
        recurrenceId: stringField(args, 'recurrence_id'),
        actorAgentId: stringField(args, 'actor_agent_id'),
        authorityBasis: normalizeRecurringAuthorityBasis(args.authority_basis),
        nextStatus: 'retired',
        eventType: 'retired',
        reason: stringField(args, 'reason'),
      }));
    }

    case 'task_lifecycle_recurring_trigger': {
      const recurrenceId = stringField(args, 'recurrence_id');
      const actorAgentId = stringField(args, 'actor_agent_id');
      const authorityBasis = normalizeRecurringAuthorityBasis(args.authority_basis);
      const runReason = stringField(args, 'run_reason');
      if (!recurrenceId) throw new Error('recurrence_id_required');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!authorityBasis) throw new Error('valid_authority_basis_required');
      if (!runReason) throw new Error('run_reason_required');
      enforceSessionIdentity(actorAgentId);
      const actorRole = requireRecurringAuthorityActor({ store, siteRoot, actorAgentId });
      const definition = getRecurringDefinition(store, recurrenceId);
      if (!definition) return jsonToolResult({ status: 'not_found', recurrence_id: recurrenceId }, true);
      if (definition.status !== 'active') {
        return jsonToolResult({
          status: 'blocked',
          reason: 'recurrence_not_active',
          recurrence_id: recurrenceId,
          current_status: definition.status,
        }, true);
      }
      const now = new Date().toISOString();
      const taskNumber = (await allocateTaskNumbers(siteRoot, 1))[0];
      const taskTitle = `${definition.title} (${now.slice(0, 10)})`;
      const taskId = `${todayYmd()}-${taskNumber}-${slugify(taskTitle)}`;
      const tasksDir = join(siteRoot, '.ai', 'do-not-open', 'tasks');
      const filePath = join(tasksDir, `${taskId}.md`);
      const evidenceRequirements = definition.evidence_requirements;
      const recurrenceContext = [
        definition.context_markdown,
        '',
        `Recurring task definition: ${recurrenceId}`,
        `Manual run reason: ${runReason}`,
        evidenceRequirements.length > 0 ? `Evidence requirements: ${evidenceRequirements.join('; ')}` : null,
      ].filter(Boolean).join('\n');
      const body = renderTaskBodyFromSpec({
        spec: {
          title: taskTitle,
          goal: definition.goal_markdown || definition.title,
          context: recurrenceContext,
          required_work: definition.required_work_markdown || 'Execute the recurring task instance.',
          non_goals: definition.non_goals_markdown,
          acceptance_criteria: definition.acceptance_criteria,
        },
        executionNotes: null,
        verification: null,
      });
      const frontMatterLines = [
        '---',
        `number: ${taskNumber}`,
        `governed_by: ${definition.preferred_role || definition.target_role || 'unknown'}`,
        'status: opened',
        `recurring_task_id: ${recurrenceId}`,
      ];
      if (definition.preferred_role) frontMatterLines.push(`preferred_role: ${definition.preferred_role}`);
      if (definition.target_role) frontMatterLines.push(`target_role: ${definition.target_role}`);
      frontMatterLines.push('---');
      const runId = `rtrun_${randomUUID()}`;
      store.db.exec('BEGIN');
      try {
        writeFileSync(filePath, `${frontMatterLines.join('\n')}\n${body}`, 'utf8');
        store.upsertLifecycle({
          task_id: taskId,
          task_number: taskNumber,
          status: 'opened',
          governed_by: definition.preferred_role || definition.target_role || null,
          closed_at: null,
          closed_by: null,
          reopened_at: null,
          reopened_by: null,
          continuation_packet_json: null,
          updated_at: now,
        });
        store.upsertTaskSpec({
          task_id: taskId,
          task_number: taskNumber,
          title: taskTitle,
          chapter_markdown: null,
          goal_markdown: definition.goal_markdown || definition.title,
          context_markdown: recurrenceContext,
          required_work_markdown: definition.required_work_markdown || 'Execute the recurring task instance.',
          non_goals_markdown: definition.non_goals_markdown,
          acceptance_criteria_json: JSON.stringify(definition.acceptance_criteria),
          dependencies_json: '[]',
          updated_at: now,
        });
        ensureTaskRoutingTables(store);
        if (definition.preferred_role || definition.target_role) {
          store.db.prepare(`
            INSERT INTO narada_andrey_task_role_preferences (task_id, preferred_role, target_role, preferred_agent_id, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(task_id) DO UPDATE SET
              preferred_role = excluded.preferred_role,
              target_role = excluded.target_role,
              preferred_agent_id = excluded.preferred_agent_id,
              updated_at = excluded.updated_at
          `).run(taskId, definition.preferred_role, definition.target_role || definition.preferred_role, null, now);
        }
        insertRecurringRun(store, {
          run_id: runId,
          recurrence_id: recurrenceId,
          task_id: taskId,
          task_number: taskNumber,
          trigger_mode: 'manual',
          run_reason: runReason,
          actor_agent_id: actorAgentId,
          authority_basis_json: JSON.stringify(authorityBasis),
          created_at: now,
        });
        insertRecurringEvent(store, {
          recurrenceId,
          eventType: 'manual_triggered',
          stateAfter: definition.status,
          actorAgentId,
          authorityBasis,
          event: { actor_role: actorRole, run_id: runId, task_id: taskId, task_number: taskNumber, run_reason: runReason },
          now,
        });
        store.db.exec('COMMIT');
      } catch (error) {
        try { store.db.exec('ROLLBACK'); } catch { /* ignore rollback failure */ }
        throw error;
      }
      return jsonToolResult({
        schema: 'narada.task.recurring.trigger.v0',
        status: 'triggered',
        recurrence_id: recurrenceId,
        run_id: runId,
        task_number: taskNumber,
        task_id: taskId,
        file_path: filePath,
      });
    }

    case 'task_lifecycle_recurring_run_due': {
      const actorAgentId = stringField(args, 'actor_agent_id');
      const authorityBasis = normalizeRecurringAuthorityBasis(args.authority_basis);
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!authorityBasis) throw new Error('valid_authority_basis_required');
      enforceSessionIdentity(actorAgentId);
      const actorRole = requireRecurringAuthorityActor({ store, siteRoot, actorAgentId });
      const now = parseIsoOrNow(stringField(args, 'current_time'));
      const limit = Math.max(1, Math.min(numberField(args, 'limit') ?? 20, 100));
      const dueDefinitions = listDueRecurringDefinitions(store, { now, limit });
      const created = [];
      const skipped = [];
      for (const definition of dueDefinitions) {
        const dueKey = recurringDueKey(definition, now);
        if (!dueKey || definition.last_due_key === dueKey) {
          skipped.push({ recurrence_id: definition.recurrence_id, reason: 'not_due_or_already_created', due_key: dueKey });
          continue;
        }
        const result = await createRecurringTaskInstance({
          store,
          siteRoot,
          definition,
          actorAgentId,
          actorRole,
          authorityBasis,
          triggerMode: 'schedule',
          runReason: `Scheduled daily run for ${dueKey}`,
          eventType: 'scheduled_triggered',
          now,
          dueKey,
        });
        created.push(result);
      }
      return jsonToolResult({
        schema: 'narada.task.recurring.run_due.v0',
        status: 'ok',
        trigger_mode: 'schedule',
        schedule_kind: 'daily',
        evaluated_at: now.toISOString(),
        created_count: created.length,
        skipped_count: skipped.length,
        created,
        skipped,
      });
    }

    case 'task_lifecycle_recurring_runs': {
      const recurrenceId = stringField(args, 'recurrence_id');
      if (!recurrenceId) throw new Error('recurrence_id_required');
      const limit = numberField(args, 'limit') ?? 20;
      return jsonToolResult({
        schema: 'narada.task.recurring.runs.v0',
        status: 'ok',
        recurrence_id: recurrenceId,
        runs: listRecurringRuns(store, recurrenceId, limit),
      });
    }

    default:
      throw new Error(`task_mcp_refused: ${canonicalName}`);
  }
}

  return dispatchRemainingDomainTool;
}
