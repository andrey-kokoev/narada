# Task 159: Correct Task 153 Authority Boundary Reality

## Source

Review of executed Task 153 found remaining contradictions between the lawbook authority section and current implementation.

## Why

The kernel lawbook is normative. If it says only one actor owns a transition while the implementation allows another actor, future agents will either preserve the wrong invariant or “fix” valid code incorrectly.

## Findings To Correct

### 1. Foreman failure authority is incomplete

`packages/layers/control-plane/docs/00-kernel.md` says only `DefaultForemanFacade.resolveWorkItem()` may transition a work item to terminal status based on charter output.

Current implementation also has:

- `DefaultForemanFacade.failWorkItem()` transitioning work items to `failed_retryable` / `failed_terminal`
- daemon dispatch calling `foreman.failWorkItem()` after scheduler execution failures
- daemon dispatch calling `foreman.failWorkItem()` after stale lease recovery

The lawbook must name both Foreman paths:

- `resolveWorkItem()` owns evaluation/governance-based resolution
- `failWorkItem()` owns runtime/lease/execution failure classification

### 2. Scheduler boundary still claims semantic failure transitions

`00-kernel.md` says scheduler may transition work items between `opened ↔ leased ↔ executing ↔ failed_retryable`.

Current intended model:

- Scheduler owns leases and mechanical execution-attempt lifecycle.
- Scheduler may move work into `leased` / `executing`.
- Scheduler may release leases and mark execution attempts crashed/abandoned.
- Scheduler does **not** semantically classify work-item failure.
- Foreman classifies recovered/crashed work items via `failWorkItem()`.
- Scheduler may scan already-`failed_retryable` work when retry backoff has elapsed.

Update the lawbook wording accordingly.

### 3. Operator action authority is omitted

Operator actions can directly mutate failed work items through the audited control surface:

- retrying a `failed_retryable` item clears `next_retry_at`
- acknowledging a failed item transitions/keeps it as `failed_terminal`

If this path remains allowed, document it explicitly as **audited operator-control authority**, separate from observation. Do not leave the lawbook implying Foreman/Scheduler are the only work-item mutation paths.

### 4. Architecture doc has the same stale boundary wording

Although Task 153 was scoped to `00-kernel.md`, `packages/layers/control-plane/docs/02-architecture.md` repeats the stale authority bullets. Update it in the same patch so the docs do not immediately contradict each other.

## Deliverables

- `packages/layers/control-plane/docs/00-kernel.md` authority boundaries match current implementation.
- `packages/layers/control-plane/docs/02-architecture.md` authority boundaries match `00-kernel.md`.
- Scheduler wording distinguishes mechanical lease/execution lifecycle from semantic failure classification.
- Foreman wording includes both `resolveWorkItem()` and `failWorkItem()`.
- Operator-control authority is explicitly documented and separated from observation.

## Definition Of Done

- [x] No lawbook wording says scheduler owns semantic transition to `failed_retryable`.
- [x] No lawbook wording implies `resolveWorkItem()` is Foreman’s only failure path.
- [x] Operator action work-item mutation is documented as audited control authority.
- [x] `00-kernel.md` and `02-architecture.md` no longer contradict each other on authority boundaries.
- [x] No derivative task-status files are created.

## Execution Notes

### `packages/layers/control-plane/docs/00-kernel.md` §6

Expanded from 7 to 9 boundaries:

1. **Foreman owns work opening** — unchanged.
2. **Foreman owns resolution** — unchanged (`resolveWorkItem()` for governance-based terminal transitions).
3. **Foreman owns failure classification** — **NEW**. `failWorkItem()` is the sole path for runtime/lease/execution failure classification to `failed_retryable` / `failed_terminal`.
4. **Scheduler owns leases and mechanical execution lifecycle** — **REWORDED**. The scheduler transitions work items into `leased` / `executing`, releases leases, and marks execution attempts crashed/abandoned. It does **not** semantically classify work-item failure status.
5. **IntentHandoff owns intent creation** — unchanged.
6. **OutboundHandoff owns command creation** — unchanged.
7. **Executors own mutation** — unchanged.
8. **Charter runtime is read-only sandbox** — unchanged.
9. **Audited operator control** — **NEW**. Operator console mutations go through `executeOperatorAction()` with safelisted actions; every action is logged to `operator_action_requests`.

### `packages/layers/control-plane/docs/02-architecture.md` §Authority Boundaries

Updated to match `00-kernel.md`:
- Added boundary 3: Foreman owns failure classification (`failWorkItem()`)
- Reworded boundary 4 (was 3): Scheduler owns leases and mechanical execution lifecycle
- Added boundary 8: Audited operator control
- Renumbered remaining boundaries accordingly

## Verification

- `pnpm --filter=@narada2/control-plane typecheck` — passes
- `test/unit/foreman/facade.test.ts` — 21 tests passed
- `test/unit/scheduler/scheduler.test.ts` — 16 tests passed
- `test/unit/observability/authority-guard.test.ts` — 25 tests passed
- `test/unit/observability/authority-guardrails.test.ts` — 4 tests passed
