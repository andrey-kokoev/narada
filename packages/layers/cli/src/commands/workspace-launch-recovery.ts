import { discoverNarsSessions } from '@narada2/nars-session-core/session-index';
import { formattedResult } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { workspaceLaunchRequestPersistedProcessCleanup } from './workspace-launch-process.js';
import { workspaceLaunchRequestStaleSessionCleanup } from './workspace-launch-cleanup.js';
import {
  listWorkspaceLaunchExecutionAttempts,
  updateWorkspaceLaunchExecutionAttempt,
  workspaceLaunchExecutionAttemptLeaseIsStale,
  type WorkspaceLaunchExecutionAttemptRecord,
  type WorkspaceLaunchExecutionAttemptState,
} from './workspace-launch-execution-attempt-store.js';
import {
  workspaceLaunchSessionIsTerminalForCleanup,
  workspaceLaunchSessionLaunchSessionId,
} from './workspace-launch-session.js';

export interface WorkspaceLaunchRecoveryOptions {
  attempt?: string[];
  dryRun?: boolean;
  format?: 'json' | 'human' | 'auto';
}

const RECOVERABLE_STATES: readonly WorkspaceLaunchExecutionAttemptState[] = [
  'planning',
  'launching',
  'handoff_recorded',
  'observing',
  'recoverable',
  'recovery_requested',
];

export async function workspaceLaunchRecoveryCommand(options: WorkspaceLaunchRecoveryOptions) {
  const attempts = await listWorkspaceLaunchExecutionAttempts();
  const explicitAttempts = new Set(options.attempt ?? []);
  const outcomes: Array<Record<string, unknown>> = [];
  for (const attempt of attempts) {
    const explicitlySelected = explicitAttempts.has(attempt.launch_attempt_id);
    if (explicitAttempts.size > 0 && !explicitlySelected) continue;
    if (!isRecoverableState(attempt.state)) {
      if (explicitlySelected) outcomes.push({
        launch_attempt_id: attempt.launch_attempt_id,
        status: 'not_recoverable',
        reason_code: 'attempt_state_not_recoverable',
        state: attempt.state,
      });
      continue;
    }
    if (!workspaceLaunchExecutionAttemptLeaseIsStale(attempt)) {
      if (explicitlySelected) outcomes.push({
        launch_attempt_id: attempt.launch_attempt_id,
        status: 'owner_active',
        reason_code: 'launch_attempt_owner_active',
        required_next_step: 'Wait for the owning launcher process to finish or expire its lease before recovery.',
      });
      continue;
    }
    outcomes.push(await recoverAttempt(attempt, options.dryRun === true));
  }

  const failed = outcomes.some((outcome) => !['recovered', 'nothing_to_recover'].includes(String(outcome.status)));
  const result = {
    schema: 'narada.workspace_launch.recovery.v1' as const,
    status: failed ? 'partial' as const : 'completed' as const,
    mutation_performed: options.dryRun !== true && outcomes.some((outcome) => outcome.mutation_performed === true),
    dry_run: options.dryRun === true,
    attempts: outcomes,
    required_next_step: outcomes.some((outcome) => outcome.status === 'recoverable' || outcome.status === 'recovery_requested')
      ? 'Retry recovery after the exact NARS session is indexed and the requested close/process cleanup is observed.'
      : outcomes.some((outcome) => outcome.status === 'owner_active')
        ? 'Wait for the active launch owner to finish before retrying recovery.'
        : null,
  };
  return {
    exitCode: result.status === 'completed' ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result: formattedResult(result, `workspace launch recovery ${result.status}`, options.format ?? 'auto'),
  };
}

async function recoverAttempt(attempt: WorkspaceLaunchExecutionAttemptRecord, dryRun: boolean): Promise<Record<string, unknown>> {
  const sessions: Array<Record<string, unknown>> = [];
  const attempted = new Set<string>();
  const processCleanup = dryRun
    ? attempt.processes.map((processLaunch) => ({
      status: 'would_request_process_cleanup',
      pid: processLaunch.pid,
      owner_ref: processLaunch.owner_ref,
    }))
    : attempt.processes.map((processLaunch) => ({
      ...workspaceLaunchRequestPersistedProcessCleanup(processLaunch),
      pid: processLaunch.pid,
      owner_ref: processLaunch.owner_ref,
    }));
  const processCleanupUnresolved = processCleanup.some((entry) => entry.status === 'refused');
  const projectionCleanupUnresolved = !dryRun && attempt.processes.some((processLaunch, index) => (
    processLaunch.posture === 'operator_projection_host' && processCleanup[index]?.status === 'refused'
  ));
  const processCleanupResolved = processCleanup.every((entry) => entry.status === 'terminated' || entry.status === 'not_running');

  if (attempt.bindings.length === 0) {
    sessions.push({
      status: 'recoverable',
      reason_code: 'launch_binding_missing',
      required_next_step: 'Inspect the attempt artifact; no exact launch session binding was durably recorded.',
    });
  }

  for (const binding of attempt.bindings) {
    let discovery;
    try {
      discovery = discoverNarsSessions({ siteRoot: binding.site_root });
    } catch {
      sessions.push({
        launch_session_id: binding.launch_session_id,
        site_root: binding.site_root,
        status: 'recoverable',
        reason_code: 'session_index_unavailable',
      });
      continue;
    }
    const matches = discovery.sessions.filter((session) => (
      binding.launch_session_id
      && workspaceLaunchSessionLaunchSessionId(session) === binding.launch_session_id
      && samePath(session.site_root ?? session.record?.site_root, binding.site_root)
    ));

    if (matches.length === 0) {
      const absentAfterRequest = attempt.state === 'recovery_requested' && processCleanupResolved && !processCleanupUnresolved;
      sessions.push({
        launch_session_id: binding.launch_session_id,
        site_root: binding.site_root,
        status: absentAfterRequest ? 'recovered' : 'recoverable',
        ...(absentAfterRequest ? {} : { reason_code: 'exact_session_not_indexed' }),
      });
      continue;
    }

    for (const session of matches) {
      if (workspaceLaunchSessionIsTerminalForCleanup(session)) {
        sessions.push({
          launch_session_id: binding.launch_session_id,
          session_id: session.session_id ?? null,
          site_root: binding.site_root,
          status: processCleanupUnresolved ? 'recoverable' : 'recovered',
          ...(processCleanupUnresolved ? { reason_code: 'persisted_process_cleanup_not_proven' } : {}),
        });
        continue;
      }
      if (dryRun) {
        sessions.push({
          launch_session_id: binding.launch_session_id,
          session_id: session.session_id ?? null,
          site_root: binding.site_root,
          status: 'would_request_session_close',
        });
        continue;
      }
      const cleanup = await workspaceLaunchRequestStaleSessionCleanup(session, attempted);
      const requested = cleanup.status === 'requested' && !projectionCleanupUnresolved;
      sessions.push({
        launch_session_id: binding.launch_session_id,
        session_id: session.session_id ?? null,
        site_root: binding.site_root,
        status: requested ? 'recovery_requested' : 'recoverable',
        ...(cleanup.status === 'refused' ? { reason_code: 'exact_session_cleanup_not_admitted' } : {}),
        ...(processCleanupUnresolved ? { reason_code: 'persisted_process_cleanup_not_proven' } : {}),
      });
    }
  }

  const unresolved = sessions.some((session) => session.status === 'recoverable');
  const pending = sessions.some((session) => session.status === 'recovery_requested');
  const recovered = !unresolved && !pending && sessions.length > 0 && sessions.every((session) => session.status === 'recovered');
  const nextState: WorkspaceLaunchExecutionAttemptState = unresolved
    ? 'recoverable'
    : pending
      ? 'recovery_requested'
      : recovered
        ? 'recovered'
        : 'recoverable';

  if (!dryRun) {
    await updateWorkspaceLaunchExecutionAttempt(attempt, nextState, {
      failure: unresolved || pending
        ? {
          reason_code: pending ? 'workspace_launch_recovery_requested' : 'workspace_launch_recovery_incomplete',
          message: pending
            ? 'Recovery requested exact session/process cleanup; closure has not yet been observed.'
            : 'Recovery could not prove exact session closure and persisted process cleanup for every launch binding.',
          required_next_step: 'Retry recovery after the exact NARS session is indexed and the requested cleanup is observed.',
        }
        : null,
    });
  }

  const status = unresolved ? 'recoverable' : pending ? 'recovery_requested' : recovered ? 'recovered' : 'nothing_to_recover';
  return {
    launch_attempt_id: attempt.launch_attempt_id,
    status,
    mutation_performed: !dryRun && (pending || recovered),
    processes: processCleanup,
    sessions,
  };
}

function isRecoverableState(state: WorkspaceLaunchExecutionAttemptState): boolean {
  return RECOVERABLE_STATES.includes(state);
}

function samePath(left: string | null | undefined, right: string): boolean {
  if (!left) return false;
  return left.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
    === right.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
}
