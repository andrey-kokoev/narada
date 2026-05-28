---
status: closed
depends_on: [1312, 1339]
closed_at: 2026-05-16T03:50:27.976Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define Narada-native doctor command

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1351-1356-narada-native-operator-launch-doctor-affordances.md

## Goal

Provide a compact Narada-native doctor command over supervisor and readiness surfaces.

## Context

Operators need configured, blocked, fixture-only, provider-backed, live, failed, and stopped posture without private file inspection.

## Required Work

1. Wrap supervisor doctor and readiness into JSON and human output.
2. Report runtime posture, provider posture, data posture, consent posture, blocked reasons, latest evidence refs, reconstruction status, and next diagnostic command.
3. Add tests distinguishing configured, blocked, fixture-only, provider-backed, live-running, failed, and stopped states.

## Non-Goals

- Do not perform repair mutation.
- Do not expose raw provider configuration or credential values.
- Do not treat doctor output as task truth.

## Execution Notes

- Added `tools/narada-native-carrier/doctor-command.mjs` as a compact bounded doctor wrapper over `supervisorDoctor` and `operationalReadiness`.
- The compact doctor output reports runtime posture, provider posture, data posture, consent posture, blocked reasons, latest evidence refs, reconstruction status, next diagnostic command, authority non-claims, and non-authoritative output posture.
- Added JSON and human render paths while keeping the existing verbose supervisor `doctor` behavior available by default.
- Extended `tools/narada-native-carrier/supervisor-cli.mjs` with `doctor-compact` and `doctor --format json|human` support.
- Added `tools/narada-native-carrier/doctor-command.test.mjs` covering compact JSON/human output, configured/blocked/fixture/provider-backed/live/failed/stopped/degraded state distinction, and redaction of raw prompts, model output, provider config values, and secret-like refs.

## Verification

- `node --test tools\narada-native-carrier\doctor-command.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 9 tests.

## Acceptance Criteria

- [x] Doctor command returns compact bounded JSON/human output.
- [x] All required states are distinguishable.
- [x] Tests prove doctor output does not expose secrets or raw model text.
