---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T20:38:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [394]
---

# Task 518 - Second Operation Selection Contract

## Goal

Select the second real operation family by explicit criteria: travel value, substrate fit, safety, effect boundary clarity, and proofability.

## Context

The mailbox/email-marketing live-proof line (`399–405`) remains active and should be consulted as evidence about what Narada has and has not yet proven in routine supervised use. But Task 518 is a selection contract, not a live execution task, so it must not be blocked on the operator-gated completion of Task 403.

## Acceptance Criteria

- [x] Candidate operations are compared explicitly.
- [x] Selection criteria are explicit and Narada-native.
- [x] One operation is selected or a bounded deferral is recorded.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research Phase

1. **Identified candidate families** by examining existing Source implementations and ContextFormationStrategy implementations in `packages/layers/control-plane/src/`:
   - `TimerSource` + `TimerContextStrategy` + `ProcessExecutor`
   - `FilesystemSource` + `FilesystemContextStrategy` + `ProcessExecutor`
   - `WebhookSource` + `WebhookContextStrategy` + `ProcessExecutor`
   - Excluded campaign-request (mail-derived context strategy, not a distinct source family)

2. **Defined five selection criteria** derived from Narada-native concepts:
   - **Travel value**: Does the family prove the kernel topology travels to a fundamentally different vertical?
   - **Substrate fit**: Can it run on all substrates without redesign?
   - **Safety**: Is the effect boundary local, bounded, and reversible?
   - **Effect boundary clarity**: Is the intent type explicit with clear confirmation semantics?
   - **Proofability**: Can the full pipeline be proven with fixtures without external credentials?

3. **Evaluated each candidate** against the criteria with explicit evidence from existing integration tests and source code.

### Selection

**Timer → Process selected.** Key differentiators:
- Largest semantic distance from mailbox (self-triggered/scheduled vs. external-reactive/polling)
- Perfect substrate fit (runs identically on local daemon, Cloudflare, and any future substrate)
- Safest effect boundary (local `process.run` with bounded commands, `require_human_approval: true` by default)
- Fully fixture-provable (no external credentials or non-deterministic APIs needed)
- Deepest existing test coverage among candidates

### Deliverable

Created `.ai/decisions/20260423-518-second-operation-selection-contract.md` (12 KB) containing:
- Candidate comparison table with explicit scores and evidence
- Selection criteria definitions and weights
- Selected operation shape (JSON configuration for "Scheduled Site Health Check and Maintenance Reporting")
- Bounded blockers for live proof (all architectural, none fundamental)
- Relation to Task 519 (boundary contract)

## Verification

### Decision Artifact Verification

- Decision file exists: `.ai/decisions/20260423-518-second-operation-selection-contract.md` ✅
- File size: ~12 KB, 193 lines ✅
- Contains all required sections: candidates, criteria, evaluation, selection, operation shape, blockers ✅

### Fixture Test Verification

All referenced integration tests for the selected operation passed:

```bash
pnpm test:control-plane -- test/integration/control-plane/timer-to-process.test.ts
pnpm test:control-plane -- test/integration/control-plane/vertical-parity.test.ts
```

Results:
- `timer-to-process.test.ts`: 4/4 tests pass (fact generation, foreman resolution, process execution, replay safety) ✅
- `vertical-parity.test.ts`: 4/4 tests pass (Source interface parity, FactStore ingestion, foreman → scheduler → execution path) ✅
- `filesystem-vertical.test.ts`: 5/5 tests pass (peer verification) ✅
- `webhook-vertical.test.ts`: 2/2 tests pass (peer verification) ✅

### Typecheck Verification

- `pnpm verify`: all packages pass ✅
