---
status: closed
depends_on: []
closed_at: 2026-04-27T01:06:49.604Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Task 920 — Unified Agent Work Next Surface — Task 4

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

architect

## Required Reading

- `packages/layers/cli/src/main.ts`
- `packages/layers/cli/src/commands/work-next-register.ts`

## Context

The unified surface needs a short root command, not another subsystem-specific query hidden under `task` or `inbox`.

## Goal

Expose `narada work-next --agent <id>`.

## Required Work

1. Add a root command registrar.
2. Wire it into `main.ts`.
3. Support finite JSON and human output.

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

Added `work-next-register.ts` and registered it from `main.ts`.

## Verification

CLI package typecheck passed.

## Acceptance Criteria

- [x] Root `narada work-next` command exists.
- [x] Command requires `--agent`.
- [x] Command supports `--format`.
