---
status: closed
depends_on: []
closed_at: 2026-04-27T01:42:53.099Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 943 — Bootstrap Doctor Ergonomic Readiness — Task 2

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/commands/doctor.ts`
- `AGENTS.md`

## Context

Operators need to know whether install/build/bin-link state is ready before running deeper workflows.

## Goal

Check repo install and build posture.

## Required Work

1. Check `package.json`.
2. Check `pnpm-lock.yaml`.
3. Check `node_modules`.
4. Check CLI dist entry.
5. Check `node_modules/.bin/narada`.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Added manifest, lockfile, dependencies, CLI build, and bin-link checks with remediation strings.

## Verification

Focused tests cover degraded install/build readiness.

## Acceptance Criteria

- [x] Missing dependencies report `pnpm install`.
- [x] Missing CLI build reports `pnpm -r build`.
- [x] Missing bin link reports install/shim guidance.
