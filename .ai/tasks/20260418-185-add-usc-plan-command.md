# Task 185: Add USC Plan Command

## Context

Task 184 adds the durable construction task graph model. The next step is to convert a refinement into a first executable graph.

`usc refine` currently produces decision-relevant ambiguity, questions, residuals, and seed tasks. Those seed tasks need to become normalized graph tasks.

## Required Change

In `narada.usc`, add:

```bash
usc plan --target <repo> [--from <refinement-file>] [--force]
```

Behavior:

- Load the target app repo.
- Load the latest refinement unless `--from` is provided.
- Convert refinement seed tasks into `usc/task-graph.json`.
- Preserve existing graph unless `--force` is passed.
- Emit a concise summary: task count, runnable count, blocked count.

## Semantics

- `plan` does not execute tasks.
- `plan` does not invent app code.
- `plan` may create coarse construction tasks, but every task must have explicit acceptance criteria.
- If refinement still contains unresolved critical questions, `plan` may emit blocked tasks instead of pretending the system is buildable.

## Verification

Run:

```bash
pnpm usc -- init /tmp/narada.usc.erp --name erp --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.erp --intent "I want ERP system" --domain erp --force
pnpm usc -- plan --target /tmp/narada.usc.erp
pnpm usc -- validate --app /tmp/narada.usc.erp
rm -rf /tmp/narada.usc.erp
pnpm validate
```

## Definition Of Done

- [ ] `usc plan` creates a valid task graph from refinement output.
- [ ] `usc plan` refuses to overwrite an existing graph unless `--force`.
- [ ] ERP refinement produces a graph with explicit acceptance criteria.
- [ ] Validation passes against the generated app repo.
- [ ] `pnpm validate` passes.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

**Date:** 2026-04-13

### Changes Made

| File | Change |
|------|--------|
| `packages/compiler/src/plan.js` | New — converts refinement seed tasks into task graph |
| `packages/compiler/src/index.js` | Exports `plan` |
| `packages/cli/src/usc.js` | Adds `plan` command case and help text |

### Plan Command

```bash
usc plan --target <repo> [--from <refinement-file>] [--force]
```

- Loads refinement from `usc/refinement.json` (or `--from` path)
- Converts seed tasks to pending graph tasks with `depends_on: []`
- Emits blocked tasks for each blocking residual
- Refuses to overwrite existing task graph unless `--force`
- Prints summary: `Tasks: N, Runnable: R, Blocked: B`

### Verification

- `usc init /tmp/narada.usc.erp --name erp --principal "Test Principal" --intent "I want ERP system" --cis` → PASS
- `usc refine --target /tmp/narada.usc.erp --intent "I want ERP system" --domain erp --force` → PASS
- `usc plan --target /tmp/narada.usc.erp --force` → 10 tasks (7 runnable, 3 blocked)
- `usc plan --target /tmp/narada.usc.erp` (without --force) → correctly refuses
- `usc validate --app /tmp/narada.usc.erp` → PASS (schema + semantic)
- `pnpm validate` → 43/43 passed
- Working tree clean

### Commit

`8c380b1` — feat(usc): add plan command to convert refinement into task graph

### Residual Work

None.
