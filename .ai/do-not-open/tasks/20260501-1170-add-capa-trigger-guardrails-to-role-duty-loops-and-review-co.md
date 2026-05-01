---
status: opened
---

# Add CAPA trigger guardrails to role duty loops and review commands

## Chapter

capa-operation

## Goal

Make CAPA-grade incidents prompt or require CAPA routing instead of depending on agent memory.

## Context

Inbox incident env_aa5bc553-2ec4-46d6-9812-7d7a9b66f915 reports that an architect handled an immediate review defect but failed to submit CAPA until the Operator prompted it. This repeats a recurrence-risk failure in role-loop discipline.

## Required Work

Define CAPA-grade trigger vocabulary; add role-loop guidance requiring a CAPA needed yes/no decision after rejected reviews or blocking findings; add command support where task review rejected can recommend CAPA or require an explicit no-CAPA reason; add documentation and focused tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] CAPA-grade triggers include authority-boundary bugs, safety or secret boundary bugs, lifecycle or roster authority mismatches, workaround identities, repeated Operator correction, and defects likely to recur across Sites.
- [ ] Role duty-loop docs require a CAPA needed yes/no decision with one-line rationale after rejected reviews or blocking findings.
- [ ] task review rejected with blocking findings surfaces a CAPA recommendation or requires an explicit no-CAPA reason where feasible.
- [ ] Self-CAPA guidance covers cases where the Operator identifies a missed CAPA after an incident.
- [ ] Tests or fixtures cover review rejection producing CAPA guidance without mutating unrelated task state.
