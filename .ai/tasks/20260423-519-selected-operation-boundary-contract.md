---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T21:45:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [518]
---

# Task 519 - Selected Operation Boundary Contract

## Goal

Define the boundary contract for the selected second operation in Narada terms.

## Acceptance Criteria

- [x] Facts, work, evaluation, decision, intent, execution, and confirmation boundaries are explicit.
- [x] Forbidden shortcuts and v0 non-goals are explicit.
- [x] Reused vs new Narada components are identified.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research Phase

1. **Examined existing timer and process infrastructure** in `packages/layers/control-plane/src/`:
   - `TimerSource`, `TimerContextStrategy`, `TimerContextMaterializer` — all exist and tested
   - `ProcessExecutor`, `ProcessExecutionStore`, `ProcessConfirmationResolver` — all exist and tested
   - `INTENT_FAMILIES["process.run"]` — already registered with schema and validation
   - `governAction` with `validateProcessRunPayload` — already handles process_run governance

2. **Traced the full pipeline** from Source through Confirmation using existing code and tests:
   - Fact boundary: `timer.tick` type, deterministic slot identity, apply-log safety
   - Work boundary: `TimerContextStrategy` groups by `schedule_id`, foreman opens work items
   - Evaluation boundary: `TimerContextMaterializer` produces schedule metadata envelope
   - Decision boundary: foreman governance checks action against policy, payload validation
   - Intent boundary: `process.run` intent with `command`/`args`/`cwd`/`env`/`timeout_ms` schema
   - Execution boundary: `ProcessExecutor.spawn()` with lease model and stale recovery
   - Confirmation boundary: `ProcessConfirmationResolver` derives from exit code

3. **Identified forbidden shortcuts** by comparing against AGENTS.md critical invariants (§6, §9–13, §15, §19).

4. **Catalogued reused vs new components**: 15 kernel components reused without change; only 2 new components required (`maintenance_steward` charter prompt, timer config template).

### Deliverable

Created `.ai/decisions/20260423-519-selected-operation-boundary-contract.md` (21 KB) containing:
- Seven explicit boundary definitions (Fact through Confirmation)
- Full pipeline trace with data flow
- 10 forbidden shortcuts with correct paths
- 10 v0 non-goals with rationale
- Reused vs new component inventory
- Verification evidence table

## Verification

### Decision Artifact Verification

- Decision file exists: `.ai/decisions/20260423-519-selected-operation-boundary-contract.md` ✅
- File size: ~21 KB, comprehensive boundary coverage ✅
- Contains all required sections: 7 boundaries, shortcuts, non-goals, components, verification ✅

### Fixture Test Verification

All referenced tests passed:

```bash
# Timer + process integration tests
npx vitest run test/integration/control-plane/timer-to-process.test.ts
npx vitest run test/integration/control-plane/vertical-parity.test.ts

# Unit tests for boundaries
npx vitest run test/unit/sources/timer-source.test.ts
npx vitest run test/unit/executors/process-executor.test.ts
npx vitest run test/unit/executors/confirmation.test.ts
npx vitest run test/unit/foreman/context.test.ts
npx vitest run test/unit/foreman/governance.test.ts
```

Results:
- `timer-to-process.test.ts`: 4/4 pass ✅
- `vertical-parity.test.ts`: 4/4 pass ✅
- `timer-source.test.ts`: 8/8 pass ✅
- `process-executor.test.ts`: 11/11 pass ✅
- `confirmation.test.ts`: 13/13 pass ✅
- `context.test.ts`: 16/16 pass ✅
- `governance.test.ts`: 47/47 pass ✅

### Typecheck Verification

- `pnpm typecheck`: all 11 packages pass ✅

### Zero Kernel Change Verification

Confirmed that Timer → Process requires **no code changes** to:
- Source interface, Fact identity, Context formation interface
- Foreman admission invariants, Scheduler lease invariants
- Intent registry, Executor lifecycle, Observation boundary

This validates the core portability claim: the operation travels through the existing kernel without modification.
