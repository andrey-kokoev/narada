import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { claimTaskService } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { findTaskFile, readTaskFile } from '@narada2/task-governance/task-governance';
import { checkTaskRoleEligibilityLocal, resolveAgentRoleWithDiagnostics } from './agent-role-resolution.mjs';
import { resolveTaskRolePolicy, roleMismatchSeverity } from './task-role-policy.mjs';
import { rosterOnClaim, withAuthoredRosterJsonPreserved } from './update-roster-agent.mjs';

const cwd = process.argv[2] || process.cwd();
const taskNumber = parseInt(process.argv[3], 10);
const agent = process.argv[4];
const reason = process.argv[5] || null;

if (isNaN(taskNumber) || !agent) {
  console.error('Usage: node task-claim.mjs <cwd> <task-number> <agent> [reason]');
  process.exit(1);
}

const store = openTaskLifecycleStore(cwd);

// Role eligibility: check agent role against task target_role
const lifecycle = store.getLifecycleByNumber(taskNumber);
let preferredAgentWarning = null;
let roleMismatchWarning = null;
let rolePolicy = null;

if (lifecycle) {
  const eligibility = checkTaskRoleEligibilityLocal({ store, siteRoot: cwd, taskId: lifecycle.task_id, taskNumber, agentId: agent });
  if (!eligibility.eligible) {
    console.error(JSON.stringify({
      status: 'error',
      error: 'role_mismatch',
      task_number: taskNumber,
      target_role: eligibility.targetRole,
      agent_role: eligibility.agentRole,
      role_resolution: eligibility.roleResolution,
      role_policy: eligibility.rolePolicy,
      message: eligibility.warning,
    }, null, 2));
    store.db.close();
    process.exit(1);
  }
  if (eligibility.preferredAgentWarning) {
    preferredAgentWarning = eligibility.preferredAgentWarning;
    console.warn(JSON.stringify(preferredAgentWarning, null, 2));
  } else if (eligibility.roleMismatchWarning) {
    roleMismatchWarning = eligibility.roleMismatchWarning;
    console.warn(JSON.stringify(roleMismatchWarning, null, 2));
  }
} else {
  // Fallback: read task file front matter directly when no DB lifecycle row exists
  const taskFile = await findTaskFile(cwd, taskNumber);
  if (taskFile) {
    const { frontMatter } = await readTaskFile(taskFile.path);
    const targetRole = frontMatter?.target_role || frontMatter?.preferred_role || null;
    const preferredAgentId = frontMatter?.preferred_agent_id || null;

    if (targetRole) {
      rolePolicy = resolveTaskRolePolicy({ siteRoot: cwd, taskSpec: frontMatter });
      const roleResolution = resolveAgentRoleWithDiagnostics(store, cwd, agent);
      const agentRole = roleResolution.role;
      if (agentRole !== targetRole && rolePolicy.role_enforcement === 'strict') {
        console.error(JSON.stringify({
          status: 'error',
          error: 'role_mismatch',
          task_number: taskNumber,
          target_role: targetRole,
          agent_role: agentRole,
          role_resolution: roleResolution,
          role_policy: rolePolicy,
          message: `Task targets role '${targetRole}'. Agent '${agent}' has role '${agentRole ?? 'null'}'.`,
        }, null, 2));
        store.db.close();
        process.exit(1);
      } else if (agentRole !== targetRole) {
        roleMismatchWarning = {
          kind: 'target_role_mismatch',
          severity: roleMismatchSeverity(rolePolicy),
          task_number: taskNumber,
          target_role: targetRole,
          agent_role: agentRole,
          agent_id: agent,
          role_enforcement: rolePolicy.role_enforcement,
          role_policy: rolePolicy,
          message: `Task targets role '${targetRole}'. Agent '${agent}' has role '${agentRole ?? 'null'}'.`,
        };
        console.warn(JSON.stringify(roleMismatchWarning, null, 2));
      }
    }

    if (preferredAgentId && preferredAgentId !== agent) {
      preferredAgentWarning = {
        warning: 'preferred_agent_mismatch',
        task_number: taskNumber,
        preferred_agent_id: preferredAgentId,
        claiming_agent: agent,
        message: `Task prefers agent '${preferredAgentId}'. Claiming as '${agent}'.`,
      };
      console.warn(JSON.stringify(preferredAgentWarning, null, 2));
    }
  }
}

store.db.close();

const result = await withAuthoredRosterJsonPreserved(cwd, async () => {
  const serviceResult = await claimTaskService({ cwd, taskNumber, agent, reason });
  const serviceOutput = serviceResult.result || serviceResult;
  if (serviceResult.exitCode === 0 || (serviceOutput && serviceOutput.status === 'claimed')) {
    rosterOnClaim(cwd, agent, taskNumber);
  }
  return serviceResult;
});
const output = result.result || result;

// Include preferred agent warning in successful output if present
if (preferredAgentWarning && output && typeof output === 'object') {
  output.preferred_agent_warning = preferredAgentWarning;
}
if (output && typeof output === 'object') {
  const warnings = [roleMismatchWarning, preferredAgentWarning].filter(Boolean);
  if (roleMismatchWarning) output.role_mismatch_warning = roleMismatchWarning;
  if (warnings.length) output.pre_claim_warnings = warnings;
  if (rolePolicy && !output.role_policy) output.role_policy = rolePolicy;
}

console.log(JSON.stringify(output, null, 2));
process.exit(result.exitCode || 0);
