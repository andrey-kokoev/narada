---
status: closed
depends_on: [1312, 1339]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:52:05.758Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by repair-guidance and doctor-command focused tests recorded in task verification.
closed_at: 2026-05-16T03:53:43.325Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Add repair guidance and refusal posture

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1351-1356-narada-native-operator-launch-doctor-affordances.md

## Goal

Provide bounded operator guidance for blocked Narada-native launch and doctor states.

## Context

Blocked states should guide the operator without automatically repairing authority-bearing substrate.

## Required Work

1. Cover missing registration, missing consent, revoked grant, missing runtime, stale heartbeat, and unavailable provider transport.
2. Return bounded repair guidance and next diagnostic commands.
3. Add tests proving no automatic repair mutation occurs.

## Non-Goals

- Do not rotate credentials, edit consent, start daemons, or mutate tasks automatically.
- Do not print raw secret values in guidance.
- Do not bypass canonical capability consent.

## Execution Notes

- Added `tools/narada-native-carrier/repair-guidance.mjs` for bounded launch/doctor repair guidance.
- Guidance covers missing registration, missing consent, revoked grant, missing runtime, stale heartbeat, and unavailable provider transport.
- Each guidance record includes bounded operator guidance, next diagnostic commands, and explicit no-repair/no-grant/no-credential-access/no-provider-transport posture.
- Secret-like carrier session refs are omitted from guidance output.
- Added tests covering all required blocked states, no automatic repair mutation, and raw prompt/provider output/transcript/secret omission.

## Verification

- `node --test tools\narada-native-carrier\repair-guidance.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\doctor-command.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] Blocked states produce bounded guidance and diagnostics.
- [x] No automatic repair mutation occurs.
- [x] Tests cover all required blocked states.
