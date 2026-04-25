.ai/do-not-open/tasks/20260416-081-add-non-mail-vertical-ui-fixtures-and-e2e-proof.md
# Task 081 — Add Non-Mail Vertical UI Fixtures and End-to-End Proof

## Objective
Prove that the operator console is genuinely multi-vertical, not merely mailbox-capable with generic labels.

## Why
Several current surfaces look generic but are still built atop mailbox-shaped records and assumptions. This needs proof using non-mail fixtures.

## Required Changes
- Add seeded fixtures for at least:
  - timer
  - filesystem
  - webhook
- Run those fixtures through:
  - facts
  - contexts
  - work
  - timeline
  - overview
  - intents/executions where applicable
- Add end-to-end UI/API tests showing these verticals render correctly
- Verify mailbox page remains vertical-specific rather than leaking into generic pages

## Acceptance Criteria
- Generic pages render non-mail verticals without mailbox distortion
- Timeline and overview visibly include non-mail verticals
- Tests prove operator shell remains useful even with zero mailbox data
- Mailbox-specific UI remains an additive layer, not a prerequisite

## Invariant
Vertical neutrality must be demonstrated by fixtures, not asserted by naming.