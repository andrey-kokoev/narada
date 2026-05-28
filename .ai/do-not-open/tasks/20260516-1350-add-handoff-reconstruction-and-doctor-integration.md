---
status: closed
depends_on: [1311, 1327]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:44:32.870Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by readiness, supervisor, and handoff-family focused tests recorded in task verification.
closed_at: 2026-05-16T03:46:40.737Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Add handoff reconstruction and doctor integration

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1345-1350-narada-native-governed-effect-handoff.md

## Goal

Expose handoff artifacts through readiness and doctor by id, family, and status only.

## Context

Operators need handoff visibility without raw transcript or payload leakage.

## Required Work

1. List handoff artifacts in readiness and supervisor doctor output by id, family, status, and payload ref.
2. Reconstruct all handoff families from durable JSON refs.
3. Add tests proving reconstruction omits raw transcripts and direct mutation remains false.

## Non-Goals

- Do not display raw model transcripts or unbounded payloads.
- Do not execute admission commands from doctor.
- Do not make doctor output authority.

## Execution Notes

- Added bounded handoff artifact reconstruction to `tools/narada-native-carrier/readiness.mjs`.
- Readiness reconstruction now lists durable `*-handoff-payload.json` artifacts by artifact id, family, status, payload ref, selected bounded posture fields, canonical-admission requirement, and direct-mutation posture.
- Supervisor doctor output now exposes the same bounded `handoff_artifacts` list from readiness.
- Reconstruction covers task report, inbox, command intent, outbox intent, and repository publication handoff payload families by durable JSON refs.
- Added tests proving readiness and doctor expose all handoff families by bounded refs without raw transcripts, secret values, or mutation flags.

## Verification

- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 7 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 9 tests.
- `node --test tools\narada-native-carrier\task-report-handoff-family.test.mjs tools\narada-native-carrier\inbox-handoff-family.test.mjs tools\narada-native-carrier\command-intent-handoff-family.test.mjs` passed: 9 tests.

## Acceptance Criteria

- [x] Handoff artifacts are visible by bounded refs in readiness/doctor output.
- [x] All handoff families reconstruct from durable JSON refs.
- [x] Tests prove raw transcripts are absent and mutation flags remain false.
