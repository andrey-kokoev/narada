.ai/tasks/20260416-095-move-mail-essential-runtime-semantics-to-mailbox-adapters.md

# Task 095 — Move Mail-Essential Runtime Semantics to Mailbox Adapters

## Objective
Push all **mail-essential** semantics outward into explicitly mailbox-scoped adapters/materializers/runtime helpers.

## Why
The remaining architectural risk is not compatibility naming anymore. It is upper-layer orchestration that still carries mail-local concepts. Even when valid, those concepts should not sit in generic-looking modules.

## Required Changes
- For items classified in Task 094 as **mail-vertical essential**:
  - move them into explicitly mail-scoped modules where practical
  - or wrap them behind mail-specific adapter interfaces
- Reduce mail-local logic inside shared orchestration modules
- Keep shared modules operating on:
  - `scope_id`
  - `context_id`
  - fact neighborhoods
  - neutral policy/runtime contracts
- Preserve mailbox behavior exactly

## Acceptance Criteria
- Shared runtime/control modules become visibly more neutral
- Mail-essential logic is concentrated in mailbox-scoped adapters/helpers
- No behavior regressions in mailbox flows
- Non-mail verticals do not transit mail-shaped helper paths

## Invariant
Vertical-local behavior belongs at vertical boundaries, not in shared orchestration.