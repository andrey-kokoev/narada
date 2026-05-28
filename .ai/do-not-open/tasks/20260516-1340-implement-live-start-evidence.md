---
status: closed
depends_on: [1310, 1321, 1333]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:27:32.681Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by live-start, runtime-handle, supervisor, readiness, and provider-adapter focused test runs recorded in task verification.
closed_at: 2026-05-16T03:39:10.706Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Implement live start evidence

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1339-1344-narada-native-live-supervised-session.md

## Goal

Record live session start evidence with reachability posture and blocked states.

## Context

Session start should report configured reachability without performing provider calls or Narada mutations.

## Required Work

1. Record runtime handle and configured to-data/to-intelligence reachability probes.
2. Emit blocked posture for missing registration, missing consent, stale or revoked grant, and missing required local executable.
3. Add tests covering fixture-only, provider-configured, blocked-missing-capability, and blocked-runtime-unavailable start.

## Non-Goals

- Do not perform live provider calls during start evidence.
- Do not claim, report, review, close, publish, or mutate inbox/outbox state.
- Do not reveal credential values.

## Execution Notes

- Added `tools/narada-native-carrier/live-start.mjs` with bounded live start evidence for fixture-only, provider-configured, blocked capability/grant, blocked missing registration, missing runtime handle, and missing required local executable states.
- Start evidence records runtime handle, to-data/to-intelligence reachability summaries, bounded registration readiness, optional capability projection posture, required local executable presence, explicit blocked reasons, and non-authority/no-mutation flags.
- Provider-backed start evidence performs capability projection lookup only; it does not invoke provider transport, reveal credential values, or mutate Narada task/inbox/outbox/publication state.
- Added `tools/narada-native-carrier/live-start.test.mjs` covering fixture-only, provider-configured, missing capability, stale grant, revoked grant, missing registration, missing runtime handle, and missing executable starts.

## Verification

- `node --test tools\narada-native-carrier\live-start.test.mjs` passed: 4 tests.
- `node --test tools\narada-native-carrier\runtime-handle.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 7 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 5 tests.
- `node --test tools\narada-native-carrier\provider-adapter.test.mjs` passed: 4 tests.

## Acceptance Criteria

- [x] Start evidence records bounded runtime and reachability posture.
- [x] Blocked start states are explicit and reconstructable.
- [x] Tests prove no provider calls or Narada mutations occur.
