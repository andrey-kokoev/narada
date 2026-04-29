---
status: opened
amended_by: architect
amended_at: 2026-04-29T17:50:43.271Z
---

# Detect and reconcile Site task substrate splits

## Chapter

Site Stabilization and Task Substrate Authority

## Goal

Add a governed Site stabilization check for legacy/current task substrate splits, including task directory, lifecycle DB, mutation evidence, snapshot, and inbox DB posture.

## Context

Inbox envelope env_eaf750e3-de47-4c10-8df7-f7525f42b105 reports that a Windows User Site had legacy durable .ai/tasks plus .ai/tasks/task-lifecycle.db while current Narada CLI wrote canonical task state to .ai/do-not-open/tasks, .ai/task-lifecycle.db, mutation evidence, and lifecycle snapshot. This made the Site appear to have duplicate task authority until config, docs, and ignore rules were manually reconciled. Task 1080 covered general Site stabilization posture and is closed; this task is the concrete substrate-split follow-up.

## Required Work

1. Inspect existing Site stabilization/reconciliation docs and commands plus task lifecycle/inbox storage posture. 2. Define the canonical task substrate inventory a Site stabilization check must inspect: current task directory, legacy task directory, root lifecycle DB, legacy lifecycle DB, task lifecycle snapshot, mutation evidence, inbox DB, exported inbox envelopes, and .gitignore/config durable-vs-volatile posture. 3. Implement or specify a bounded command/check that detects legacy/current split states and classifies them as ok, needs_migration, needs_archive, or compatibility_declared. 4. The check must not silently migrate or delete; authorized execution must emit mutation evidence or a durable migration artifact. 5. Add human and JSON output with concise refusal/recommendation text and no raw DB dump. 6. Add tests or fixtures for a Site with both .ai/tasks/task-lifecycle.db and .ai/task-lifecycle.db plus current .ai/do-not-open/tasks. 7. Link or update Site stabilization docs so the substrate check is part of the stabilization posture. 8. Run focused verification or pnpm verify and record residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T17:50:43.271Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Stabilization detects legacy .ai/tasks and current .ai/do-not-open/tasks coexisting
- [ ] Stabilization detects legacy and current lifecycle DB location split
- [ ] Output classifies split posture as ok needs_migration needs_archive or compatibility_declared without silent mutation
- [ ] Authorized remediation path emits durable evidence or migration artifact
- [ ] Human and JSON outputs are bounded and do not dump raw DB contents
- [ ] Source envelope env_eaf750e3-de47-4c10-8df7-f7525f42b105 is routed
