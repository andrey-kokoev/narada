/**
 * PrincipalRuntime bridge helper.
 *
 * Connects task-governance events to PrincipalRuntime state updates.
 * All updates are post-commit, advisory, and best-effort.
 *
 * @see Decision 444: Task Governance / PrincipalRuntime Bridge Contract
 */

import { resolve } from "node:path";
import {
  JsonPrincipalRuntimeRegistry,
  transitionState,
  isValidPrincipalRuntimeTransition,
  type PrincipalRuntimeState,
} from "@narada2/control-plane";

export type TaskGovernanceEvent =
  | { type: "task_claimed"; agent_id: string; task_id: string }
  | { type: "task_reported"; agent_id: string; task_id: string; report_id: string }
  | { type: "task_review_accepted"; agent_id: string; task_id: string; review_id: string }
  | { type: "task_review_rejected"; agent_id: string; task_id: string; review_id: string }
  | { type: "task_released"; agent_id: string; task_id: string; reason: string };

export interface BridgeUpdateResult {
  updated: boolean;
  runtime_id?: string;
  previous_state?: PrincipalRuntimeState;
  new_state?: PrincipalRuntimeState;
  warning?: string;
}

export function resolvePrincipalStateDir(options?: {
  cwd?: string;
  principalStateDir?: string;
}): string {
  if (options?.principalStateDir) return resolve(options.principalStateDir);
  if (process.env.NARADA_PRINCIPAL_STATE_DIR)
    return resolve(process.env.NARADA_PRINCIPAL_STATE_DIR);
  return resolve(options?.cwd ?? process.cwd());
}

function isSilentEvent(event: TaskGovernanceEvent): boolean {
  return (
    event.type === "task_reported" ||
    event.type === "task_review_accepted" ||
    event.type === "task_review_rejected" ||
    event.type === "task_released"
  );
}

function determineTargetState(
  currentState: PrincipalRuntimeState,
  event: TaskGovernanceEvent,
): PrincipalRuntimeState | null {
  switch (event.type) {
    case "task_claimed":
      if (currentState === "attached_interact") return "claiming";
      return null;

    case "task_reported":
      if (currentState === "executing") return "waiting_review";
      return null;

    case "task_review_accepted":
    case "task_review_rejected":
      if (currentState === "waiting_review") {
        return "attached_interact";
      }
      // executing has no direct path to attached_interact
      return null;

    case "task_released":
      if (event.reason === "budget_exhausted") {
        if (
          currentState === "executing" ||
          currentState === "waiting_review"
        ) {
          return "budget_exhausted";
        }
        return null;
      }
      // completed, abandoned, superseded, transferred
      if (currentState === "claiming") {
        return "attached_interact";
      }
      if (currentState === "waiting_review") {
        return "attached_interact";
      }
      // executing has no direct path to attached_interact in the state machine
      return null;

    default:
      return null;
  }
}

export async function updatePrincipalRuntimeFromTaskEvent(
  stateDir: string,
  event: TaskGovernanceEvent,
): Promise<BridgeUpdateResult> {
  const registry = new JsonPrincipalRuntimeRegistry({ rootDir: stateDir });
  await registry.init();

  const principals = registry
    .list()
    .filter((p) => p.principal_id === event.agent_id);

  if (principals.length === 0) {
    const warning = isSilentEvent(event)
      ? undefined
      : `PrincipalRuntime not found for agent_id ${event.agent_id}`;
    return { updated: false, warning };
  }

  if (principals.length > 1) {
    return {
      updated: false,
      warning: `Multiple PrincipalRuntime records match agent_id ${event.agent_id}. Skipping transition.`,
    };
  }

  const principal = principals[0]!;
  const previousState = principal.state;
  const targetState = determineTargetState(previousState, event);

  if (targetState === null) {
    return {
      updated: false,
      warning: `PrincipalRuntime for ${event.agent_id} is in state ${previousState}; no transition applies for ${event.type}.`,
    };
  }

  if (!isValidPrincipalRuntimeTransition(previousState, targetState)) {
    return {
      updated: false,
      warning: `Invalid PrincipalRuntime transition: ${previousState} → ${targetState} for ${event.agent_id}. Skipping.`,
    };
  }

  const success = transitionState(principal, targetState, `bridge: ${event.type}`);
  if (!success) {
    return {
      updated: false,
      warning: `PrincipalRuntime transition failed: ${previousState} → ${targetState} for ${event.agent_id}.`,
    };
  }

  // Persist via registry update
  registry.update(principal.runtime_id, (p) => {
    p.state = principal.state;
    p.state_changed_at = principal.state_changed_at;
    p.detail = principal.detail;
    if (!hasActiveWork(p.state) && p.state !== "claiming") {
      p.active_work_item_id = null;
      p.active_session_id = null;
    }
  });

  await registry.flush();

  return {
    updated: true,
    runtime_id: principal.runtime_id,
    previous_state: previousState,
    new_state: principal.state,
  };
}

// Inline helper to avoid importing from state-machine directly
function hasActiveWork(state: PrincipalRuntimeState): boolean {
  return (
    state === "claiming" || state === "executing" || state === "waiting_review"
  );
}
