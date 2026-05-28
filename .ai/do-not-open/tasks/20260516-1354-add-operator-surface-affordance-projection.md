---
status: closed
depends_on: [1312, 1339]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:49:43.619Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by operator-surface-affordance and launch-command-posture focused tests recorded in task verification.
closed_at: 2026-05-16T03:51:10.900Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Add operator-surface affordance projection

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1351-1356-narada-native-operator-launch-doctor-affordances.md

## Goal

Expose launch and doctor availability through operator-surface projections without authority collapse.

## Context

Buttons and labels may point to canonical commands but must not themselves become grants or mutation authority.

## Required Work

1. Define launch/doctor availability and posture projection records.
2. Ensure projected commands point to canonical surfaces rather than direct mutation primitives.
3. Add tests proving launch/focus convenience does not imply authority or capability grants.

## Non-Goals

- Do not implement a full UI rewrite.
- Do not grant capabilities through buttons or labels.
- Do not infer runtime locus from volatile window handles.

## Execution Notes

- Added `tools/narada-native-carrier/operator-surface-affordance.mjs` for bounded operator-surface affordance projections.
- Projection records expose launch, doctor, and focus availability with canonical command targets.
- Projected launch and doctor commands point to supervisor start/doctor surfaces, while focus points to the operator-surface binding surface.
- Projection records explicitly mark convenience as non-authority and do not imply capability grants or task/inbox/outbox/command/publication authority.
- Added tests proving launch/doctor availability, canonical command targets, and no implied capability or authority grants.

## Verification

- `node --test tools\narada-native-carrier\operator-surface-affordance.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\launch-command-posture.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] Operator-surface projections expose launch and doctor affordances with canonical command targets.
- [x] Projection records separate convenience from authority.
- [x] Tests prove no capability grants are implied.
