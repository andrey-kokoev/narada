import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { agentIdentityRefMatchesRequest } from '@narada2/agent-identity';
import { evaluateAgentStartHandoff } from '@narada2/agent-start/launch-result-v0-contract';
import type { AgentStartResultV0, AgentStartSessionRef } from '@narada2/agent-start/launch-result-v0-contract';
import type { LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type { IntelligenceSelectionAuthority } from '@narada2/invokable-intelligence-contract';
import type {
  AgentStartExecutionResult,
  OperatorProjectionLaunchBinding,
  OperatorSurfaceRuntimeStatusOptions,
  OperatorSurfaceRuntimeStatusResult,
} from './launcher-contracts.js';
import { readJsonFile, readLaunchResults, reconcileLaunchResults } from './launcher-runtime-results.js';

export function writeOperatorProjectionLaunchBinding(path: string | undefined, args: {
  status: OperatorProjectionLaunchBinding['status'];
  siteRoot: string;
  workspaceRoot: string;
  agent: string;
  operatorSurfaceKind?: string;
  runtimeHostKind: string;
  authority?: string | null;
  intelligenceSelectionAuthority?: IntelligenceSelectionAuthority | null;
  agentStartResultFile?: string;
  narsSessionId?: string | null;
  runtimeSessionId?: string | null;
  carrierSessionId?: string | null;
  sessionRef?: AgentStartSessionRef | null;
  launchSessionId?: string | null;
  processOwnership?: LaunchProcessOwnership | null;
  reason?: string | null;
}): void {
  if (!path) return;
  const now = new Date().toISOString();
  let createdAt = now;
  try {
    const previous = readJsonFile(path) as { created_at?: unknown } | null;
    if (typeof previous?.created_at === 'string') createdAt = previous.created_at;
  } catch {
    // Keep binding writes best-effort; launch itself remains authoritative.
  }
  const binding: OperatorProjectionLaunchBinding = {
    schema: 'narada.operator_projection_launch_binding.v1',
    status: args.status,
    created_at: createdAt,
    updated_at: now,
    site_root: args.siteRoot,
    workspace_root: args.workspaceRoot,
    agent: args.agent,
    operator_surface_kind: args.operatorSurfaceKind,
    runtime_host_kind: args.runtimeHostKind,
    authority: args.authority ?? null,
    intelligence_selection_authority: args.intelligenceSelectionAuthority ?? null,
    agent_start_result_file: args.agentStartResultFile,
    nars_session_id: args.narsSessionId ?? null,
    runtime_session_id: args.runtimeSessionId ?? null,
    carrier_session_id: args.carrierSessionId ?? null,
    session_ref: args.sessionRef ?? null,
    launch_session_id: args.launchSessionId ?? null,
    process_ownership: args.processOwnership ?? null,
    reason: args.reason ?? null,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
}

export function classifyAgentStartLaunchBindingStatus(
  executionStatus: AgentStartExecutionResult['status'],
  parsedRecord: AgentStartResultV0 | null,
): Pick<OperatorProjectionLaunchBinding, 'status' | 'reason'> {
  const handoff = parsedRecord ? evaluateAgentStartHandoff(parsedRecord) : null;
  if (handoff?.eligible) {
    return { status: 'ready', reason: null };
  }
  if (handoff?.status === 'invalid') {
    return { status: 'failed', reason: 'agent_start_result_contract_invalid' };
  }
  if (handoff?.status === 'ineligible') {
    return { status: 'failed', reason: handoff.reason };
  }
  if (executionStatus === 'starting') {
    return { status: 'waiting_for_agent_start', reason: 'agent_start_handoff_pending' };
  }
  return { status: 'failed', reason: 'agent_start_failed' };
}

export function getOperatorSurfaceRuntimeStatus(
  options: OperatorSurfaceRuntimeStatusOptions,
): OperatorSurfaceRuntimeStatusResult {
  const siteRoot = resolve(options.siteRoot);
  const launchResultsDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
  reconcileLaunchResults(launchResultsDir);
  const allSummaries = readLaunchResults(launchResultsDir);
  const summaries = allSummaries
    .filter((summary) => !options.agent || summary.identity === options.agent || agentIdentityRefMatchesRequest(summary.agent_identity_ref, options.agent))
    .filter((summary) => !options.carrier || summary.carrier_kind === options.carrier)
    .filter((summary) => {
      if (!options.runtime) return true;
      return summary.runtime === options.runtime || summary.runtime_substrate_kind === options.runtime;
    })
    .sort((a, b) => b.mtime_ms - a.mtime_ms);
  const latest = summaries[0];

  return {
    schema: 'narada.carrier.status.v0',
    status: latest ? 'ok' : 'not_found',
    mutation_performed: false,
    site_root: siteRoot,
    agent: options.agent,
    carrier: options.carrier,
    runtime: options.runtime,
    latest,
    launch_results_dir: launchResultsDir,
    launch_results_seen: allSummaries.length,
    candidates_scanned: summaries.length,
  };
}

export function getOperatorSurfaceRuntimeControlPath(
  options: OperatorSurfaceRuntimeStatusOptions,
): OperatorSurfaceRuntimeStatusResult {
  return getOperatorSurfaceRuntimeStatus(options);
}
