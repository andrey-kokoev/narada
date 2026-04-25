# Task 294: Mailbox Scenario Library Expansion

## Chapter

Mailbox Saturation

## Context

Narada currently has one canonical mailbox proof shape. That is enough to prove a first vertical exists, but not enough to make the vertical reusable or trustworthy across common support shapes.

## Goal

Create a compact canonical scenario basis for the mailbox vertical that covers the main conversational shapes Narada should handle first.

## Required Work

### 1. Define the initial scenario set

Use the first compact basis:

- login/access issue
- billing question
- refund request
- escalation-worthy complaint
- ambiguous request needing clarification

### 2. Define fixture shape per scenario

For each scenario, define:

- input thread/context shape
- expected evaluation character
- expected outbound action class
- whether send should remain draft-only or be send-approvable

### 3. Add safe fixtures and proof hooks

Add only safe, repo-appropriate fixtures and test/proof hooks. Private or customer-specific content must stay out of the public repo.

### 4. Keep the set small and canonical

Prefer one strong scenario per class over a sprawling example catalog.

## Non-Goals

- Do not create a large synthetic mailbox corpus.
- Do not introduce domain-specific private knowledge into public fixtures.
- Do not turn this into benchmark theater.

## Acceptance Criteria

- [x] The mailbox vertical has a small canonical scenario basis beyond the login case.
- [x] Each scenario has a clear expected evaluation/outbound shape.
- [x] Fixtures remain safe for the public repo.
- [x] The scenario set is compact and intentionally bounded.

## Execution Notes

- **Fixtures created**: `packages/layers/control-plane/test/fixtures/threads/support-thread-{billing-question,refund-request,escalation-complaint,ambiguous-request}.json`
- **Documentation created**: `docs/mailbox-scenario-library.md` — defines evaluation character, outbound action class, and governance outcome per scenario.
- **Proof hook created**: `packages/layers/control-plane/test/integration/live-operation/scenario-library.test.ts` — 6 tests (5 scenarios + safe-posture gate) exercising the full dispatch → evaluation → resolution pipeline.
- **Governance outcomes observed**:
  - Login / billing / escalation → `action_created` (approval off) or `pending_approval` (approval on)
  - Refund (medium confidence + uncertainty flags) → `pending_approval` regardless of policy
  - Ambiguous (low confidence) → `escalated` regardless of policy
- **Tests pass**: `pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/integration/live-operation/scenario-library.test.ts"`
