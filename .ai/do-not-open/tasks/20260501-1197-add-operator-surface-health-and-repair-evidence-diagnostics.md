---
status: closed
closed_at: 2026-05-01T20:31:50.455Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add operator-surface health and repair-evidence diagnostics

## Chapter

operator-surface-binding-hardening

## Goal

Give operators and architects a compact health surface for binding uniqueness, overlay labels, stale HWNDs, and OSM readiness without manual JSON inspection.

## Context

Inbox envelope env_dac35992-728b-4f2e-abb3-27a1689ad975 records follow-up observations after duplicate-label and crossbinding incidents. It names misleading foreground-based mutation, lack of a doctor command, OSM uniqueness preflight, overlay deduplication, missing transaction evidence, weak window-title evidence, and the split between label projection and runtime binding.

## Required Work

Design and implement or specify an operator-surface health command that reports binding uniqueness, duplicate identities, duplicate HWNDs, stale/dead HWNDs, overlay label count per HWND, OSM delivery readiness, and projection-vs-binding separation. Repair operations must write before/after evidence and postcondition checks. Diagnostics should prefer HWND, PID, class, process, and stronger terminal/session/profile evidence over mutable title text. The command should make clear when rebuilding labels does not repair runtime bindings.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `narada operator-surface doctor` as the compact health surface for identity/binding/label posture.
2. Doctor output now reports binding uniqueness diagnostics, stale bindings, duplicate identity/HWND binding counts, overlay label counts by HWND, and per-identity OSM delivery readiness.
3. Doctor output explicitly separates durable identity authority, runtime binding authority, and visible-label projection state; it states that rebuilding labels does not repair runtime bindings.
4. Added binding evidence posture rows that treat `window_title` as weak supporting evidence while preferring handle, process id, window class, and process name.
5. Strengthened `operator-surface bindings clean-stale` repair evidence with before/after binding summaries and postcondition checks.
6. Added regression coverage for doctor diagnostics and repair-evidence postconditions in `operator-surface.test.ts`.

## Verification

- Focused regression: `pnpm --filter @narada2/cli exec vitest run test/commands/operator-surface.test.ts -t "operator-surface doctor|cleans dead runtime bindings|runtime binding reconciliation" --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` passed.
- Typecheck: `pnpm --filter @narada2/cli typecheck` passed.
- Build: `pnpm --filter @narada2/cli build` passed.
- TIZ verification: `run_1777667358307_thq0aa` passed with exit code 0.

## Acceptance Criteria

- [x] A compact health/doctor surface reports binding uniqueness, stale HWNDs, duplicate identities, duplicate HWNDs, overlay label counts, and OSM readiness.
- [x] Repair operations record before/after evidence and postcondition checks.
- [x] Diagnostics distinguish label projection state from runtime binding authority.
- [x] Window title is treated as weak evidence and not the sole binding authority when stronger evidence is available.
- [x] The health surface provides bounded exact repair commands or explicit blockers instead of requiring manual JSON edits.
