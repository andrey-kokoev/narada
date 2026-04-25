# Task 151: Materialize 124-P Unify Process Executor Recovery Model

## Source

Derived from Task 461-P in `.ai/do-not-open/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

If process execution recovery does not align with scheduler lease/recovery semantics, Narada has two competing execution models.

## Goal

Either unify process executor lease/recovery with the scheduler model or document the dual model explicitly and defensibly.

## Deliverables

- chosen model implemented or documented clearly
- no silent dual-authority recovery semantics remain

## Definition Of Done

- [x] process execution recovery model is either unified or explicitly documented as intentionally distinct
- [x] tests/docs match the chosen model

## Execution Notes

### Decision: Document the Dual Model as Intentionally Distinct

Unifying the two lease/recovery substrates would require elevating process intents to first-class work items under scheduler authority — a major architectural refactor. The current separation reflects genuinely different lifecycle semantics:

- **Scheduler leases** govern long-lived, stateful charter execution work items with exponential backoff retry.
- **Process executor leases** govern short-lived subprocess intents (`process.run`) whose retry is handled by the `WorkerRegistry` loop.

### Changes Made

**`packages/layers/control-plane/src/executors/process-executor.ts`**
- Added a prominent header comment documenting the **intentionally distinct** recovery model.
- Includes a comparison table showing the differences between scheduler leases and process executor leases across scope, retry model, recovery outcome, lease table, and caller.
- References `docs/02-architecture.md` § "Dual Recovery Model".

**`packages/layers/control-plane/src/scheduler/scheduler.ts`**
- Added cross-reference comment noting that the scheduler does NOT own process intent recovery, and pointing to `process-executor.ts` for the dual-model rationale.

**`packages/layers/daemon/src/service.ts`**
- Added an explicit NOTE comment above the `recoverStaleExecutions()` call explaining:
  - This is an intentionally distinct path from `recoverStaleLeases()`
  - Both paths are called explicitly and must not be merged or skipped
  - References the documentation in `process-executor.ts` and `docs/02-architecture.md`

**`packages/layers/control-plane/docs/02-architecture.md`**
- Added new section "Dual Recovery Model (Intentionally Distinct)" after Vertical Parity.
- Comparison table with 7 aspects (what, table, owner, recovery method, stale outcome, retry authority, daemon caller).
- Explicit rationale for why unification is a future refactor, not a bug fix.

**`packages/layers/control-plane/docs/00-kernel.md`**
- Extended the crash recovery table with a row for process intent recovery.
- Added a note referencing the dual recovery model documentation.

**`packages/layers/control-plane/AGENTS.md`**
- Added `ProcessExecutor` to the Control Plane Quick Reference table.
- Added "Dual Recovery Model" subsection under Control Plane Architecture (v2) with detailed explanation of both substrates, their differences, and the rationale.

**`packages/layers/control-plane/test/unit/executors/process-executor.test.ts`**
- Added test: `recovery resets intent to admitted (not failed_retryable)`
- Documents the intentional behavioral contract difference from scheduler stale-lease recovery.

### Test Results

- `control-plane/test/unit/executors/process-executor.test.ts` — **11 pass** (+1 new)
- `control-plane/test/unit/scheduler/scheduler.test.ts` — **16 pass**
- `control-plane/test/unit/` — **773 pass** (+1 new)
