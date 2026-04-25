# Task 055 — De-mailbox Evaluation & Resolution

## Objective
Remove mailbox-specific identity from evaluation and decision records.

## Required Changes
- Replace `conversation_id` with `context_id` everywhere
- Ensure `Evaluation`, `Decision`, and resolution flows operate only on:
  - `context_id`
  - `scope_id`
- Move mailbox-specific interpretation into vertical adapters

## Acceptance Criteria
- No decision/evaluation record depends on mailbox identifiers
- Foreman operates purely on context

## Invariant
Policy layer must remain vertical-neutral