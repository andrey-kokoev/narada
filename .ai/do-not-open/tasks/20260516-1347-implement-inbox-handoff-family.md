---
status: closed
depends_on: [1311, 1327]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:41:36.345Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by inbox-handoff-family and carrier-action-packet focused tests recorded in task verification.
closed_at: 2026-05-16T03:43:01.325Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Implement inbox handoff family

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1345-1350-narada-native-governed-effect-handoff.md

## Goal

Implement inert inbox proposal packets without envelope transition authority.

## Context

The carrier may propose inbox submissions or promotions but must leave envelope admission to canonical inbox surfaces.

## Required Work

1. Include envelope kind, source ref, authority assertion, bounded payload summary, and suggested inbox submit/import/triage/promote surface.
2. Redact raw secret-like payload values.
3. Add tests proving no inbox database write or status transition occurs.

## Non-Goals

- Do not submit, import, triage, promote, archive, or task inbox envelopes.
- Do not write .ai/inbox.db from the carrier.
- Do not record unbounded payload bodies.

## Execution Notes

- Added `tools/narada-native-carrier/inbox-handoff-family.mjs` for inert inbox handoff packets.
- The handoff payload records envelope kind, source ref, authority assertion, bounded payload summary, and suggested canonical inbox surface without performing inbox database writes.
- The payload is written as a reconstructable JSON ref and wrapped in the generic carrier action packet with `action_family=inbox`.
- Inbox before/after state is recorded as unchanged, with `direct_inbox_database_write=false` and `envelope_status_transition_performed=false`.
- Added tests for bounded inbox packet emission, canonical inbox surface visibility, no inbox mutation, and secret-like payload redaction.

## Verification

- `node --test tools\narada-native-carrier\inbox-handoff-family.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\carrier-action-packet.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] Inbox handoff packets are bounded and inert.
- [x] Canonical inbox admission surface is explicit.
- [x] Tests prove no inbox mutation occurs.
