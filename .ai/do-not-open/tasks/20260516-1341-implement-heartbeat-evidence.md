---
status: closed
depends_on: [1310, 1321, 1333]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:31:12.348Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by heartbeat-evidence, supervisor, readiness, and runtime-handle focused tests recorded in task verification.
closed_at: 2026-05-16T03:39:38.682Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Implement heartbeat evidence

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1339-1344-narada-native-live-supervised-session.md

## Goal

Emit bounded heartbeat evidence for live Narada-native sessions.

## Context

Heartbeat should show runtime and adapter health without capturing raw transcripts or provider output.

## Required Work

1. Report runtime alive, degraded, stale, or missing posture.
2. Include latest bounded work packet summary, latest handoff ref, to-data reachability, and provider readiness posture.
3. Add tests proving no raw transcript, raw provider output, prompt, or secret values are recorded.

## Non-Goals

- Do not make heartbeat freshness lifecycle truth.
- Do not store raw conversation or provider text.
- Do not perform automatic repair.

## Execution Notes

- Added bounded heartbeat evidence for Narada-native sessions in `tools/narada-native-carrier/heartbeat-evidence.mjs`.
- Heartbeat evidence reports `alive`, `degraded`, `stale`, and `missing` runtime postures from bounded runtime-handle liveness and reachability.
- Heartbeat evidence includes bounded work packet posture, latest handoff reference, to-data reachability summary, and provider readiness posture without invoking provider transport.
- Tightened work packet summarization to an allowlist of task number/id, status, assignment agent, and source ref so arbitrary prompt, provider output, credential, or secret-like fields are not reflected.
- Supervisor heartbeat evidence is wired through `tools/narada-native-carrier/supervisor.mjs` and remains reconstructable through the existing readiness path.

## Verification

- `node --test tools\narada-native-carrier\heartbeat-evidence.test.mjs` passed: 2 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed: 7 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 5 tests.
- `node --test tools\narada-native-carrier\runtime-handle.test.mjs` passed: 3 tests.

## Acceptance Criteria

- [x] Heartbeat evidence distinguishes alive, degraded, stale, and missing states.
- [x] Heartbeat includes bounded work, handoff, to-data, and provider summaries.
- [x] Tests prove raw transcript, provider output, prompt, and secret values are absent.
