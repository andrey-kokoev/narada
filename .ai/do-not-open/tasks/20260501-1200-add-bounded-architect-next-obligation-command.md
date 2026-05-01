---
status: opened
---

# Add bounded architect next-obligation command

## Chapter

architect-loop-output-austerity

## Goal

Stop routine Architect loops from using broad compact workboard JSON when the needed answer is one bounded next obligation or review action.

## Context

Inbox envelope env_7fae8b6a-c46d-41c0-b236-43195c66eb0f reports a recurring CAPA: compact workboard still returned hundreds of lines and stale-dist warning text during routine architect-loop work. The broad dashboard is not a strict next-action packet and still burns context.

## Required Work

Add a bounded Architect-loop command or output mode that returns only the highest-priority next obligation, review, or routing action with a short reason and strict byte/line budget. Make broad workboard JSON opt-in for exploration, not the default Architect duty-loop probe. Separate diagnostics and stale-dist warnings from machine-readable result channels or summarize them into bounded fields. Add recurrence-aware CAPA handling or markers when previously reported ergonomics failures recur after mitigation.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] There is a bounded next-obligation or architect-loop command whose default output fits a strict line/byte budget.
- [ ] Broad workboard JSON remains available only through explicit exploratory flags or commands.
- [ ] Diagnostics and warnings do not corrupt or bloat machine-readable result payloads.
- [ ] Tests assert compact Architect-loop output remains under the configured output budget.
- [ ] Recurring CAPA/ergonomics incidents can be marked as recurrence rather than appearing as first-time observations.
