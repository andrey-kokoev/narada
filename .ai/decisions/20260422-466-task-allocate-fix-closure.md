---
closes_tasks: [466]
---

# Closure Decision: Task 466 — Correct Task Allocate CLI Runtime Failure

**Date**: 2026-04-22
**Task**: 466 — Correct Task Allocate CLI Runtime Failure
**Verdict**: Closed

## Summary

Task 466 fixed the `narada task allocate` command which was failing with `Cannot read properties of undefined (reading 'length')` due to a shape mismatch between the allocator code (expecting `reserved`/`released` number arrays) and the on-disk registry (using `reservations` array of objects from Tasks 450/455).

## Changes Delivered

- `task-governance.ts`: `loadRegistry` now normalizes reservation-era registries by deriving `reserved`/`released` from `reservations`. Only active (non-released) reservations map to `reserved`; released reservations are historical records, not reusable numbers.
- `task-governance.ts`: Added `previewNextTaskNumber()` for read-only next-number preview.
- `task-allocate.ts`: Added `--dry-run` support.
- `main.ts`: Wired `--dry-run` and `--format` CLI options for `task allocate`.
- Tests: 12 focused tests covering legacy registry, reservation-era registry, empty reservations, JSON/human output, temp-file cleanup, and dry-run immutability.

## Verification

- `pnpm typecheck` clean
- 12/12 focused tests pass
- 36/36 tests pass across `task-allocate.test.ts` + `task-governance.test.ts`
- `narada task allocate --cwd . --dry-run --format json` returns correct next number without mutation

## Residuals

None. Task-number allocation is now mechanically reliable.
