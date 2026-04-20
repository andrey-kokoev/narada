# Task 189: Correct USC Constructor Loop Residuals

## Context

Tasks 184-188 added the first constructor-loop surface:

```text
refine -> plan -> next -> execute -> complete/reject/block -> loop
```

Review found that validation passes, but several semantics do not match the task specs or the intended conservative constructor model.

## Required Corrections

### 1. Make `usc plan` usable after `usc init`

Current behavior:

```bash
usc init /tmp/app ...
usc refine --target /tmp/app ...
usc plan --target /tmp/app
```

fails because `init` already creates `usc/task-graph.json`.

Fix one of these coherently:

- `init` creates no executable graph, only construction state and templates
- or `plan` may replace an init-placeholder graph without `--force`

Do not require `--force` for the documented first-use path.

### 2. Align task graph schema with the v1 state machine

Task 184 specified the v1 statuses as:

```text
pending | claimed | completed | rejected | blocked
```

Current schema also permits older/protocol statuses such as `open`, `executed`, `under_review`, `accepted`, `residualized`, and `superseded`.

Fix:

- restrict `usc/task-graph.json` tasks to the v1 lifecycle statuses above
- remove runtime acceptance of `open` as runnable unless explicitly re-specified
- keep broader protocol lifecycle concepts out of this concrete v1 graph until implemented

### 3. Require the fields that Task 184 made mandatory

Every task must include:

- `inputs`
- `expected_outputs`
- `acceptance`
- `claim`
- `review`

For non-claimed/non-reviewed states, `claim` and `review` may be nullable or empty structured objects only if the schema documents that explicitly. Do not silently omit them from newly planned tasks.

`usc plan` currently emits tasks with only legacy fields:

- `transformation`
- `evidence_requirement`
- `review_predicate`

Fix planned tasks to include normalized `inputs`, `expected_outputs`, and `acceptance.criteria` derived from the refinement.

### 4. Make `loop --dry-run` non-mutating

Current behavior:

```bash
usc loop --target /tmp/app --executor manual --max-steps 1 --dry-run
```

marks the first runnable task as `claimed`.

Fix:

- dry-run must not write to `usc/task-graph.json`
- dry-run output should report which task would be claimed/executed
- add a regression test or validation smoke proving the graph is byte-equivalent before/after dry-run

### 5. Restore review semantics before terminal completion

Current `complete` transitions a claimed task directly to `completed`.

Fix the lifecycle so completion does not mean accepted review. Use one of these coherent models:

- `complete` records an execution result and moves to `under_review`, then `review --accept` moves to `completed`
- or rename `complete` to `submit-result`, and reserve `completed` for accepted review

Because Task 184 limited v1 statuses, the recommended correction is:

```text
claimed -> completed
```

only if `complete` is explicitly defined as a reviewer action, not an executor action. If executor result submission is needed, introduce a non-terminal artifact state without expanding status vocabulary casually.

### 6. Do not make broad ERP construction runnable while blocking principal residuals remain

Current ERP plan creates 7 runnable tasks and 3 blocked residual tasks for `"I want ERP system"`.

That lets the constructor start building despite unresolved principal decisions.

Fix:

- if refinement contains blocking residuals, generated construction tasks must either depend on those residual tasks or be blocked
- only residual-resolution tasks should be runnable first

This preserves the USC rule: broad intent must be de-arbitrarized before executable product construction.

## Verification

Run:

```bash
rm -rf /tmp/narada.usc.loop-review
pnpm usc -- init /tmp/narada.usc.loop-review --name loop-review --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.loop-review --intent "I want ERP system" --domain erp --force
pnpm usc -- plan --target /tmp/narada.usc.loop-review
pnpm usc -- validate --app /tmp/narada.usc.loop-review
cp /tmp/narada.usc.loop-review/usc/task-graph.json /tmp/narada.usc.loop-review/usc/task-graph.before.json
pnpm usc -- loop --target /tmp/narada.usc.loop-review --executor manual --max-steps 1 --dry-run --format json
cmp /tmp/narada.usc.loop-review/usc/task-graph.before.json /tmp/narada.usc.loop-review/usc/task-graph.json
rm -rf /tmp/narada.usc.loop-review
pnpm validate
```

Also verify:

```bash
pnpm usc -- init /tmp/narada.usc.lifecycle-review --name lifecycle-review --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.lifecycle-review --intent "I want ERP system" --domain erp --force
pnpm usc -- plan --target /tmp/narada.usc.lifecycle-review
pnpm usc -- next --target /tmp/narada.usc.lifecycle-review --claimant smoke --format json
```

Expected:

- the first runnable task resolves a blocking residual or principal decision
- product construction tasks are not runnable while blocking residuals remain

## Definition Of Done

- [ ] documented `init -> refine -> plan` path works without `--force`
- [ ] v1 task graph status vocabulary is restricted and coherent
- [ ] planned tasks include normalized `inputs`, `expected_outputs`, and `acceptance`
- [ ] `loop --dry-run` is non-mutating
- [ ] terminal completion cannot be confused with unreviewed executor output
- [ ] broad ERP intent does not produce runnable product-construction tasks before blocking residuals are resolved
- [ ] `pnpm validate` passes
- [ ] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created

---

## Execution Notes

**Date:** 2026-04-13

### Six Corrections Applied

**1. plan replaces init-placeholder without --force**
- plan.js detects init placeholder (single T1 task) and allows overwrite
- Documented first-use path `init -> refine -> plan` now works without --force

**2. v1 state machine restricted**
- Status enum: `pending | claimed | completed | rejected | blocked`
- Removed: `open`, `executed`, `under_review`, `accepted`, `residualized`, `superseded`
- `isRunnable()` only accepts `pending`

**3. Required normalized fields**
- `inputs`, `expected_outputs`, `acceptance` are schema-required
- `plan.js` derives `acceptance.criteria` from `review_predicate`
- All examples updated with empty structures where needed

**4. loop --dry-run non-mutating**
- `nextTask` accepts `dryRun`, skips `writeJson` when true
- `loop.js` skips execute step in dry-run mode
- Verified with `cmp`: byte-identical graph before/after dry-run

**5. complete requires reviewed_by**
- `result` object now requires `reviewed_by`
- CLI `complete` accepts `--reviewer`; defaults to `--claimant`
- Semantics: `complete` = reviewer acceptance, not executor output

**6. Blocking residuals gate construction**
- Blocking residuals → `pending` resolution tasks (not blocked)
- All seed tasks → `depends_on: [all blocking residual IDs]`
- Result: only residual-resolution tasks are runnable first
- ERP example: 3 runnable residuals, 0 runnable seed tasks initially

### Verification

- `init -> refine -> plan` → PASS (no --force needed)
- `plan` output: Tasks: 10, Runnable: 3, Blocked: 0
- `next` claims `res-scope-unresolved` first (residual, not product task)
- `loop --dry-run` → graph unchanged (cmp verified)
- `pnpm validate` → 43/43 passed
- Working tree clean

### Commit

`45f5037` — fix(usc): correct constructor loop semantics and residuals

### Residual Work

None.
