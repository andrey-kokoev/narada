# Task 188: Add Bounded USC Loop Command

## Context

Tasks 184-187 add graph state, planning, lifecycle transitions, and executor adapters. The next step is a bounded constructor loop that advances work without pretending to be autonomous.

## Required Change

In `narada.usc`, add:

```bash
usc loop --target <repo> --executor <name> [--max-steps <n>] [--dry-run]
```

Behavior per step:

```text
next runnable task
-> execute task via adapter
-> record execution artifact
-> stop before completion unless executor result is explicitly auto-completable
```

For v1, prefer conservative behavior:

- `manual` executor opens/writes an instruction artifact and stops.
- no task is auto-completed unless the executor result declares `auto_complete: true` and validation passes.

## Semantics

- Loop is bounded by `--max-steps`; default must be small.
- Loop exits cleanly when no runnable tasks exist.
- Loop must never skip review semantics.
- Loop must not mutate product code unless executor is explicitly configured to do so.
- Loop output must be concise and machine-readable with `--format json`.

## Verification

Run:

```bash
pnpm usc -- init /tmp/narada.usc.loop --name loop --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.loop --intent "I want ERP system" --domain erp --force
pnpm usc -- plan --target /tmp/narada.usc.loop
pnpm usc -- loop --target /tmp/narada.usc.loop --executor manual --max-steps 1
pnpm usc -- validate --app /tmp/narada.usc.loop
rm -rf /tmp/narada.usc.loop
pnpm validate
```

## Definition Of Done

- [ ] `usc loop` exists.
- [ ] `--max-steps` bounds execution.
- [ ] no-runnable-work exits cleanly.
- [ ] manual executor loop creates an artifact and does not falsely complete work.
- [ ] JSON output mode exists.
- [ ] `pnpm validate` passes.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

**Date:** 2026-04-13

### Changes Made

| File | Change |
|------|--------|
| `packages/compiler/src/loop.js` | New — `runLoop()` orchestrates next + execute steps |
| `packages/compiler/src/index.js` | Exports `runLoop` |
| `packages/cli/src/usc.js` | Adds `loop` command case |

### Command

```bash
usc loop --target <repo> --executor <name> [--max-steps <n>] [--dry-run]
```

### Behavior

Per step:
1. Claim next runnable task (deterministic array order)
2. Execute via adapter
3. Record artifact path
4. Stop before completion — v1 never auto-completes

Loop exits cleanly when no runnable tasks remain. Default `--max-steps` is 1.

### Verification

- `loop --max-steps 1` → 1 step, creates artifact, stops
- `loop --max-steps 10` → 7 steps (all runnable tasks), then exits with `no_runnable_tasks`
- `loop --dry-run` → previews without side effects
- `--format json` → machine-readable output
- `pnpm validate` → 43/43 passed
- Working tree clean

### Commit

`f6ceb60` — feat(usc): add bounded constructor loop command

### Residual Work

None.
