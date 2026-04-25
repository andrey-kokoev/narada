# Task 187: Add USC Task Executor Adapter

## Context

The constructor loop needs execution, but executor implementation must remain an adapter. The graph should not know whether work is done by Kimi, Codex, a shell script, or a human.

## Required Change

In `narada.usc`, define a first executor interface:

```text
TaskExecutor.run(task, repo, context) -> ExecutionResult
```

Add a simple CLI command:

```bash
usc execute --target <repo> --task <id> --executor <name> [--dry-run]
```

Implement at least one safe executor:

- `manual`: writes an execution instruction artifact and exits without mutating product code.

Optionally add one configured subprocess executor if already straightforward:

- `subprocess`: invokes a configured command with task context JSON on stdin.

## Semantics

- Execution must produce an artifact under `usc/artifacts/`.
- Execution must not mark the task complete directly.
- Execution returns a result file path that `usc complete` can consume.
- Executor config must be explicit.
- No hardcoded Kimi/Codex dependency in graph schema.

## Verification

Run:

```bash
pnpm usc -- init /tmp/narada.usc.exec --name exec --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.exec --intent "I want ERP system" --domain erp --force
pnpm usc -- plan --target /tmp/narada.usc.exec
pnpm usc -- next --target /tmp/narada.usc.exec --claimant smoke --format json
pnpm usc -- execute --target /tmp/narada.usc.exec --task <claimed-task-id> --executor manual --dry-run
pnpm usc -- validate --app /tmp/narada.usc.exec
rm -rf /tmp/narada.usc.exec
pnpm validate
```

Use automated tests for task-id extraction where practical.

## Definition Of Done

- [ ] Executor interface exists.
- [ ] `manual` executor creates a deterministic artifact.
- [ ] Execution does not bypass `complete`.
- [ ] Executor output can be consumed by lifecycle commands.
- [ ] `pnpm validate` passes.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

**Date:** 2026-04-13

### Changes Made

| File | Change |
|------|--------|
| `packages/compiler/src/executors/index.js` | Executor registry with `runExecutor()` adapter |
| `packages/compiler/src/executors/manual.js` | Manual executor — writes instruction artifact |
| `packages/compiler/src/executors/subprocess.js` | Subprocess executor — invokes configured command |
| `packages/compiler/src/execute.js` | `executeTask()` orchestrates loading task and delegating to executor |
| `packages/compiler/src/index.js` | Exports `executeTask` |
| `packages/cli/src/usc.js` | Adds `execute` command case |

### Executor Interface

```javascript
runExecutor({ executorName, task, repoDir, context }) -> {
  artifactPath, exitCode, stdout, stderr
}
```

### CLI

```bash
usc execute --target <repo> --task <id> --executor <name> [--dry-run]
```

### Executors

| Name | Behavior |
|------|----------|
| `manual` | Writes `usc/artifacts/<task-id>-instructions.md` with task details |
| `subprocess` | Runs `usc/executor-config.json` command with task JSON on stdin |

### Verification

- `init -> refine -> plan -> next -> execute --dry-run -> execute (manual)` → PASS
- Dry-run correctly previews without side effects
- Execution does not mark task complete (task remains claimed)
- `pnpm validate` → 43/43 passed
- Working tree clean

### Commit

`b043b35` — feat(usc): add task executor adapter (manual + subprocess)

### Residual Work

None.
