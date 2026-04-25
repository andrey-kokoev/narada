---
status: closed
closed: 2026-04-22
depends_on: [444]
---

# Task 456 — Implement Task Governance / PrincipalRuntime Bridge

## Context

Task 444 defined the bridge contract between task governance (durable file-backed work lifecycle) and PrincipalRuntime (ephemeral/advisory runtime actor state). The contract specifies:

- Unidirectional bridge: Task Governance → PrincipalRuntime (post-commit, advisory).
- Event-to-transition mappings for `claim`, `report`, `review`, and `release`.
- Hybrid implementation: best-effort post-commit hooks + reconciliation command.
- PrincipalRuntime state resolution from `cwd`, `--principal-state-dir`, or `NARADA_PRINCIPAL_STATE_DIR`.

This task implements the bridge. It does not change authority boundaries, scheduler behavior, or foreman governance.

## Goal

Implement the bridge so that task commands automatically (or optionally) update PrincipalRuntime state after completing durable mutations, and add a reconciliation command for divergence repair.

## Required Work

### 1. Create shared bridge helper module

Create `packages/layers/cli/src/lib/principal-bridge.ts`:

```typescript
// Must expose:

export type TaskGovernanceEvent =
  | { type: 'task_claimed'; agent_id: string; task_id: string }
  | { type: 'task_reported'; agent_id: string; task_id: string; report_id: string }
  | { type: 'task_review_accepted'; agent_id: string; task_id: string; review_id: string }
  | { type: 'task_review_rejected'; agent_id: string; task_id: string; review_id: string }
  | { type: 'task_released'; agent_id: string; task_id: string; reason: string };

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
}): string;

export async function updatePrincipalRuntimeFromTaskEvent(
  stateDir: string,
  event: TaskGovernanceEvent,
): Promise<BridgeUpdateResult>;
```

Implementation rules:
- Load `JsonPrincipalRuntimeRegistry` from `stateDir`.
- Find principal by matching `principal_id` to `event.agent_id`.
- If multiple principals match, return `updated: false` with warning `"Multiple PrincipalRuntime records match agent_id <id>. Skipping transition."`.
- Apply transition per Decision 444 §3 mapping table.
- If transition is invalid, return `updated: false` with warning.
- If principal not found, return `updated: false` (silent for report/review/release; warning for claim).
- Flush registry after update.

### 2. Wire post-commit hooks into task commands

Edit these files:

#### `packages/layers/cli/src/commands/task-claim.ts`
- Add `updatePrincipalRuntime?: boolean` and `principalStateDir?: string` to `TaskClaimOptions`.
- After task file write succeeds, if `updatePrincipalRuntime` is true:
  - Call `updatePrincipalRuntimeFromTaskEvent` with `{ type: 'task_claimed', agent_id, task_id }`.
  - If result has a warning, emit it via `fmt.message(warning, 'warning')`.
- Do not fail the command if bridge update fails.

#### `packages/layers/cli/src/commands/task-report.ts`
- Add `principalStateDir?: string` to `TaskReportOptions`.
- After task file write and roster update succeed:
  - Call `updatePrincipalRuntimeFromTaskEvent` with `{ type: 'task_reported', agent_id, task_id, report_id }`.
  - Emit warning if present.
- Do not fail the command if bridge update fails.

#### `packages/layers/cli/src/commands/task-review.ts`
- Add `principalStateDir?: string` to `TaskReviewOptions`.
- After task file write and roster update succeed:
  - Call `updatePrincipalRuntimeFromTaskEvent` with `{ type: 'task_review_accepted' | 'task_review_rejected', agent_id, task_id, review_id }`.
  - Emit warning if present.
- Do not fail the command if bridge update fails.

#### `packages/layers/cli/src/commands/task-release.ts`
- Add `principalStateDir?: string` to `TaskReleaseOptions`.
- After task file write succeeds:
  - Call `updatePrincipalRuntimeFromTaskEvent` with `{ type: 'task_released', agent_id, task_id, reason }`.
  - Emit warning if present.
- Do not fail the command if bridge update fails.

### 3. Add `--principal-state-dir` CLI options

Edit `packages/layers/cli/src/main.ts`:
- Add `--principal-state-dir <path>` option to:
  - `narada task claim`
  - `narada task report`
  - `narada task review`
  - `narada task release`
- Add `--update-principal-runtime` flag to `narada task claim`.
- Pass these options through to the command functions.

### 4. Add `narada principal sync-from-tasks` command

Create `packages/layers/cli/src/commands/principal-sync-from-tasks.ts`:

```bash
narada principal sync-from-tasks [--cwd <path>] [--principal-state-dir <path>] [--dry-run] [--format json|human]
```

Behavior:
- Scan all task files in `.ai/do-not-open/tasks/`.
- Load all assignments from `.ai/do-not-open/tasks/tasks/assignments/`.
- Load PrincipalRuntime registry from resolved state dir.
- For each agent with an active assignment (roster `status: working` or assignment record with unreleased claim):
  - Find matching PrincipalRuntime.
  - Compare expected state (from task status) with actual PR state.
  - If divergent, apply corrective transition (unless `--dry-run`).
- Output: list of divergences found and corrections applied.
- Do not create new PrincipalRuntime records for agents that lack them.

Expected state mapping for reconciliation:
- Task `claimed` + active assignment → PR should be `claiming` or `executing`.
- Task `in_review` → PR should be `waiting_review`.
- Task `opened`/`needs_continuation` + no active assignment → PR should not be `executing`/`waiting_review`/`claiming`.
- Task `closed`/`confirmed` → PR should not be in active work states.

### 5. Add `task roster done` warning for missing report

Edit `packages/layers/cli/src/commands/task-roster.ts`:
- In `taskRosterDoneCommand`, before updating roster:
  - Check if a WorkResultReport exists for the task (use `listReportsForTask`).
  - If no report exists, emit warning: `"Agent <id> marked done for task <n> but no WorkResultReport was submitted."`.
- Do not block the roster update.

### 6. Add focused tests

Create `test/commands/principal-bridge.test.ts` covering:

- `updatePrincipalRuntimeFromTaskEvent`:
  - `task_reported` transitions `executing` → `waiting_review`.
  - `task_review_accepted` transitions `waiting_review` → `attached_interact`.
  - `task_review_rejected` transitions `waiting_review` → `attached_interact`.
  - `task_released` transitions `executing` → `attached_interact`.
  - `task_released` with `budget_exhausted` transitions `executing` → `budget_exhausted`.
  - `task_claimed` transitions `attached_interact` → `claiming`.
  - Missing principal returns `updated: false` silently (report/review/release) or with warning (claim).
  - Multiple matching principals returns `updated: false` with warning.
  - Invalid transition returns `updated: false` with warning.

- Command integration (mock registry):
  - `task report` succeeds even when PR update fails.
  - `task review` succeeds even when PR update fails.
  - `task claim` without `--update-principal-runtime` does not touch PR.
  - `task claim` with `--update-principal-runtime` touches PR.

- `principal sync-from-tasks`:
  - Detects divergence (task `in_review`, PR `executing`).
  - Applies correction in non-dry-run mode.
  - Does not mutate in dry-run mode.
  - Does not create missing PR records.

Do not run broad suites unless focused tests expose a cross-package failure.

## Non-Goals

- Do not make PrincipalRuntime authoritative over task lifecycle.
- Do not merge roster and PrincipalRuntime.
- Do not make PrincipalRuntime required for task commands.
- Do not auto-assign tasks.
- Do not implement SiteAttachment.
- Do not change scheduler/foreman authority.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.
- Do not change the default storage location of PrincipalRuntime (config-adjacent).
- Do not add reconciliation to normal daemon startup.

## Acceptance Criteria

- [x] `packages/layers/cli/src/lib/principal-bridge.ts` exists with `updatePrincipalRuntimeFromTaskEvent` and `resolvePrincipalStateDir`.
- [x] `task-claim.ts` supports `--update-principal-runtime` and `--principal-state-dir`.
- [x] `task-report.ts`, `task-review.ts`, `task-release.ts` support `--principal-state-dir` and auto-update PR.
- [x] `main.ts` wires new CLI options.
- [x] `principal-sync-from-tasks.ts` exists with `--dry-run` and divergence detection.
- [x] `task-roster.ts` warns on `done` without WorkResultReport.
- [x] Focused tests cover all transition mappings, missing principal, invalid transition, multiple match, and command integration.
- [x] All task commands succeed independently of PR update failure.
- [x] No bridge code mutates task files, roster, assignments, reports, or reviews.
- [x] No derivative task-status files are created.

## Execution Notes

- `packages/layers/cli/src/lib/principal-bridge.ts` created with `TaskGovernanceEvent` union, `BridgeUpdateResult`, `resolvePrincipalStateDir`, and `updatePrincipalRuntimeFromTaskEvent`.
- Post-commit hooks wired into:
  - `task-claim.ts` — opt-in via `--update-principal-runtime`
  - `task-report.ts` — automatic best-effort
  - `task-review.ts` — automatic best-effort
  - `task-release.ts` — automatic best-effort
- `main.ts` updated with `--principal-state-dir` on claim/report/review/release, `--update-principal-runtime` on claim, and new `principal sync-from-tasks` command.
- `principal-sync-from-tasks.ts` created with `--dry-run`, divergence detection, and corrective transitions (does not create missing PR records).
- `task-roster.ts` updated to warn when `task roster done` is called without a WorkResultReport.
- Focused tests: `test/commands/principal-bridge.test.ts` — 21 tests covering all transitions, missing principal, multiple match, invalid transition, command integration, and sync-from-tasks (divergence detection, dry-run, no-runtime, no-divergence).
- `test/commands/task-roster.test.ts` — 16 tests including the done-without-report warning.
- Existing CLI tests: 42 files, 300 tests — all pass.
- `pnpm verify` passes (task file guard, typecheck, build, charters, ops-kit).
- Fix: `principal-sync-from-tasks.ts` — `no_correction` items with reason `"no divergence"` are no longer counted in `divergences_found`.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/principal-bridge.test.ts
pnpm verify
```

If `pnpm verify` is already known clean and only CLI files changed, prefer focused tests plus task-file guard.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
