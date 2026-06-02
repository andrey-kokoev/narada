---
status: claimed
---

# Builder: convert task-lifecycle-kernel source from .mjs to TypeScript

## Chapter

MCP Materialized Admissions

## Goal

Builder: convert task-lifecycle-kernel source from .mjs to TypeScript

## Context

Materialized from MCP-admitted task candidate 20260602-task-lifecycle-kernel-ts-chapter-builder-02-convert-ts.

Source Site: narada-proper

Source ref: operator:user_chat:2026-06-02:task-lifecycle-kernel-ts-migration-chapter

Received at: 2026-06-02T17:09:36.326Z

Summary:
Migrate package source files in packages/task-lifecycle-kernel from .mjs JavaScript to TypeScript while preserving runtime behavior and package boundaries. Acceptance: TypeScript sources compile cleanly, imports/exports and package entrypoints are updated coherently, no kernel lifecycle semantics are changed without explicit evidence, and existing tests continue to pass or are updated for equivalent behavior.

Evidence refs:
- operator:user_chat:2026-06-02:task-lifecycle-kernel-ts-migration-chapter
- packages/task-lifecycle-kernel
- task:20260602-task-lifecycle-kernel-ts-chapter-builder-01-inventory

## Required Work

1. Preserve MCP admission context from candidate 20260602-task-lifecycle-kernel-ts-chapter-builder-02-convert-ts.
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

- [ ] MCP admission 20260602-task-lifecycle-kernel-ts-chapter-builder-02-convert-ts is represented as a governed Narada task.
- [ ] The materialized task is visible through canonical task lifecycle/work-next surfaces.
