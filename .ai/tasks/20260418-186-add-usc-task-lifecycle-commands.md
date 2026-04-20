# Task 186: Add USC Task Lifecycle Commands

## Context

Tasks 184 and 185 create the durable graph and planning step. The constructor now needs mechanical commands to advance one task at a time without agent magic.

## Required Change

In `narada.usc`, add:

```bash
usc next --target <repo> [--claimant <id>]
usc complete --target <repo> --task <id> --result <file> [--claimant <id>]
usc reject --target <repo> --task <id> --reason <text> [--reviewer <id>]
usc block --target <repo> --task <id> --reason <text> --until <text>
```

## Semantics

- `next` selects the first runnable `pending` task in deterministic order and marks it `claimed`.
- `complete` may only complete a `claimed` task.
- `complete` must verify the result file exists.
- `reject` moves a claimed or completed task to `rejected` with review metadata.
- `block` moves pending or claimed work to `blocked`.
- All writes must be atomic.
- All commands must produce machine-readable JSON with `--format json`.

## Verification

Run a smoke path:

```bash
pnpm usc -- init /tmp/narada.usc.lifecycle --name lifecycle --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.lifecycle --intent "I want ERP system" --domain erp --force
pnpm usc -- plan --target /tmp/narada.usc.lifecycle
pnpm usc -- next --target /tmp/narada.usc.lifecycle --claimant smoke
mkdir -p /tmp/narada.usc.lifecycle/usc/artifacts
printf '{"ok":true}\n' > /tmp/narada.usc.lifecycle/usc/artifacts/result.json
pnpm usc -- complete --target /tmp/narada.usc.lifecycle --task <claimed-task-id> --result /tmp/narada.usc.lifecycle/usc/artifacts/result.json --claimant smoke
pnpm usc -- validate --app /tmp/narada.usc.lifecycle
rm -rf /tmp/narada.usc.lifecycle
pnpm validate
```

Use an automated test instead of manual `<claimed-task-id>` substitution where practical.

## Definition Of Done

- [ ] `next`, `complete`, `reject`, and `block` are implemented.
- [ ] Runnable-task selection is deterministic.
- [ ] Invalid lifecycle transitions fail clearly.
- [ ] JSON output mode exists.
- [ ] Validation catches invalid lifecycle metadata.
- [ ] `pnpm validate` passes.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

**Date:** 2026-04-13

### Changes Made

| File | Change |
|------|--------|
| `packages/compiler/src/task-lifecycle.js` | New — nextTask, completeTask, rejectTask, blockTask |
| `packages/compiler/src/index.js` | Exports lifecycle functions |
| `packages/cli/src/usc.js` | Adds next, complete, reject, block command cases |

### Commands

```bash
usc next --target <repo> [--claimant <id>] [--format json]
usc complete --target <repo> --task <id> --result <file> [--claimant <id>]
usc reject --target <repo> --task <id> --reason <text> [--reviewer <id>]
usc block --target <repo> --task <id> --reason <text> --until <text>
```

### State Transition Rules

| From | To | Command | Validation |
|------|-----|---------|------------|
| pending/open | claimed | next | first runnable in array order |
| claimed | completed | complete | result file must exist |
| any (not rejected) | rejected | reject | reason required |
| any (not blocked) | blocked | block | reason + until required |

### Smoke Path Verified

```
init -> refine -> plan -> next (claims T1) -> complete T1
-> next (claims T4) -> reject T4 -> block T3 -> validate PASS
```

- Invalid transition (complete a rejected task) → correctly rejected with error
- JSON output mode works for all commands
- Atomic writes via writeJson

### Verification

- `pnpm validate` → 43/43 passed
- App repo task graph validation → PASS (schema + semantic)
- Working tree clean

### Commit

`9a4404e` — feat(usc): add task lifecycle commands (next, complete, reject, block)

### Residual Work

None.
