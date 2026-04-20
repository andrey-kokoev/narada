# Task 247: Remove Accidental CLI Speed Profiling Tests

## Chapter

Operational Trust

## Context

Architect review found untracked files under `packages/layers/cli/test/`:

- `speed-test.test.ts`
- `speed-test2.test.ts`
- `speed-test3.test.ts`
- `speed-test4.test.ts`
- `speed-test5.test.ts`
- `speed-test6.test.ts`
- `speed-test7.test.ts`

These are ad-hoc profiling/debug tests. They print timing output, contain arbitrary `elapsed < 5000` assertions, and in one file call a private method through `// @ts-ignore`.

They should not be part of the committed test suite.

## Required Work

### 1. Remove Speed Profiling Tests

Delete all accidental `packages/layers/cli/test/speed-test*.test.ts` files.

### 2. Preserve Legitimate Tests

Do not delete real command tests such as:

- `packages/layers/cli/test/commands/audit.test.ts`
- `packages/layers/cli/test/commands/reject-draft.test.ts`
- `packages/layers/cli/test/commands/mark-reviewed.test.ts`
- `packages/layers/cli/test/commands/handled-externally.test.ts`

### 3. Update Task Notes If Needed

If any task file claims these speed tests as verification, replace that claim with focused command/test verification.

## Non-Goals

- Do not add a benchmark framework.
- Do not add new profiling tests.
- Do not change production code.
- Do not create derivative task-status files.

## Execution Notes

Deleted 14 accidental speed-profiling test files from `packages/layers/cli/test/`:
- `speed-test.test.ts`
- `speed-test2.test.ts` through `speed-test10.test.ts`
- `speed-test-full.test.ts`
- `speed-test-full-tx.test.ts`
- `speed-test-indexes.test.ts`
- `speed-test-transaction.test.ts`

No other task files referenced these tests as verification. Legitimate command tests (`audit.test.ts`, `reject-draft.test.ts`, `mark-reviewed.test.ts`, `handled-externally.test.ts`) were preserved.

## Acceptance Criteria

- [x] No `packages/layers/cli/test/speed-test*.test.ts` files remain.
- [x] Legitimate command tests remain intact.
- [x] No task claims ad-hoc speed tests as acceptance evidence.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
