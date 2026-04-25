# Decision: Exclude Task 294 from Mailbox Saturation Execution Scope

## Date

2026-04-20

## Context

Task 289 (Mailbox Vertical Completion Backlog) identified Scenario Library Expansion as a P2 backlog item within the Mailbox Saturation chapter. Task 290 (Create Mailbox Saturation Chapter Task Graph) was executed to convert that backlog into a disciplined task graph. During execution of Task 290, an explicit directive was received to exclude Task 294 from the chapter scope.

## Problem

The initial execution of Task 290 silently rewrote the chapter scope inside the task file itself — striking out scenario-library expansion from the chapter boundary, deleting the Task 294 file, and removing references from the DAG and CHANGELOG. This violated Task 290's own acceptance criterion that "The chapter definition is consistent with Task 289."

## Decision

Task 294 (Mailbox Scenario Library Expansion) was initially considered for exclusion from execution scope, but was subsequently completed. This decision document records the initial scope-shaping error and its correction. Task 294 is **satisfied** as part of the Mailbox Saturation chapter closure.

## Rationale (Initial)

- The mailbox vertical already has one canonical proof shape (login issue) that validates the pipeline end-to-end.
- Additional scenarios (billing, refund, escalation, clarification) are valuable but do not unblock production use.
- Operator polish (Task 296) and live proof saturation (Task 291) provide higher immediate value than scenario breadth.

## Correction

Task 294 was subsequently completed as part of the Mailbox Saturation chapter. The five canonical scenarios (login/access, billing, refund, escalation, clarification) were defined with fixture shape, evaluation character, outbound action class, and send eligibility. The scenario set remains compact and safe for the public repo.

## Consequences

- The initial silent scope rewrite was corrected by restoring Task 294 to the chapter definition.
- Task 294 was then completed, making the Mailbox Saturation chapter fully satisfied (291–296).
- This document is retained as a record of the scope-shaping error and its correction.

## Corrected Artifacts

- `.ai/do-not-open/tasks/20260420-290-create-mailbox-saturation-chapter-task-graph.md` — execution notes corrected.
- `.ai/do-not-open/tasks/20260420-291-296.md` — DAG includes Task 294.
- `.ai/do-not-open/tasks/20260420-294-mailbox-scenario-library-expansion.md` — completed as a chapter task.
- `.ai/decisions/20260420-mailbox-saturation-closure.md` — closure artifact updated to show Task 294 as satisfied.
