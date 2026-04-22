---
status: closed
depends_on: [450, 455]
closed_at: 2026-04-22T16:00:00.000Z
closed_by: a2
---

# Task 466 — Correct Task Allocate CLI Runtime Failure

## Context

`narada task allocate` is the canonical operator for allocating task numbers. It currently fails at runtime:

```bash
$ node packages/layers/cli/dist/main.js task allocate --cwd .
Cannot read properties of undefined (reading 'length')
```

This forced manual edits to `.ai/tasks/.registry.json` while creating Tasks 465 and 466. Manual allocation is acceptable as an emergency fallback, but it is not acceptable as the normal path. Task-number allocation is now a governed substrate and must be mechanically reliable.

## Goal

Fix `narada task allocate` so task numbers can be allocated through the CLI without runtime errors.

## Required Work

### 1. Reproduce and locate the failure

Reproduce with:

```bash
node packages/layers/cli/dist/main.js task allocate --cwd .
```

Inspect:

- `packages/layers/cli/src/commands/task-allocate.ts`
- `packages/layers/cli/src/lib/task-governance.ts`
- roster/registry helpers touched by Tasks 450 and 455
- command wrapper/formatter behavior if needed

Find the exact `undefined.length` source. Do not paper over the error with broad catch blocks.

### 2. Fix allocator behavior

The command must:

- read `.ai/tasks/.registry.json`;
- allocate the next task number after `last_allocated`;
- update `last_allocated`;
- append or update a reservation/record if that is the intended allocator contract;
- use race-safe mutation/lock behavior introduced by Task 455 where applicable;
- print a clear human result;
- emit structured JSON under `--format json`.

If current registry shape differs from what allocator expects, make the allocator tolerant of current valid registry files rather than forcing manual migration.

### 3. Add focused tests

Add tests covering:

- normal allocation from a registry with `last_allocated`;
- allocation when `reservations` exists and is empty;
- allocation when `reservations` has released records;
- JSON output;
- human output does not throw;
- race-safe write path does not leave temp files behind.

Use temporary directories and synthetic `.ai/tasks/.registry.json` fixtures.

### 4. Verify current repo command

After the fix, run:

```bash
node packages/layers/cli/dist/main.js task allocate --cwd . --format json
```

But do not consume a real task number in the repo as part of verification unless the command supports a dry-run. If no dry-run exists, add one or verify via tests only.

### 5. Consider adding dry-run

If straightforward, add:

```bash
narada task allocate --dry-run
```

Dry-run should report the next allocatable number without mutating `.registry.json`.

If adding dry-run is not straightforward, document why and create a follow-up only if necessary.

## Non-Goals

- Do not redesign task range reservation.
- Do not renumber existing tasks.
- Do not change task file naming rules.
- Do not modify unrelated roster commands.
- Do not run broad test suites by default.

## Execution Notes

### Root Cause

The `.registry.json` in the repo uses the reservation-era shape introduced by Tasks 450/455:

```json
{
  "version": 1,
  "last_allocated": 469,
  "reservations": [{ "range_start": 454, "range_end": 454, "status": "released", ... }]
}
```

The `allocateTaskNumber()` function in `task-governance.ts` accesses `registry.released.length` (line 875). Because the parsed JSON has no `released` key, `registry.released` is `undefined`, and reading `.length` throws:

```
Cannot read properties of undefined (reading 'length')
```

The `TaskRegistry` interface expected `{ version, last_allocated, reserved: number[], released: number[] }`, but the on-disk registry had been manually edited to use `reservations` (array of objects) instead.

### Fix

1. **Extended `TaskRegistry` interface** to optionally include `reservations` for round-trip compatibility.
2. **Hardened `loadRegistry`** to derive `reserved`/`released` from `reservations` when the direct arrays are missing. Critically, reservation `status: "released"` means the reservation was closed — it does NOT mean the number should be reused. Only active (non-released) reservations map to `reserved`. This prevents the allocator from reusing historical task numbers.
3. **Added `previewNextTaskNumber`** read-only helper for dry-run support.
4. **Added `--dry-run`** and `--format` CLI options to `task allocate`.

### Files Changed

- `packages/layers/cli/src/lib/task-governance.ts` — `TaskRegistry`, `loadRegistry`, `saveRegistry`, `previewNextTaskNumber`
- `packages/layers/cli/src/commands/task-allocate.ts` — `dryRun` option, dry-run path
- `packages/layers/cli/src/main.ts` — CLI wiring for `--dry-run`, `--format`
- `packages/layers/cli/test/commands/task-allocate.test.ts` — 12 tests (was 3)

### Verification

- `narada task allocate --cwd . --dry-run --format json` → `{ status: 'dry_run', next_number: 470 }`
- `narada task allocate --cwd . --dry-run` → prints next number, registry unchanged
- 12 focused tests pass (including reservation-era registry, empty reservations, legacy reuse, JSON/human output, temp-file cleanup, dry-run immutability)
- 36 tests pass across `task-allocate.test.ts` + `task-governance.test.ts`
- `pnpm typecheck` clean

## Acceptance Criteria

- [x] Root cause of `Cannot read properties of undefined (reading 'length')` is identified in execution notes.
- [x] `narada task allocate` no longer throws on the current repo registry shape.
- [x] Focused tests cover allocation and output behavior.
- [x] `--dry-run` added and does not mutate `.ai/tasks/.registry.json`.
- [x] No manual registry edits are required for normal future task allocation.
- [x] No documentation implied a broken command path (nothing to update).
