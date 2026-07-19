---
status: opened
---

# Materialize approved onboarding roles into the User Site launch registry

## Goal

Add the quiet roster materialization crossing that consumes the role-expansion approval artifact and appends approved architect/builder entries to the User Site launch registry.

## Context

<!-- Context placeholder -->

## Required Work

1. Add narada onboarding roles materialize consuming role-expansion-approval.json. 2. Append approved roles to config/launch/agents registry as quiet agent-cli background entries; no UI, no auto-start, no task-roster writes. 3. Extend onboarding.test.ts for the full materialization flow. 4. Update first-time-operator-success-path.md.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] roles materialize writes approved architect/builder registry entries with OperatorSurface agent-cli and leaves the resident entry untouched
- [ ] materialize without a prior approval is blocked with role_materialization_requires_approval and performs no mutation
- [ ] re-running materialize after full materialization reports already_materialized with no registry change
- [ ] focused onboarding tests and tsc typecheck pass
