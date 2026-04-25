---
status: closed
closed: 2026-04-22
depends_on: [392]
---

# Task 393 — Email Marketing Operation Integration Proof

## Assignment

Produce an end-to-end fixture proving the email-marketing Operation pipeline from inbound mail fact to campaign brief draft, without requiring live Klaviyo credentials or real email sends.

## Context

Integration proofs are Narada's canonical verification pattern. They exercise the full kernel pipeline with fixture data to prove that authority boundaries hold and the Operation produces the expected artifacts.

## Goal

Create a fixture-backed test that proves the email-marketing Operation can:
1. Admit a campaign-request mail fact.
2. Derive a campaign-request context and work item.
3. Evaluate the campaign-production charter (mocked) to produce a campaign brief.
4. Hand off the brief as an outbound command.
5. Surface the brief in the operator console for review.

## Required Work

1. Define fixture data:
   - Inbound email from allowed sender: "Need a campaign for product launch next week, target segment: active-users"
   - Expected extracted fields: campaign_name hint = "product launch", timing = "next week", segment = "active-users"
2. Define fixture pipeline:
   - `createSyncStepHandler` admits the mail fact.
   - `createDeriveWorkStepHandler` with `CampaignRequestContextFormation` creates context + work item.
   - `createEvaluateStepHandler` with mock campaign-production charter produces evaluation.
   - `createHandoffStepHandler` creates decision + `campaign_brief` outbound.
3. Define assertions:
   - Fact is admitted and deduplicated.
   - Context is created with correct `context_id`.
   - Work item is `opened`.
   - Evaluation proposes `campaign_brief`.
   - Outbound command has `actionType: "campaign_brief"` and structured payload.
   - No `klaviyo_campaign_create` intent is created.
   - No send/publish action is proposed.
4. Define missing-info fixture:
   - Inbound email: "Need a campaign soon"
   - Expected: charter produces `request_info` with missing fields list.
   - Handoff creates `send_reply` outbound asking for missing info.
5. Document test location:
   - `packages/sites/windows/test/integration/email-marketing-operation.test.ts` or similar.
   - Use the same fixture patterns as `kernel-spine-fixture.test.ts`.

## Execution Notes

### Integration Test Created

Created `packages/sites/windows/test/integration/email-marketing-operation.test.ts` with 5 fixture-backed tests using real `SqliteCoordinatorStore` and `SqliteOutboundStore` on in-memory SQLite databases.

**Test 1 — Full pipeline to campaign_brief:**
- Simulates sync (context record creation), derive work (work item), evaluate (mock charter producing `campaign_brief`), handoff (decision + outbound command)
- Asserts: context exists with `campaign_producer` charter, work item is `opened`, evaluation outcome is `complete` with `recommended_action_class: "campaign_brief"`, decision references evaluation, outbound command has `action_type: "campaign_brief"` and structured payload

**Test 2 — Missing-info pipeline to send_reply:**
- Same pipeline but with sparse input fact; charter produces `clarification_needed` outcome with `send_reply` action
- Asserts: follow-up email drafted to sender, no `campaign_brief` created

**Test 3 — No forbidden actions:**
- Asserts no `klaviyo_*` or `send_new_message` actions appear in outbound commands

**Test 4 — Console observation surface:**
- Proves generic `getCommandsByScope` query surfaces `campaign_brief` drafts for operator review

**Test 5 — IAS boundary preservation:**
- Verifies evaluation, decision, and outbound are separate records with distinct IDs

### Verification

- `pnpm test test/integration/email-marketing-operation.test.ts`: 5/5 tests pass
- Full windows-site suite: 156/156 tests pass (156 = 151 existing + 5 new)
- Monorepo typecheck: clean across all 9 workspace packages

## Non-Goals

- Do not call real Klaviyo API.
- Do not send real email.
- Do not require live credentials.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Full-pipeline fixture exists and passes.
- [x] Missing-info fixture exists and passes.
- [x] Assertions verify no forbidden actions are proposed.
- [x] Test uses mocked charter, not live API.
- [x] Test location follows existing fixture patterns.
