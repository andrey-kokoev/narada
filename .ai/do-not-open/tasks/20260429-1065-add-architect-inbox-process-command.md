---
status: claimed
amended_by: architect
amended_at: 2026-04-29T15:06:16.793Z
---

# Add architect inbox process command

## Chapter

Architect Builder Handoff Ergonomics

## Goal

Add a single Architect-side command that processes an inbox envelope into a Builder-owned task handoff without executing Builder work.

## Context

This task comes from the 2026-04-29 inbox processing trial where Architect correctly avoided executing Builder work only after manual discipline. Current flow requires separate commands for task creation, task amendment, roster assignment, inbox pending routing, lifecycle export, envelope export, verification, git staging, commit, and push. The desired operator surface is one Architect-side inbox processing command that creates a Builder handoff package and stops before implementation.

## Required Work

1. Design the command surface for Architect inbox processing, likely under narada inbox architect-process or equivalent. 2. Implement the command so it consumes a single envelope id, creates a detailed task from the envelope, assigns Builder by default, routes the envelope to the task, exports lifecycle and inbox artifacts, and emits a bounded handoff summary. 3. Ensure the command does not execute implementation, submit Builder reports, close tasks, or self-review. 4. Add JSON and human output. 5. Add tests for happy path, no-placeholder task generation, Builder assignment, envelope routing, artifact export, and refusal to execute Builder work. 6. Run pnpm verify.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:06:16.793Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Command creates or updates a detailed task from an inbox envelope without placeholder required work
- [ ] Command assigns the task to Builder and claims it for Builder by default
- [ ] Command routes the source envelope to the created task with durable evidence
- [ ] Command exports lifecycle and inbox artifacts and prints a bounded handoff summary
- [ ] Command refuses to execute report close or implementation steps and pnpm verify passes
