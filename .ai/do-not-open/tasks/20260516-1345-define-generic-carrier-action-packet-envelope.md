---
status: closed
depends_on: [1311, 1327]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:38:41.491Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by carrier-action-packet, to-intelligence orchestration, and adapter focused tests recorded in task verification.
closed_at: 2026-05-16T03:41:38.405Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Define generic carrier action packet envelope

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1345-1350-narada-native-governed-effect-handoff.md

## Goal

Define the inert proposal envelope for all Narada-native action handoff families.

## Context

Carrier outputs must be reconstructable proposals until canonical Narada surfaces admit them.

## Required Work

1. Define fields packet_id, carrier_session_id, action_family, status=inert_proposal, summary, payload_summary, payload_ref, requires_canonical_admission=true, raw_transcript_recorded=false, and direct_mutation_performed=false.
2. Cover task-report, inbox, command intent, outbox intent, and repository publication families.
3. Add schema tests for all families and no-authority flags.

## Non-Goals

- Do not execute any effect from the envelope.
- Do not treat model output as accepted evidence.
- Do not record raw transcripts or raw provider output.

## Execution Notes

- Added `tools/narada-native-carrier/carrier-action-packet.mjs` with a generic inert action packet envelope.
- Envelope includes packet id, carrier session id, action family, `status=inert_proposal`, bounded summary, bounded payload summary, payload ref, `requires_canonical_admission=true`, raw-value omission flags, and `direct_mutation_performed=false`.
- Represented required families: task report, inbox, command intent, outbox intent, and repository publication.
- Added validation that enforces inert proposal posture, canonical admission requirement, no direct mutation, and no transport/publication/task/inbox/command authority claims.
- Added tests proving all required families, authority flags, and redaction of raw transcript, prompt, provider output, and secret values.

## Verification

- `node --test tools\narada-native-carrier\carrier-action-packet.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\to-intelligence-orchestration-stage.test.mjs` passed: 4 tests.
- `node --test tools\narada-native-carrier\adapter.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] A generic inert action packet envelope exists.
- [x] All required action families are represented.
- [x] Tests prove canonical admission is required and direct mutation is false.
