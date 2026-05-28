---
status: closed
depends_on: [1312, 1339]
closed_at: 2026-05-16T14:57:11.832Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add end-to-end operator readback proof

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1351-1356-narada-native-operator-launch-doctor-affordances.md

## Goal

Prove dry-run launch, start or heartbeat evidence, doctor readback, and reconstruction link by carrier session id.

## Context

Operator-facing use should be proven without live provider network calls.

## Required Work

1. Run dry-run launch planning for fixture and provider-configured paths.
2. Link start or heartbeat evidence, doctor readback, and reconstruction by carrier session id.
3. Add tests proving bounded output and no live provider network calls.

## Non-Goals

- Do not require live provider credentials.
- Do not send outbound effects or publish repositories.
- Do not close proof by transcript inspection alone.

## Execution Notes

- Added `tools/narada-native-carrier/operator-readback-proof.test.mjs`.
- The fixture proof builds dry-run launch posture, starts and heartbeats a supervised session, reads compact doctor output, reconstructs session evidence, and asserts all surfaces share the same carrier session id.
- The provider-configured proof writes a provider adapter registration with capability ref, builds dry-run launch posture, starts supervised evidence, reads JSON and human doctor output, reconstructs session evidence, and asserts provider-backed posture without provider transport.
- Both paths assert bounded output without secret-like values, credential refs, raw prompts, raw provider output, or model output.

## Verification

- `node --test tools\narada-native-carrier\operator-readback-proof.test.mjs` passed: 2 tests.
- `node --test tools\narada-native-carrier\launch-command-posture.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\doctor-command.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] Dry-run launch, evidence, doctor, and reconstruction are linked by carrier session id.
- [x] Fixture and provider-configured paths are covered.
- [x] Tests pass without live provider network calls or raw secrets.
