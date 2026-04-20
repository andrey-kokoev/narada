# Task 190: Correct Task 189 Completion Reviewer Boundary

## Context

Task 189 corrected most constructor-loop residuals:

- `init -> refine -> plan` works without `--force`
- v1 task statuses are restricted
- planned tasks include normalized inputs, outputs, and acceptance
- `loop --dry-run` is non-mutating
- broad ERP planning claims residual-resolution tasks first

One authority boundary remains weak.

Current `completeTask()` records:

```js
reviewed_by: reviewer || claimant || task.claim.claimant || "unknown"
```

The CLI passes `args.reviewer`, but the usage string does not expose `--reviewer`, and the command succeeds without one.

This collapses executor and reviewer authority silently.

## Required Change

Make terminal completion explicitly reviewer-owned.

Implement one of these coherent options.

Recommended option:

```bash
usc complete --target <path> --task <id> --result <file> --reviewer <id> [--claimant <id>]
```

Rules:

- `--reviewer` is required.
- `reviewed_by` must come from `--reviewer`.
- do not default reviewer to claimant.
- update usage text and README/AGENTS examples if present.
- add a regression test or smoke fixture proving completion without reviewer fails.

Alternative option:

- rename executor result submission away from `complete`
- reserve `complete` for accepted review only

Do not keep the current silent fallback.

## Verification

Run:

```bash
rm -rf /tmp/narada.usc.review-boundary
pnpm usc -- init /tmp/narada.usc.review-boundary --name review-boundary --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.review-boundary --intent "I want ERP system" --domain erp --force
pnpm usc -- plan --target /tmp/narada.usc.review-boundary
TASK_ID=$(pnpm --silent usc -- next --target /tmp/narada.usc.review-boundary --claimant smoke --format json | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>console.log(JSON.parse(s).task.id))')
mkdir -p /tmp/narada.usc.review-boundary/usc/artifacts
printf '{"ok":true}\n' > /tmp/narada.usc.review-boundary/usc/artifacts/result.json
pnpm usc -- complete --target /tmp/narada.usc.review-boundary --task "$TASK_ID" --result /tmp/narada.usc.review-boundary/usc/artifacts/result.json --claimant smoke && exit 1 || true
pnpm usc -- complete --target /tmp/narada.usc.review-boundary --task "$TASK_ID" --result /tmp/narada.usc.review-boundary/usc/artifacts/result.json --claimant smoke --reviewer reviewer-smoke
pnpm usc -- validate --app /tmp/narada.usc.review-boundary
rm -rf /tmp/narada.usc.review-boundary
pnpm validate
```

Expected:

- completion without `--reviewer` fails
- completion with `--reviewer` succeeds
- completed task records `reviewed_by: "reviewer-smoke"`

## Definition Of Done

- [ ] `complete` requires explicit reviewer identity.
- [ ] reviewer identity is not inferred from claimant.
- [ ] CLI usage documents `--reviewer`.
- [ ] validation/smoke covers the missing-reviewer failure.
- [ ] `pnpm validate` passes.
- [ ] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

**Date:** 2026-04-13

### Changes Made

| File | Change |
|------|--------|
| `packages/compiler/src/task-lifecycle.js` | `completeTask` throws if `reviewer` is missing; `reviewed_by` set strictly from `reviewer` arg |
| `packages/cli/src/usc.js` | Usage string shows `--reviewer` as required |
| `packages/compiler/src/executors/manual.js` | Instruction artifact mentions `--reviewer` |

### Behavior

```bash
# Fails
usc complete --target <repo> --task <id> --result <file> --claimant smoke
# Error: Completion requires an explicit reviewer. Use --reviewer <id>.

# Succeeds
usc complete --target <repo> --task <id> --result <file> --claimant smoke --reviewer reviewer-smoke
# reviewed_by: "reviewer-smoke" (not defaulted to claimant)
```

### Verification

- `complete` without `--reviewer` → fails with clear error
- `complete` with `--reviewer reviewer-smoke` → succeeds, records `reviewed_by: reviewer-smoke`
- `pnpm validate` → 43/43 passed
- Working tree clean

### Commit

`ec0cf8b` — fix(usc): require explicit reviewer for task completion

### Residual Work

None.
