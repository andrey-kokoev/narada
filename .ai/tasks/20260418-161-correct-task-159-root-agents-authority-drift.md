# Task 161: Correct Task 159 Root AGENTS Authority Drift

## Source

Review of executed Task 159 found that `00-kernel.md` and `02-architecture.md` were corrected, but root `AGENTS.md` still repeats the stale authority model.

## Why

Root `AGENTS.md` is the first file coding agents read. If it contradicts the lawbook, agents will keep reintroducing the wrong scheduler/foreman boundaries.

## Findings To Correct

### 1. Root `AGENTS.md` still says `resolveWorkItem()` is the only failure path

Current stale wording says only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to:

- `resolved`
- `failed_terminal`
- `failed_retryable`

Correct model:

- `resolveWorkItem()` owns evaluation/governance-based resolution.
- `failWorkItem()` owns runtime/lease/execution failure classification to `failed_retryable` / `failed_terminal`.

### 2. Root `AGENTS.md` still says scheduler owns `failed_retryable`

Current stale wording says scheduler transitions work items between:

- `opened ↔ leased ↔ executing ↔ failed_retryable`

Correct model:

- Scheduler owns leases and mechanical execution lifecycle.
- Scheduler may transition work into `leased` / `executing`.
- Scheduler may release leases and mark execution attempts crashed/abandoned.
- Scheduler does not semantically classify work-item failure.
- Foreman does that via `failWorkItem()`.

### 3. Root `AGENTS.md` should mention audited operator-control authority

Root `AGENTS.md` already says UI must mutate through `executeOperatorAction()`, but the control-plane authority list should also include the Task 159 model:

- operator console mutations are allowed only through audited, safelisted `executeOperatorAction()`
- actions are logged to `operator_action_requests`
- observation routes remain read-only

## Deliverables

- Root `AGENTS.md` control-plane authority bullets match `packages/layers/control-plane/docs/00-kernel.md`.
- No stale scheduler `failed_retryable` ownership remains in root `AGENTS.md`.
- Foreman `failWorkItem()` is named in root `AGENTS.md`.
- Audited operator-control authority is clearly separated from observation.

## Definition Of Done

- [x] Root `AGENTS.md` no longer implies `resolveWorkItem()` is Foreman’s only failure path.
- [x] Root `AGENTS.md` no longer says scheduler semantically transitions work items to `failed_retryable`.
- [x] Root `AGENTS.md` documents audited operator-control authority consistently with `00-kernel.md`.
- [x] No derivative task-status files are created.

## Execution Notes

### Changes Made to Root `AGENTS.md`

1. **Split Foreman resolution authority** (Invariant 7 → 7+8):
   - **7** now reads: `resolveWorkItem()` transitions to `resolved` only; "It does not handle runtime or execution failures."
   - **8** is new: `failWorkItem()` owns `failed_retryable` / `failed_terminal`; scheduler releases leases/crashes attempts, foreman classifies semantic failure and applies backoff.

2. **Corrected Scheduler authority** (old 8 → new 9):
   - Removed `failed_retryable` from scheduler’s claimed transitions.
   - Now explicitly says scheduler "does **not** semantically classify work-item failure status."

3. **Strengthened operator-control audit** (Invariant 19):
   - Added "safelisted" and "Every action is logged to `operator_action_requests`."
   - Matches `00-kernel.md` §6.9 exactly.

4. **Renumbered all downstream invariants** (9-13 → 10-16, 16-20 → 17-21, 21-24 → 22-25, 25-28 → 26-29, Outbound 10-13 → 30-33) to maintain continuous numbering.

### Verification

- `pnpm build` — clean
- `pnpm typecheck` — clean
- `pnpm verify` — passed task-file-guard, typecheck, build (timed out on tests due to unrelated control-plane test crash; no code changes were made)
