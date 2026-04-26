/**
 * PrincipalRuntime sync-from-tasks operator.
 *
 * Reconciles PrincipalRuntime state from task governance artifacts.
 * Read-only scan by default; applies corrective transitions unless --dry-run.
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
import {
  resolvePrincipalStateDir,
} from "../lib/principal-bridge.js";
import {
  readTaskFile,
  loadAssignment,
  getActiveAssignment,
  type TaskFrontMatter,
} from "../lib/task-governance.js";
import { ExitCode } from "../lib/exit-codes.js";
import { createFormatter } from "../lib/formatter.js";
import { readdir } from "node:fs/promises";

export interface PrincipalSyncFromTasksOptions {
  format?: "json" | "human" | "auto";
  cwd?: string;
  principalStateDir?: string;
  dryRun?: boolean;
}

interface DivergenceItem {
  agent_id: string;
  runtime_id?: string;
  task_id: string;
  task_status: string;
  expected_state: PrincipalRuntimeState | null;
  actual_state: PrincipalRuntimeState;
  action: "corrected" | "would_correct" | "no_correction" | "no_runtime";
  warning?: string;
}

function expectedStateFromTask(
  taskStatus: string,
  hasActiveAssignment: boolean,
): PrincipalRuntimeState | null {
  switch (taskStatus) {
    case "claimed":
      return hasActiveAssignment ? "claiming" : null;
    case "in_review":
      return "waiting_review";
    case "opened":
    case "needs_continuation":
      return hasActiveAssignment ? "claiming" : null;
    case "closed":
    case "confirmed":
      return null; // Should not be in active work states
    default:
      return null;
  }
}

function shouldCorrect(
  actual: PrincipalRuntimeState,
  expected: PrincipalRuntimeState | null,
): { target: PrincipalRuntimeState | null; reason: string } {
  // Active work states that should not be active
  const activeWorkStates: PrincipalRuntimeState[] = [
    "claiming",
    "executing",
    "waiting_review",
  ];

  if (expected === null && activeWorkStates.includes(actual)) {
    // Task is not active but PR still shows active work
    if (isValidPrincipalRuntimeTransition(actual, "attached_interact")) {
      return { target: "attached_interact", reason: "task not active" };
    }
    if (isValidPrincipalRuntimeTransition(actual, "available")) {
      return { target: "available", reason: "task not active" };
    }
    return { target: null, reason: "no valid transition from active state" };
  }

  if (expected !== null && actual !== expected) {
    if (isValidPrincipalRuntimeTransition(actual, expected)) {
      return { target: expected, reason: `expected ${expected}` };
    }
    // Maybe the principal is further along — e.g., actual is executing but expected is claiming
    // That's fine, don't regress
    if (
      (expected === "claiming" && actual === "executing") ||
      (expected === "claiming" && actual === "waiting_review")
    ) {
      return { target: null, reason: "runtime is ahead of expected state" };
    }
    return { target: null, reason: `no valid transition to ${expected}` };
  }

  return { target: null, reason: "no divergence" };
}

export async function principalSyncFromTasksCommand(
  options: PrincipalSyncFromTasksOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || "auto", verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const stateDir = resolvePrincipalStateDir({
    cwd,
    principalStateDir: options.principalStateDir,
  });

  const divergences: DivergenceItem[] = [];

  // Load PrincipalRuntime registry
  let registry: JsonPrincipalRuntimeRegistry;
  try {
    registry = new JsonPrincipalRuntimeRegistry({ rootDir: stateDir });
    await registry.init();
  } catch {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: "error", error: `Failed to load PrincipalRuntime registry from ${stateDir}` },
    };
  }

  // Scan task files
  const tasksDir = resolve(cwd, ".ai", "do-not-open", "tasks");
  let taskFiles: string[] = [];
  try {
    const entries = await readdir(tasksDir);
    taskFiles = entries.filter((f) => f.endsWith(".md") && !f.startsWith("."));
  } catch {
    // No tasks directory or cannot read
  }

  for (const filename of taskFiles) {
    let frontMatter: TaskFrontMatter;
    let body: string;
    try {
      const parsed = await readTaskFile(resolve(tasksDir, filename));
      frontMatter = parsed.frontMatter;
      body = parsed.body;
    } catch {
      continue;
    }

    const taskId = String(frontMatter.task_id ?? "");
    if (!taskId) continue;

    const taskStatus = String(frontMatter.status ?? "");
    if (!taskStatus) continue;

    // Load assignment to find the agent
    const assignmentRecord = await loadAssignment(cwd, taskId);
    const activeAssignment = assignmentRecord
      ? getActiveAssignment(assignmentRecord)
      : null;

    if (!activeAssignment) {
      // No active assignment — check if any PR is wrongly in active work state for this task
      // We can't easily map a task without an assignment to a principal, so skip
      continue;
    }

    const agentId = activeAssignment.agent_id;
    const principals = registry
      .list()
      .filter((p) => p.principal_id === agentId);

    if (principals.length === 0) {
      divergences.push({
        agent_id: agentId,
        task_id: taskId,
        task_status: taskStatus,
        expected_state: expectedStateFromTask(taskStatus, true),
        actual_state: "unavailable", // placeholder — no runtime record
        action: "no_runtime",
      });
      continue;
    }

    for (const principal of principals) {
      const expected = expectedStateFromTask(taskStatus, true);
      const { target, reason } = shouldCorrect(principal.state, expected);

      if (target === null) {
        if (reason === "no divergence") {
          continue;
        }
        divergences.push({
          agent_id: agentId,
          runtime_id: principal.runtime_id,
          task_id: taskId,
          task_status: taskStatus,
          expected_state: expected,
          actual_state: principal.state,
          action: "no_correction",
          warning: reason,
        });
        continue;
      }

      if (options.dryRun) {
        divergences.push({
          agent_id: agentId,
          runtime_id: principal.runtime_id,
          task_id: taskId,
          task_status: taskStatus,
          expected_state: expected,
          actual_state: principal.state,
          action: "would_correct",
          warning: `${principal.state} → ${target} (${reason})`,
        });
        continue;
      }

      const success = transitionState(principal, target, `sync-from-tasks: ${reason}`);
      if (success) {
        registry.update(principal.runtime_id, (p) => {
          p.state = principal.state;
          p.state_changed_at = principal.state_changed_at;
          p.detail = principal.detail;
        });
        divergences.push({
          agent_id: agentId,
          runtime_id: principal.runtime_id,
          task_id: taskId,
          task_status: taskStatus,
          expected_state: expected,
          actual_state: principal.state,
          action: "corrected",
          warning: `${principal.state} → ${target} (${reason})`,
        });
      } else {
        divergences.push({
          agent_id: agentId,
          runtime_id: principal.runtime_id,
          task_id: taskId,
          task_status: taskStatus,
          expected_state: expected,
          actual_state: principal.state,
          action: "no_correction",
          warning: `transition failed: ${principal.state} → ${target}`,
        });
      }
    }
  }

  await registry.flush();

  const corrected = divergences.filter((d) => d.action === "corrected");
  const wouldCorrect = divergences.filter((d) => d.action === "would_correct");
  const noRuntime = divergences.filter((d) => d.action === "no_runtime");

  if (fmt.getFormat() === "json") {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: "success",
        dry_run: !!options.dryRun,
        state_dir: stateDir,
        summary: {
          total_scanned: taskFiles.length,
          divergences_found: divergences.length,
          corrected: corrected.length,
          would_correct: wouldCorrect.length,
          no_runtime: noRuntime.length,
        },
        divergences,
      },
    };
  }

  fmt.message(
    `Scanned ${taskFiles.length} tasks. ${divergences.length} divergence(s) found.`,
    "info",
  );
  if (options.dryRun) {
    fmt.message(`Dry run — no corrections applied.`, "warning");
  }
  if (corrected.length > 0) {
    fmt.message(`Corrected ${corrected.length} principal state(s).`, "success");
  }
  if (noRuntime.length > 0) {
    fmt.message(
      `${noRuntime.length} agent(s) have active assignments but no PrincipalRuntime record.`,
      "warning",
    );
  }

  for (const d of divergences) {
    const icon =
      d.action === "corrected"
        ? "✓"
        : d.action === "would_correct"
          ? "→"
          : d.action === "no_runtime"
            ? "?"
            : "−";
    fmt.message(
      `  ${icon} ${d.agent_id} / ${d.task_id}: ${d.actual_state} (task: ${d.task_status})${d.warning ? ` — ${d.warning}` : ""}`,
    );
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: "success",
      dry_run: !!options.dryRun,
      corrected: corrected.length,
      would_correct: wouldCorrect.length,
      no_runtime: noRuntime.length,
    },
  };
}
