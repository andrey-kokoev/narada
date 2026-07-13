import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { agentIdentityRefMatchesRequest } from '@narada2/agent-identity';
import type { LaunchProcessOwnership } from '@narada2/launch-process-ownership';
import type {
  CommandExecutionResult,
  LaunchResultRecord,
  OperatorProjectionLaunchBinding,
  OperatorSurfaceRuntimeStatusOptions,
  OperatorSurfaceRuntimeStatusResult,
} from './launcher-contracts.js';
import { readJsonFile, readLaunchResults, stringValue } from './launcher-runtime-results.js';

export function writeOperatorProjectionLaunchBinding(path: string | undefined, args: {
  status: OperatorProjectionLaunchBinding['status'];
  siteRoot: string;
  workspaceRoot: string;
  agent: string;
  operatorSurfaceKind?: string;
  runtimeHostKind: string;
  authority?: string | null;
  intelligenceProvider?: string | null;
  agentStartResultFile?: string;
  narsSessionId?: string | null;
  runtimeSessionId?: string | null;
  carrierSessionId?: string | null;
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
    intelligence_provider: args.intelligenceProvider ?? null,
    agent_start_result_file: args.agentStartResultFile,
    nars_session_id: args.narsSessionId ?? null,
    runtime_session_id: args.runtimeSessionId ?? null,
    carrier_session_id: args.carrierSessionId ?? null,
    launch_session_id: args.launchSessionId ?? null,
    process_ownership: args.processOwnership ?? null,
    reason: args.reason ?? null,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(binding, null, 2)}\n`, 'utf8');
}

export function classifyAgentStartLaunchBindingStatus(
  executionStatus: CommandExecutionResult['status'],
  parsedRecord: LaunchResultRecord | null,
): Pick<OperatorProjectionLaunchBinding, 'status' | 'reason'> {
  const parsedStatus = stringValue(parsedRecord?.status)?.toLowerCase();
  const hasNarsSession = Boolean(
    stringValue(parsedRecord?.nars_launch?.nars_session_id ?? parsedRecord?.nars_launch?.session_id ?? parsedRecord?.required_environment?.NARADA_NARS_SESSION_ID),
  );
  if (hasNarsSession && (parsedStatus === 'materialized' || parsedStatus === 'success')) {
    return { status: 'ready', reason: null };
  }
  if (executionStatus === 'success') return { status: 'ready', reason: null };
  return { status: 'failed', reason: 'agent_start_failed' };
}

export function getOperatorSurfaceRuntimeStatus(
  options: OperatorSurfaceRuntimeStatusOptions,
): OperatorSurfaceRuntimeStatusResult {
  const siteRoot = resolve(options.siteRoot);
  const launchResultsDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
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
