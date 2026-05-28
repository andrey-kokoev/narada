---
status: closed
depends_on: [1310, 1321, 1333]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:35:14.813Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by supervisor, readiness, and heartbeat focused tests recorded in task verification.
closed_at: 2026-05-16T03:40:31.829Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Expand supervisor doctor states

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1339-1344-narada-native-live-supervised-session.md

## Goal

Expand Narada-native doctor output for fixture, provider, blocked, running, degraded, failed, interrupted, and stopped states.

## Context

Operators need compact state visibility without repair mutation or credential exposure.

## Required Work

1. Add doctor states for fixture_only, provider_configured, blocked, running, degraded, failed, interrupted, and stopped.
2. Report residual blockers and next diagnostic command, not automatic repair mutation.
3. Add doctor tests covering every state.

## Non-Goals

- Do not expose raw provider config or credential values.
- Do not make doctor output an authority locus.
- Do not perform repair actions from doctor.

## Execution Notes

- Expanded Narada-native supervisor doctor output with explicit `doctor_state`, `adapter_state`, and aggregate `doctor_states`.
- Doctor output now distinguishes fixture-only adapter posture, provider-configured adapter posture, blocked, running, degraded, failed, interrupted, and stopped states.
- Added bounded `next_diagnostic_command` and `automatic_repair_mutation=false` so doctor output reports the next diagnostic action without performing repair mutation.
- Degraded doctor state is derived from bounded heartbeat runtime posture; failed/interrupted/stopped states are derived from supervisor failure, interrupt, and close evidence.
- Added doctor coverage tests for every required state and redaction checks for raw stdout/stderr/provider output and secret-like values.

## Verification

- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 9 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 5 tests.
- `node --test tools\narada-native-carrier\heartbeat-evidence.test.mjs` passed: 2 tests.

## Acceptance Criteria

- [x] Doctor output distinguishes all required states.
- [x] Doctor reports blockers and diagnostics without repair mutation.
- [x] Tests prove output is bounded and redacted.
