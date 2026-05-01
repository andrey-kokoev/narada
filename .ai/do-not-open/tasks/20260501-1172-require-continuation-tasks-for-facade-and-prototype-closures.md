---
status: opened
---

# Require continuation tasks for facade and prototype closures

## Chapter

task-lifecycle-capa

## Goal

Prevent facade, prototype, spike, or design-only task closure from being mistaken for end-to-end capability completion.

## Context

Inbox incident env_5186e253-3839-4c42-976d-96ce5d8d169f reports that task 62 closed as a typed MCP facade/prototype, but the operator immediately expected usable MCP messaging. Narada needs mechanical continuation handling so scope-complete does not read as capability-complete.

## Required Work

Add lifecycle/review/close guardrails for facade, prototype, spike, and design-only tasks: require either explicit no-continuation-needed rationale or creation/linkage of concrete implementation follow-up tasks; warn in evidence/review when prototype language lacks continuation relation; distinguish scope-complete from capability-complete in review and close output.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Task close detects facade/prototype/spike/design-only scope language and surfaces continuation obligations before capability-complete wording.
- [ ] Closure can proceed only with linked continuation task evidence or explicit no-continuation-needed rationale where applicable.
- [ ] Evidence or review surfaces warn when prototype/facade language has no continuation relation.
- [ ] Review output distinguishes scope-complete from capability-complete.
- [ ] Tests cover facade task with continuation, facade task with no-continuation rationale, and facade task missing continuation.
