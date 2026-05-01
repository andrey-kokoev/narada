---
status: opened
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A compact health/doctor surface reports binding uniqueness, stale HWNDs, duplicate identities, duplicate HWNDs, overlay label counts, and OSM readiness.
- [ ] Repair operations record before/after evidence and postcondition checks.
- [ ] Diagnostics distinguish label projection state from runtime binding authority.
- [ ] Window title is treated as weak evidence and not the sole binding authority when stronger evidence is available.
- [ ] The health surface provides bounded exact repair commands or explicit blockers instead of requiring manual JSON edits.
