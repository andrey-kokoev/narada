import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildLaunchPlanFromArgs, writeClaudeCodeProcessAttempt, writeLaunchResult } from './start-agent.mjs';
import { bridgeClaudeCodeLiveLaunch, discoverClaudeCodeRuntime } from './claude-code-live-runtime.mjs';
import { mediateEffectRequest, writeEffectMediationEvidence } from './claude-code-effect-mediator.mjs';
import { latestSessionReadback, reconstructSession, writeLifecycleEvent } from './claude-code-lifecycle.mjs';

function smokePath(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'claude-code-smoke', `${carrierSessionId}.smoke.json`);
}

function operatorCommands() {
  return {
    launch: 'node tools\\agent-start\\start-agent.mjs narada.builder --runtime claude-code --exec --json',
    inspect: 'node --test tools\\agent-start\\claude-code-smoke.test.mjs',
    interrupt: 'record interrupt request through Claude Code lifecycle evidence',
    close: 'record close request and closeout through Claude Code lifecycle evidence',
    reconstruct: 'reconstructSession(siteRoot, carrierSessionId)',
  };
}

function lifecycleSmokeEvents({ siteRoot, launchResult, processAttempt, liveLaunch, now }) {
  const runtimeHandle = liveLaunch.evidence.runtime_handle;
  const states = [
    {
      state: 'start',
      startupHydrationResult: null,
      closeoutPosture: null,
    },
    {
      state: 'ready',
      startupHydrationResult: {
        status: 'hydration_affordance_ready',
        startup_command: launchResult.startup_command.name,
      },
      closeoutPosture: null,
    },
    {
      state: 'interrupted',
      startupHydrationResult: null,
      closeoutPosture: null,
    },
    {
      state: 'close_requested',
      startupHydrationResult: null,
      closeoutPosture: {
        status: 'close_requested',
        handoff_required: false,
      },
    },
    {
      state: 'closed',
      startupHydrationResult: null,
      closeoutPosture: {
        status: 'closed_with_smoke_evidence',
        handoff_required: false,
        transcript_recorded: false,
      },
    },
  ];
  return states.map((entry, index) => writeLifecycleEvent({
    siteRoot,
    launchResult,
    processAttempt,
    state: entry.state,
    index,
    now,
    runtimeHandle,
    startupHydrationResult: entry.startupHydrationResult,
    closeoutPosture: entry.closeoutPosture,
    failure: null,
  }));
}

function smokeEffectDecision({ siteRoot, launchResult }) {
  const decision = mediateEffectRequest({
    request_id: `${launchResult.carrier_session_id}_smoke_effect`,
    carrier_session_id: launchResult.carrier_session_id,
    agent_id: launchResult.identity,
    effect_kind: 'task',
    target_locus: 'narada_proper',
    requested_capability: 'task_proposal',
    payload: {
      summary: 'Claude Code smoke no-effect task proposal',
    },
  }, { task_proposal: true });
  const evidencePath = writeEffectMediationEvidence(siteRoot, decision);
  return { decision, evidence_path: evidencePath };
}

function writeSmokeProof(siteRoot, proof) {
  const path = smokePath(siteRoot, proof.carrier_session_id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  return path;
}

function runClaudeCodeSmoke({
  siteRoot,
  pcSiteRoot,
  discovery = discoverClaudeCodeRuntime(),
  spawnRuntime,
  now = new Date().toISOString(),
} = {}) {
  const { result: launchResult } = buildLaunchPlanFromArgs({
    identity: 'narada.builder',
    runtime: 'claude-code',
    exec: true,
    dry_run: false,
  }, { siteRoot, pcSiteRoot, now });
  const launchResultPath = writeLaunchResult(launchResult, siteRoot);
  const processAttemptPath = writeClaudeCodeProcessAttempt(launchResult, siteRoot);
  const liveLaunch = bridgeClaudeCodeLiveLaunch({
    siteRoot,
    launchPacket: launchResult,
    discovery,
    spawnRuntime,
    now,
  });

  if (liveLaunch.status !== 'started') {
    const proof = {
      schema: 'narada.agent_start.claude_code_smoke_proof.v0',
      status: 'skipped_with_blocker',
      blocker: discovery.diagnostic,
      carrier_session_id: launchResult.carrier_session_id,
      launch_result_path: launchResultPath,
      process_attempt_path: processAttemptPath,
      live_launch_evidence_path: liveLaunch.evidence_path,
      lifecycle_event_paths: [],
      latest_readback: latestSessionReadback(siteRoot),
      reconstruction: reconstructSession(siteRoot, launchResult.carrier_session_id),
      effect_mediation: null,
      operator_commands: operatorCommands(),
      operational_success_claimed: false,
      raw_transcript_recorded: false,
      raw_secret_values_recorded: false,
    };
    proof.smoke_proof_path = writeSmokeProof(siteRoot, proof);
    return proof;
  }

  const lifecycleEvents = lifecycleSmokeEvents({
    siteRoot,
    launchResult,
    processAttempt: launchResult.claude_code_process_attempt,
    liveLaunch,
    now,
  });
  const effectMediation = smokeEffectDecision({ siteRoot, launchResult });
  const proof = {
    schema: 'narada.agent_start.claude_code_smoke_proof.v0',
    status: 'passed_no_effect',
    carrier_session_id: launchResult.carrier_session_id,
    launch_result_path: launchResultPath,
    process_attempt_path: processAttemptPath,
    live_launch_evidence_path: liveLaunch.evidence_path,
    lifecycle_event_paths: lifecycleEvents.map((event) => event.path),
    latest_readback: latestSessionReadback(siteRoot),
    reconstruction: reconstructSession(siteRoot, launchResult.carrier_session_id),
    effect_mediation: {
      status: effectMediation.decision.status,
      carrier_mutation_admitted: effectMediation.decision.carrier_mutation_admitted,
      authority_owner: effectMediation.decision.authority_owner,
      evidence_path: effectMediation.evidence_path,
    },
    operator_commands: operatorCommands(),
    operational_success_claimed: true,
    direct_task_mutation: false,
    direct_inbox_mutation: false,
    direct_outbox_mutation: false,
    direct_publication_mutation: false,
    raw_transcript_recorded: false,
    raw_secret_values_recorded: false,
  };
  proof.smoke_proof_path = writeSmokeProof(siteRoot, proof);
  return proof;
}

export {
  operatorCommands,
  runClaudeCodeSmoke,
};
