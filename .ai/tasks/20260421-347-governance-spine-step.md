---
status: closed
depends_on: [345, 346]
closed: 2026-04-21
---

# Task 347 — Governance Spine Step

## Context

Cloudflare Cycle steps 3–5 are intended to:

```text
facts -> context/work -> evaluation -> decision -> intent/outbound handoff
```

The v0 runner currently does none of this.

This task implements a fixture-backed governance spine that preserves IAS boundaries without requiring live charter runtime or live send.

## Goal

Implement a synthetic, fixture-backed governance spine over Cloudflare durable records.

## Required Work

### 1. Define minimal records

Use or extend existing DO tables for:

- context/work record
- evaluation record
- foreman decision record
- intent/outbound handoff record

Keep mailbox-specific names out of generic tables unless explicitly fixture-scoped.

### 2. Implement steps 3–5 handlers

Handlers should:

- derive bounded context/work from persisted fixture facts
- create evaluation evidence from fixture evaluator output
- create governed decision records
- create intent/outbound handoff records when policy permits

Each boundary must remain visible. Do not collapse evaluation into decision or decision into intent.

### 3. Fixture evaluator

Implement a deterministic fixture evaluator for tests.

It may produce a synthetic proposed action, but it must not execute effects.

### 4. Tests

Add focused tests proving:

- facts produce work/context records
- evaluation is persisted as evidence
- decision is separate from evaluation
- intent/handoff is separate from decision
- no effect is executed by the evaluator

## Non-Goals

- Do not run real Kimi/OpenAI/charter runtime.
- Do not execute real tools.
- Do not send email or create live drafts.
- Do not implement full local control-plane parity.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Steps 3–5 perform fixture-backed governance work.
- [x] Evaluation/decision/intent boundaries are separately represented.
- [x] Fixture evaluator cannot execute effects.
- [x] Focused tests cover IAS boundary preservation.
- [x] No derivative task-status files are created.

## Execution Notes

**Implementation:**

1. `packages/sites/cloudflare/src/coordinator.ts` — Extended `CycleCoordinator` interface and `NaradaSiteCoordinator` with governance surfaces:
   - `getUnadmittedFacts()` / `markFactAdmitted()` — fact lifecycle for step 3 admission
   - `getOpenWorkItems()` — query work items in `opened` status
   - `getPendingEvaluations()` — LEFT JOIN query finding evaluations without decisions
   - `insertContextRecord()`, `insertWorkItem()`, `insertEvaluation()`, `insertDecision()`, `insertOutboundCommand()` — durable record creation
   - Added `evaluation_id` to `decisions` table schema for IAS boundary linkage

2. `packages/sites/cloudflare/src/cycle-step.ts` — Added governance step handlers:
   - `fixtureEvaluate(input)` — pure deterministic evaluator; returns `propose_action`/`no_action`/`defer` based on fact count; zero side effects
   - `createDeriveWorkStepHandler()` — step 3: queries unadmitted facts, groups by source, creates contexts + work items, marks facts admitted
   - `createEvaluateStepHandler()` — step 4: queries open work items, runs `fixtureEvaluate`, persists evaluation records
   - `createHandoffStepHandler()` — step 5: queries pending evaluations, creates decision records, creates outbound commands for `propose_action` outcomes

3. `packages/sites/cloudflare/test/fixtures/coordinator-fixture.ts` — Added mock implementations for all new governance methods.

**Tests:** `packages/sites/cloudflare/test/unit/governance-spine.test.ts` — 12 focused tests:
- Fixture evaluator proposes action with facts, no_action without facts
- Fixture evaluator is pure (no effects)
- Derive_work creates contexts and work items from unadmitted facts
- Evaluate creates evaluation records for open work items
- Handoff creates decisions and outbound commands for proposed actions
- IAS boundary: evaluation exists before decision
- IAS boundary: decision exists before outbound command
- End-to-end: steps 2→5 produce all durable record types

**Verification:**
- `npx vitest run test/unit/governance-spine.test.ts` — 12/12 pass
- Full Cloudflare suite — 121/121 pass across 15 test files
- `pnpm verify` — 5/5 pass

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run <focused governance spine test>
pnpm verify
```

