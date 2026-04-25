# Task 242: Correct narada show unknown-scope fallback

## Why

Task 241 hardened the inspection surface, but review found that `packages/layers/cli/src/commands/show.ts` silently fell back to the first scope when `--scope` was provided but not found. For inspection commands, this could show evaluation/decision/execution data from the wrong operation.

## Goal

Unknown explicit `--scope` must hard-fail. Missing `--scope` should continue to default to the first scope.

## Required Work

### 1. Fix show.ts

Update `packages/layers/cli/src/commands/show.ts`:
- If `options.scope` is provided and no matching `config.scopes` entry exists, return `INVALID_CONFIG` with error `Scope not found: <scope>`.
- If `options.scope` is absent, keep current default-to-first-scope behavior.
- Preserve existing multi-mailbox behavior (already handled correctly).

### 2. Add focused test

Update `packages/layers/cli/test/commands/show.test.ts`:
- Add test proving unknown `--scope` returns `INVALID_CONFIG`.
- Ensure it does not inspect the first/default scope.

## Execution Notes

**Bug location:** `show.ts` line 86:
```typescript
const scope = config.scopes.find((s) => s.scope_id === options.scope) ?? config.scopes[0];
```

**Fix:** Branch on whether `options.scope` is provided:
- Provided → exact lookup, hard-fail if not found
- Absent → fallback to `config.scopes[0]`

**Multi-mailbox path:** Already correct (lines 61-72). Unknown mailbox returns `Mailbox not found: <id>`.

## Verification

```bash
cd packages/layers/cli && npx vitest run test/commands/show.test.ts
```

Result: 9/9 tests pass.

## Definition of Done

- [x] Unknown explicit `--scope` returns `INVALID_CONFIG` with clear error message.
- [x] Missing `--scope` still defaults to first scope.
- [x] Multi-mailbox behavior unchanged.
- [x] Focused test passes.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files created.
