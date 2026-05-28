---
status: closed
depends_on: [1285, 1286, 1287]
no_continuation_needed_rationale: Stage-3 readiness and reconstruction proof is scope-complete; facade-only capability posture is the intended bounded authority state, and production daemon or effect-carrier work is explicitly outside this task.
closed_at: 2026-05-15T21:23:24.074Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add Narada-native operational readiness and reconstruction proof

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1291-1293-narada-native-carrier-stage-3.md

## Goal

Prove the native carrier can be reconstructed, reviewed, and operated from durable evidence.

## Context

Before Narada-native can be treated as a real carrier, Architect and Builder need evidence that sessions can be reconstructed and that operator-facing posture is clear.

## Required Work

1. Add reconstruction/readback command or fixture for native carrier sessions from launch, adapter, proposal, interrupt, and closeout evidence.
2. Add operational readiness output showing runtime boundary, adapter posture, capability posture, latest evidence refs, and residual blockers.
3. Add documentation for launch, inspect, interrupt, close, and reconstruct commands.
4. Verify readiness with tests and a bounded smoke proof.

## Non-Goals

- Do not claim production daemon readiness unless a daemon is built.
- Do not require direct SQLite inspection for operator readiness.
- Do not close remaining effect-carrier or model-provider work by implication.

## Execution Notes

- Added `tools/narada-native-carrier/readiness.mjs` with reconstruction and operational readiness helpers for Narada-native carrier sessions.
- Reconstruction reads durable session evidence for launch/start, adapter invocation, proposal/handoff, interrupt, and closeout without direct SQLite inspection.
- Operational readiness reports runtime boundary ref, adapter posture, facade-only capability posture, latest evidence refs, residual blockers, authority non-claims, and operator command affordances for launch, inspect, interrupt, close, and reconstruct.
- Repaired rejected review finding: readiness now reports residual blockers if adapter evidence claims raw output, raw secrets, or unbounded transcripts were recorded.
- Added bounded smoke tests that materialize a session with secret-like prompt content, run the no-effect work loop, reconstruct from evidence, verify readiness has no residual blockers after the adapter/work-loop repair, and verify unsafe adapter evidence is not reported as ready.

## Verification

- `node --test tools\narada-native-carrier\readiness.test.mjs` passed with 2 tests.
- `node --test tools\narada-native-carrier\work-loop.test.mjs` passed with 1 test.
- `node --test tools\narada-native-carrier\adapter.test.mjs` passed with 3 tests.

## Acceptance Criteria

- [x] Native carrier session reconstruction works from durable evidence.
- [x] Operational readiness output names adapter posture, capability posture, and residual blockers.
- [x] Operator commands or documented affordances cover launch, inspect, interrupt, close, and reconstruct.
- [x] Tests and smoke proof verify reconstruction and authority non-claims.
