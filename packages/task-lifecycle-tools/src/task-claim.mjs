import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { claimTaskService } from '@narada2/task-governance/task-assignment-lifecycle-service';
import { findTaskFile, readTaskFile } from '@narada2/task-governance/task-governance';
import { checkTaskRoleEligibilityLocal, resolveAgentRoleWithDiagnostics } from './agent-role-resolution.mjs';
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
      message: eligibility.warning,
    }, null, 2));
    store.db.close();
    process.exit(1);
  }
  if (eligibility.warning) {
    preferredAgentWarning = {
      warning: 'preferred_agent_mismatch',
      task_number: taskNumber,
      preferred_agent_id: eligibility.preferredAgentId,
      claiming_agent: agent,
      message: eligibility.warning,
    };
    console.warn(JSON.stringify(preferredAgentWarning, null, 2));
  }
} else {
  // Fallback: read task file front matter directly when no DB lifecycle row exists
  const taskFile = await findTaskFile(cwd, taskNumber);
  if (taskFile) {
    const { frontMatter } = await readTaskFile(taskFile.path);
    const targetRole = frontMatter?.target_role || frontMatter?.preferred_role || null;
    const preferredAgentId = frontMatter?.preferred_agent_id || null;

    if (targetRole) {
      const roleResolution = resolveAgentRoleWithDiagnostics(store, cwd, agent);
      const agentRole = roleResolution.role;
      if (agentRole !== targetRole) {
        console.error(JSON.stringify({
          status: 'error',
          error: 'role_mismatch',
          task_number: taskNumber,
          target_role: targetRole,
          agent_role: agentRole,
          role_resolution: roleResolution,
          message: `Task targets role '${targetRole}'. Agent '${agent}' has role '${agentRole ?? 'null'}'.`,
        }, null, 2));
        store.db.close();
        process.exit(1);
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

console.log(JSON.stringify(output, null, 2));
process.exit(result.exitCode || 0);
