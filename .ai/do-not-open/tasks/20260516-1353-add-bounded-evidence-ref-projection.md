---
status: closed
depends_on: [1312, 1339]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T03:48:33.796Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by evidence-ref-projection and readiness focused tests recorded in task verification.
closed_at: 2026-05-16T03:52:56.977Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add bounded evidence-ref projection

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1351-1356-narada-native-operator-launch-doctor-affordances.md

## Goal

Project Narada-native evidence refs without raw transcript, prompt, provider output, or credential leakage.

## Context

Operator surfaces need enough evidence refs for reconstruction, not private payload display.

## Required Work

1. List evidence refs by family, status, path, and recency only.
2. Redact or omit raw transcript, prompt, provider output, credential, and secret-like values.
3. Add tests with secret-like fixture data proving raw values are omitted.

## Non-Goals

- Do not inline full evidence payloads.
- Do not expose raw provider output.
- Do not read credential stores for display.

## Execution Notes

- Added `tools/narada-native-carrier/evidence-ref-projection.mjs` for bounded evidence-ref projection.
- Projection lists session evidence refs by family, status, path, recorded timestamp, and recency bucket only.
- The projector reads JSON only to classify family/status/recency and omits raw transcript, prompt, provider output, credential, and secret-like values.
- Added fixture tests with secret-like provider invocation data proving raw values are absent from projection output.
- Repaired review finding from `review-20260516-1353-add-bounded-evidence-ref-projection-1778903438232`: evidence paths and status values are now redacted when they contain secret-like values.
- Added a fixture test with a secret-like evidence filename and status to prove path/status values do not leak.

## Verification

- `node --test tools\narada-native-carrier\evidence-ref-projection.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed: 7 tests.

## Acceptance Criteria

- [x] Evidence refs are bounded by family, status, path, and recency.
- [x] Secret-like and raw model values are omitted.
- [x] Tests prove projection is redacted.
