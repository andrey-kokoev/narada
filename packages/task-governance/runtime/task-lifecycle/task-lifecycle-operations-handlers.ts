export const TASK_LIFECYCLE_OPERATIONS_TOOL_NAMES: any = Object.freeze([
  "task_lifecycle_submit_observation",
  "task_lifecycle_bridge_poll",
  "task_lifecycle_inbox_target",
  "task_lifecycle_set_routing",
  "task_lifecycle_test_mcp_tool",
  "task_lifecycle_run_tests"
]);

export function createTaskLifecycleOperationsHandlers(context: any) : any {
  const {
    store,
    siteRoot,
    jsonToolResult,
    stringField,
    numberField,
    booleanField,
    nullableStringField,
    enforceSessionIdentity,
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
    randomUUID,
  }: any = context;

  async function dispatchOperationsTool(canonicalName: any, args: any, dispatchContext: any = {}) : Promise<any> {
    switch (canonicalName) {
    case 'task_lifecycle_submit_observation': {
      const taskNumber: any = numberField(args, 'task_number');
      const artifactUri: any = stringField(args, 'artifact_uri');
      const content: any = args.content;
      if (!artifactUri) throw new Error('artifact_uri_required');
      const taskId: any = taskNumber ? store.getLifecycleByNumber(taskNumber)?.task_id : null;
      const artifactId: any = randomUUID();
      const admittedView: any = JSON.stringify(content ?? {});
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
      const dryRun: any = booleanField(args, 'dry_run') ?? false;
      const threshold: any = numberField(args, 'threshold');
      const limit: any = numberField(args, 'limit');
      const result: any = await pollInboxBridge(siteRoot, { dryRun, threshold, limit });
      return jsonToolResult(result, result.status === 'error');
    }

    case 'task_lifecycle_inbox_target': {
      const envelopeId: any = stringField(args, 'envelope_id');
      const dryRun: any = booleanField(args, 'dry_run') ?? false;
      const disposition: any = stringField(args, 'disposition') ?? 'materialize';
      const principal: any = stringField(args, 'principal') ?? stringField(args, 'agent_id') ?? 'task_lifecycle_mcp';
      const reason: any = stringField(args, 'reason');
      const result: any = await targetInboxEnvelope(siteRoot, { envelopeId, dryRun, disposition, principal, reason });
      return jsonToolResult(result, result.status === 'not_found');
    }

    case 'task_lifecycle_set_routing': {
      const taskNumber: any = numberField(args, 'task_number');
      const actorAgentId: any = stringField(args, 'actor_agent_id');
      const targetRole: any = nullableStringField(args, 'target_role');
      const preferredAgentId: any = nullableStringField(args, 'preferred_agent_id');
      const relativePriority: any = numberField(args, 'relative_priority');
      const reason: any = stringField(args, 'reason');
      if (!taskNumber) throw new Error('task_number_required');
      if (!actorAgentId) throw new Error('actor_agent_id_required');
      if (!reason) throw new Error('reason_required');
      if (targetRole === undefined && preferredAgentId === undefined && relativePriority === undefined) {
        throw new Error('routing_change_required');
      }
      enforceSessionIdentity(actorAgentId);

      const lifecycle: any = store.getLifecycleByNumber(taskNumber);
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

      const actorRoleResolution: any = resolveAgentRoleWithDiagnostics(store, siteRoot, actorAgentId);
      const actorRole: any = actorRoleResolution.role;
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
        const preferred: any = agentExistsWithRole(store, siteRoot, preferredAgentId);
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
      const now: any = new Date().toISOString();
      const previousRouting: any = getTaskRouting(store, lifecycle.task_id);
      const nextRouting: any = {
        target_role: targetRole !== undefined ? targetRole : previousRouting.target_role,
        preferred_agent_id: preferredAgentId !== undefined ? preferredAgentId : previousRouting.preferred_agent_id,
        relative_priority: relativePriority !== undefined ? relativePriority : previousRouting.relative_priority,
      };
      const changedFields: any = {};
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
        const eventId: any = `route-${randomUUID()}`;
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
          const taskFile: any = await findTaskFile(siteRoot, taskNumber);
          if (taskFile) {
            const { frontMatter, body }: any = await readTaskFile(taskFile.path);
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
            const shouldProjectPriority: any = nextRouting.relative_priority !== null
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
      const serverPath: any = stringField(args, 'server_path');
      const toolName: any = stringField(args, 'tool_name');
      const toolArgs: any = args.arguments ?? {};
      const timeoutSeconds: any = numberField(args, 'timeout_seconds');
      if (!serverPath) throw new Error('server_path_required');
      if (!toolName) throw new Error('tool_name_required');

      const result: any = await testMcpTool(siteRoot, serverPath, toolName, toolArgs, { timeoutSeconds });
      return jsonToolResult(result);
    }
    case 'task_lifecycle_run_tests': {
      const selector: any = stringField(args, 'selector') || 'task-lifecycle';
      const taskNumber: any = numberField(args, 'task_number');
      const agentId: any = stringField(args, 'agent_id');
      const timeoutSeconds: any = numberField(args, 'timeout_seconds') || 120;
      if (!agentId) throw new Error('agent_id_required');
      enforceSessionIdentity(agentId);
      const lifecycle: any = taskNumber ? store.getLifecycleByNumber(taskNumber) : null;
      if (taskNumber && !lifecycle) throw new Error(`task_not_found: ${taskNumber}`);
      const targets: any = testTargetsForSelector(selector);
      const results: any = [];
      for (const target of targets) {
        const result: any = await testMcpTool(siteRoot, 'tools/mcp-servers/test/test-mcp-server.ts', 'run_test', target, { timeoutSeconds });
        results.push(result);
      }
      const failed: any = results.filter((result: any) : any => result.status !== 'passed');
      const payload: any = {
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
        const artifactId: any = randomUUID();
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

      default:
        throw new Error(`task_mcp_refused: ${canonicalName}`);
    }
  }

  return Object.fromEntries(TASK_LIFECYCLE_OPERATIONS_TOOL_NAMES.map((name: any)  => [name, (args: any, dispatchContext: any)  => dispatchOperationsTool(name, args, dispatchContext)]));
}
