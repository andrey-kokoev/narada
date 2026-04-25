# Task 241: Task 231 Inspection Surface Hardening

## Chapter

Live Operation

## Why

Task 231 review (requested by user) identified three issues in the inspection surface implementation:

1. **Unsafe type casts in CLI**: `packages/layers/cli/src/commands/show.ts` cast `{ db }` to `CoordinatorStoreView` to call query functions. This is a runtime type hole — if any query function ever uses other store methods, the CLI will fail at runtime.
2. **Missing CLI tests**: The `narada show` command directly opens SQLite and queries it, but had no tests.
3. **Inaccurate task documentation**: Task 231 claimed "5 new tests" but delivered 7; CLI interface description didn't match actual flag-based interface.

## Goal

Harden the inspection surface without changing UI or API behavior.

## Required Work

### 1. Narrow Query Parameter Types

In `packages/layers/control-plane/src/observability/queries.ts`, change the four detail query functions to accept `Pick<CoordinatorStoreView, "db">` instead of `CoordinatorStoreView`:

- `getEvaluationDetail`
- `getDecisionDetail`
- `getExecutionDetail`
- `getEvaluationsByContextDetail`

These functions only use `.db`; the narrower type makes the contract honest.

### 2. Fix CLI Unsafe Casts

In `packages/layers/cli/src/commands/show.ts`, remove the `as CoordinatorStoreView` casts. The narrowed parameter type accepts `{ db }` directly.

### 3. Add CLI Tests

Create `packages/layers/cli/test/commands/show.test.ts` with focused tests:

- Evaluation detail in JSON format
- Decision detail in JSON format
- Execution detail in JSON format
- Missing evaluation/decision/execution returns error
- Missing database returns error
- Human-readable output format

Follow the existing `confirm-replay.test.ts` pattern: unmock `node:fs`, create a real temp SQLite database, insert fixture data via raw SQL, run `showCommand`, assert on results.

### 4. Update Task 231 Documentation

Update Task 231 execution notes to:
- Correct test count from 5 to 7 control-plane tests
- Document the 8 new CLI tests
- Note the actual CLI flag interface (`--type`, `--id`)
- Reference this corrective task

## Non-Goals

- Do not change UI behavior.
- Do not change API routes or response shapes.
- Do not add new query functions or types.
- Do not create derivative task files.

## Acceptance Criteria

- [x] `getEvaluationDetail`, `getDecisionDetail`, `getExecutionDetail`, `getEvaluationsByContextDetail` accept `Pick<CoordinatorStoreView, "db">`.
- [x] CLI `show.ts` has no `as CoordinatorStoreView` casts.
- [x] `pnpm -r typecheck` passes.
- [x] `packages/layers/cli/test/commands/show.test.ts` exists and all tests pass.
- [x] Existing CLI tests (`status`, `config`) still pass.
- [x] Task 231 execution notes updated with corrected test counts and CLI interface note.
- [x] No derivative status files created.

## Execution Notes

### Type Narrowing
- Changed 4 function signatures in `observability/queries.ts` from `store: CoordinatorStoreView` to `store: Pick<CoordinatorStoreView, "db">`.
- Rebuilt control-plane package so `.d.ts` exports reflect the narrowed types.

### CLI Fix
- Removed 3 `as import('@narada2/control-plane').CoordinatorStoreView` casts from `show.ts` switch statement.
- `{ db }` now passes typecheck directly against `Pick<CoordinatorStoreView, "db">`.

### CLI Tests
- Created `packages/layers/cli/test/commands/show.test.ts` with 8 tests.
- Uses real SQLite database (unmocked fs) following `confirm-replay.test.ts` pattern.
- Fixture data: context record, work item, execution attempt, evaluation, foreman decision.
- Tests cover all three entity types, missing entities, missing database, and human-readable format.

### Verification
- `pnpm -r typecheck` — passes all 8 packages.
- `pnpm build` — succeeds.
- `npx vitest run test/commands/show.test.ts` (in CLI package) — 8/8 pass.
- `npx vitest run test/commands/status.test.ts test/commands/config.test.ts` — 11/11 pass.
