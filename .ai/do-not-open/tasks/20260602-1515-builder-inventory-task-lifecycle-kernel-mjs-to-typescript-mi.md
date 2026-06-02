---
status: claimed
---

# Builder: inventory task-lifecycle-kernel MJS-to-TypeScript migration surface

## Chapter

MCP Materialized Admissions

## Goal

Builder: inventory task-lifecycle-kernel MJS-to-TypeScript migration surface

## Context

Materialized from MCP-admitted task candidate 20260602-task-lifecycle-kernel-ts-chapter-builder-01-inventory.

Source Site: narada-proper

Source ref: operator:user_chat:2026-06-02:task-lifecycle-kernel-ts-migration-chapter

Received at: 2026-06-02T17:09:34.618Z

Summary:
Inspect packages/task-lifecycle-kernel and produce the concrete migration map before code movement. Acceptance: identify all .mjs entrypoints, imports/exports, package.json scripts or bin surfaces, tests/fixtures, generated artifacts, large files needing splits, and any runtime compatibility constraints. Do not perform broad rewrites in this task unless required to keep the inventory executable.

Evidence refs:
- operator:user_chat:2026-06-02:task-lifecycle-kernel-ts-migration-chapter
- packages/task-lifecycle-kernel
- task:20260602-task-lifecycle-kernel-ts-chapter-architect-plan

## Required Work

1. Preserve MCP admission context from candidate 20260602-task-lifecycle-kernel-ts-chapter-builder-01-inventory.
2. Execute the work described by the materialized title and summary under the governed Narada task lifecycle.
3. Verify the result with focused evidence appropriate to the changed surface.
4. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] MCP admission 20260602-task-lifecycle-kernel-ts-chapter-builder-01-inventory is represented as a governed Narada task.
- [ ] The materialized task is visible through canonical task lifecycle/work-next surfaces.
