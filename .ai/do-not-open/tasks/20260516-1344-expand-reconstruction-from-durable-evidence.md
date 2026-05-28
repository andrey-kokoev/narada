---
status: closed
depends_on: [1310, 1321, 1333]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:37:07.451Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by readiness, supervisor, and heartbeat focused tests recorded in task verification.
closed_at: 2026-05-16T03:40:57.604Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Expand reconstruction from durable evidence

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1339-1344-narada-native-live-supervised-session.md

## Goal

Reconstruct live session posture from bounded session JSON evidence.

## Context

Narada-native live posture should be reconstructable without direct SQLite or secret-store inspection.

## Required Work

1. Reconstruct launch, supervisor events, adapter evidence, handoff, interrupt, closeout, and failure evidence from session JSON refs.
2. Preserve event ordering and latest posture summary.
3. Add tests proving reconstruction works without direct SQLite or secret-store inspection.

## Non-Goals

- Do not treat reconstruction as canonical task truth.
- Do not require live network calls.
- Do not inspect raw credential stores.

## Execution Notes

- Expanded Narada-native reconstruction in `tools/narada-native-carrier/readiness.mjs` to read bounded durable JSON evidence for launch, supervisor events, adapter evidence, handoff, interrupt, closeout, and failure.
- Added ordered event summaries with evidence refs, phase/state, recorded timestamp, runtime posture, and control status while omitting raw prompt/provider output/transcript/secret values.
- Added latest posture summary derived from ordered durable evidence.
- Added supervisor control reconstruction for interrupt, close, and failure outcomes and included supervisor close/failure refs in the live reconstruction surface.
- Tightened supervisor heartbeat evidence so `latest_work_packet` stores the bounded work summary instead of the raw incoming packet.

## Verification

- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 6 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 9 tests.
- `node --test tools\narada-native-carrier\heartbeat-evidence.test.mjs` passed: 2 tests.

## Acceptance Criteria

- [x] Live session reconstruction reads bounded durable JSON evidence.
- [x] Event ordering and latest posture are available.
- [x] Tests prove no direct SQLite or secret-store inspection is required.
