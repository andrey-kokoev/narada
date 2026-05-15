---
status: in_review
---

# Forbid unrouted task report review obligations

## Chapter

mcp-infrastructure

## Goal

Make task report review routing mandatory so open _unrouted review obligations cannot be created by default.

## Context

Operator directive in chat: remove mechanical ability for _unrouted to be acceptable. Implemented immediately in task-report service and tests; this task records the authority/evidence path for that mutation.

## Required Work

Change report-time review routing so task report must resolve to an explicit, configured, or unique distinct admitted reviewer before mutating lifecycle/report state; block self-review and missing reviewer paths; add regression coverage proving no report or obligation is created when no reviewer resolves.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] task report cannot create an open review obligation with target_ref=unrouted.
- [ ] Missing or self reviewer paths fail before report/lifecycle mutation with repair guidance.
- [ ] Focused task-report and task-review tests pass.
