---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
depends_on: [560]
---

# Task 561 - Task Recommend Empty Result Human Output

## Goal

Make `narada task recommend` report an empty recommendation set honestly in human mode instead of printing the misleading fallback `Recommendation failed`.

## Why

After recommendation candidate filtering was hardened, repo-wide recommendation can legitimately return:

- no primary recommendation
- no alternatives
- abstained blocked tasks only

That is not a runtime failure. It is a valid empty result. The CLI should say so plainly.

## Required Work

1. Inspect the CLI path that turns `taskRecommendCommand()` result into process output and exit code.
2. Preserve machine-readable behavior for JSON callers unless there is a strong reason to change it.
3. In human CLI mode, replace the generic failure fallback with explicit empty-result language.
4. Add focused tests for:
   - empty recommendation result in human mode
   - actual command failure still reported as failure
5. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Human CLI output says "no recommendations available" (or equivalent) for a valid empty result
- [x] Actual runtime failures still report as failures
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

The CLI path has two layers:
1. `taskRecommendCommand()` in `packages/layers/cli/src/commands/task-recommend.ts` — produces the recommendation and returns `{ exitCode, result }`
2. `main.ts` action handler — prints output and exits based on `exitCode`

**Problem identified**: When `taskRecommendCommand` returns `exitCode.GENERAL_ERROR` for a valid empty result (`primary === null`), `main.ts` unconditionally prints `Recommendation failed` to stderr. This overwrites the honest "No recommendations available." message that the command already printed in human mode.

### Fix

**`task-recommend.ts`**:
- Wrapped the entire command body in try/catch
- Actual exceptions now return `{ exitCode: GENERAL_ERROR, result: { error: message } }` instead of bubbling uncaught
- Empty results continue to return `{ exitCode: GENERAL_ERROR, result: TaskRecommendation }` with `primary: null`

**`main.ts`** (recommend command action):
- When `exitCode !== 0`, distinguish three cases:
  1. `result.error` exists → actual runtime error; print error to stderr
  2. `result.primary === null` → valid empty recommendation; for JSON mode, output the JSON result to stdout; for human mode, the command already printed the appropriate message
  3. Otherwise → fallback `Recommendation failed`

### Test Coverage

Added 2 tests in `test/commands/task-recommend.test.ts`:
1. **"reports empty recommendation honestly in human mode"**
   - Sets all tasks to `claimed` so no recommendations are available
   - Calls with `format: 'human'`
   - Verifies console output contains `"No recommendations available."`
   - Verifies console output does NOT contain `"Recommendation failed"`
2. **"reports actual command failure as failure"**
   - Mocks `generateRecommendations` to throw `"Simulated engine failure"`
   - Verifies `exitCode` is `GENERAL_ERROR`
   - Verifies `result.error` is `"Simulated engine failure"`

### Verification

- `task-recommend.test.ts`: 30/30 passing ✅
- CLI full suite: 672/673 passing (1 pre-existing failure in `task-claim.test.ts`, unrelated) ✅
- Typecheck: clean for modified files (`task-recommend.ts`, `main.ts`); pre-existing unrelated error in `task-lifecycle-store.ts` ✅

### Behavior Changes

| Mode | Before | After |
|------|--------|-------|
| Human, empty result | Prints "No recommendations available." then "Recommendation failed" to stderr | Prints "No recommendations available." only |
| JSON, empty result | Exit code 1, stderr: "Recommendation failed", stdout: empty | Exit code 1, stderr: empty, stdout: JSON result with abstained/alternatives |
| Human/JSON, actual error | Uncaught exception (bubbled to CLI framework) | Exit code 1, stderr: error message |

---

**Closed by:** a2  
**Closed at:** 2026-04-24

