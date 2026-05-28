import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readRegistration } from './adapter-registration.mjs';
import { runFixtureWorkLoop, runProviderWorkLoop } from './work-loop.mjs';

function taskPacketSummary(packet) {
  return {
    task_number: packet.task_number,
    task_id: packet.task_id,
    title_present: typeof packet.title === 'string' && packet.title.length > 0,
    goal_present: typeof packet.goal === 'string' && packet.goal.length > 0,
    assignment_agent_id: packet.assignment?.agent_id ?? null,
    raw_task_markdown_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function assertTaskPacketAdmitted(packet, { agentId, capabilityGrants = {} }) {
  if (!packet) {
    return { admitted: false, reason: 'missing_task_packet', diagnostic: 'No task packet was returned by the governed reader.' };
  }
  if (packet.assignment?.agent_id && packet.assignment.agent_id !== agentId) {
    return {
      admitted: false,
      reason: 'assigned_to_different_agent',
      diagnostic: `Task packet is assigned to ${packet.assignment.agent_id}, not ${agentId}.`,
    };
  }
  if (capabilityGrants.task_report_draft !== true) {
    return {
      admitted: false,
      reason: 'missing_task_report_draft_capability',
      diagnostic: 'Narada-native task handoff requires task_report_draft capability.',
    };
  }
  return { admitted: true, reason: 'bounded_task_packet_admitted', diagnostic: null };
}

function handoffDraftPath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'narada-native-carrier-sessions', carrierSessionId, 'task-report-draft.json');
}

function runNaradaTaskRead(taskNumber, { siteRoot }) {
  const result = spawnSync('narada', ['task', 'read', String(taskNumber), '--format', 'json', '--cwd', siteRoot], {
    cwd: siteRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`narada task read failed: ${(result.stderr ?? '').slice(0, 500)}`);
  }
  return result.stdout;
}

async function readTaskPacketViaNaradaCli(taskNumber, { siteRoot, runCommand = runNaradaTaskRead } = {}) {
  const stdout = await runCommand(taskNumber, { siteRoot });
  const parsed = typeof stdout === 'string' ? JSON.parse(stdout) : stdout;
  const task = parsed.task ?? parsed.primary ?? parsed.packet ?? parsed;
  return {
    task_number: task.task_number,
    task_id: task.task_id,
    title: task.title,
    goal: task.goal,
    assignment: task.assignment ?? null,
    read_surface: {
      kind: 'narada_cli',
      command: ['narada', 'task', 'read', String(taskNumber), '--format', 'json', '--cwd', siteRoot],
      bounded: true,
      raw_task_markdown_recorded: false,
      raw_secret_values_recorded: false,
    },
  };
}

function createWorkResultReportDraft({ packet, loopResult, carrierSessionId, agentId, now = new Date().toISOString() }) {
  return {
    schema: 'narada.narada_native_carrier.work_result_report_draft.v0',
    status: 'draft_requires_canonical_task_report_admission',
    carrier_session_id: carrierSessionId,
    agent_id: agentId,
    task_number: packet.task_number,
    task_id: packet.task_id,
    summary: `Narada-native carrier produced a governed handoff draft for task ${packet.task_number}.`,
    changed_files: [],
    verification: [],
    known_residuals: [],
    evidence_refs: {
      adapter_invocation: loopResult.adapter_invocation_path,
      work_loop_handoff: loopResult.handoff_path,
      interrupt: loopResult.interrupt_path,
      closeout: loopResult.closeout_path,
    },
    read_surface: packet.read_surface ?? null,
    suggested_admission_command: `narada task report ${packet.task_number} --agent ${agentId} --reviewer <reviewer> --report-file <draft>`,
    direct_task_lifecycle_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    repository_mutation: false,
    raw_task_markdown_recorded: false,
    raw_secret_values_recorded: false,
    recorded_at: now,
  };
}

async function runRegisteredWorkLoop({
  siteRoot,
  carrierSessionId,
  agentId,
  packet,
  registration,
  capabilityLookup,
  providerRegistry,
  now,
}) {
  const workPacket = {
    task_number: packet.task_number,
    prompt: `Task ${packet.task_number}: ${packet.title ?? 'assigned work packet'}`,
  };
  const startupContext = { agent_id: agentId };
  const providerKind = registration?.provider_kind ?? 'fixture';
  if (providerKind && providerKind !== 'fixture') {
    return await runProviderWorkLoop({
      siteRoot,
      carrierSessionId,
      startupContext,
      workPacket,
      registration,
      capabilityLookup,
      providerRegistry,
      now,
    });
  }
  return runFixtureWorkLoop({
    siteRoot,
    carrierSessionId,
    startupContext,
    workPacket,
    now,
  });
}

async function runGovernedTaskHandoff({
  siteRoot,
  carrierSessionId,
  agentId,
  taskNumber,
  readTaskPacket,
  readTaskPacketCommandRunner,
  registration,
  capabilityLookup,
  providerRegistry,
  capabilityGrants = {},
  now = new Date().toISOString(),
}) {
  const packet = readTaskPacket
    ? await readTaskPacket(taskNumber)
    : await readTaskPacketViaNaradaCli(taskNumber, { siteRoot, runCommand: readTaskPacketCommandRunner });
  const admission = assertTaskPacketAdmitted(packet, { agentId, capabilityGrants });
  if (!admission.admitted) {
    const refused = {
      schema: 'narada.narada_native_carrier.task_handoff_result.v0',
      status: 'refused',
      reason: admission.reason,
      diagnostic: admission.diagnostic,
      carrier_session_id: carrierSessionId,
      agent_id: agentId,
      task_packet_summary: packet ? taskPacketSummary(packet) : null,
      direct_task_lifecycle_mutation: false,
      direct_inbox_mutation: false,
      direct_outbox_mutation: false,
      direct_publication_mutation: false,
      repository_mutation: false,
    };
    const path = handoffDraftPath(siteRoot, carrierSessionId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(refused, null, 2)}\n`, 'utf8');
    return { result: refused, draft_path: path };
  }

  const loopResult = await runRegisteredWorkLoop({
    siteRoot,
    carrierSessionId,
    agentId,
    packet,
    registration: registration ?? readRegistration(siteRoot),
    capabilityLookup,
    providerRegistry,
    now,
  });
  const draft = createWorkResultReportDraft({
    packet,
    loopResult,
    carrierSessionId,
    agentId,
    now,
  });
  const path = handoffDraftPath(siteRoot, carrierSessionId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  return { result: draft, draft_path: path };
}

export {
  assertTaskPacketAdmitted,
  createWorkResultReportDraft,
  readTaskPacketViaNaradaCli,
  runRegisteredWorkLoop,
  runGovernedTaskHandoff,
  taskPacketSummary,
};
