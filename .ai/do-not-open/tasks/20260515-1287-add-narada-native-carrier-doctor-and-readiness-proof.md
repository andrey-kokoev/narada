---
status: closed
depends_on: [1276]
amended_by: narada.architect
amended_at: 2026-05-15T19:24:26.503Z
closed_at: 2026-05-15T19:24:37.467Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add Narada-native carrier doctor and readiness proof

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1285-1287-narada-native-carrier-stage-2.md

## Goal

Expose native carrier readiness and evidence through a bounded doctor/readback surface.

## Context

Stage 2 needs an operator/reviewer-visible proof that the native harness exists and is bounded, without treating private logs or direct database reads as authority.

## Required Work

1. Add or extend doctor/readback output for native carrier runtime boundary, latest session evidence, lifecycle state, capability posture, and withheld authorities.
2. Add a smoke-proof command or fixture for planned, materialized, and closed native carrier sessions.
3. Ensure readback reports whether any effect execution was attempted and which canonical service would own such effects.
4. Record verification commands suitable for Builder and Architect review.

Continuation Task: task 1291. Follow-up tasks 1292 and 1293 continue the Narada-native adapter, work-loop, and reconstruction/readiness buildout.

## Non-Goals

- Do not claim full autonomous Narada-native operation.
- Do not require external model credentials.
- Do not close stage 3 model-loop or effect-mediation work.

## Execution Notes

- Extended `tools/narada-native-carrier/harness.mjs` with bounded readiness/readback and smoke-proof functions.
- Readiness reports runtime boundary ref, lifecycle/readiness state, latest session evidence path, facade-only capability posture, whether effect execution was attempted, canonical effect owners, and withheld authorities.
- Smoke proof covers planned, materialized, running, and stopped states using the minimal harness evidence from task 1286.
- Readback does not require direct SQLite inspection and does not treat carrier process/readback as task, inbox, outbox, publication, command, law, roster, or capability-consent authority.
- Extended `tools/narada-native-carrier/harness.test.mjs` to assert readiness states, effect owners, withheld authorities, and smoke-proof command output.
- Amended by narada.architect at 2026-05-15T19:24:26.503Z: required work

## Verification

- `node --test tools\narada-native-carrier\harness.test.mjs` passed with 2 tests.
- Stage-2 verification command for Builder/Architect review: `node --test tools\narada-native-carrier\harness.test.mjs`.

## Acceptance Criteria

- [x] Doctor/readback reports native carrier readiness without direct SQLite inspection.
- [x] Smoke proof covers planned, materialized, and closed session states.
- [x] Readback lists withheld authorities and effect owners explicitly.
- [x] Stage-2 verification commands are recorded in the task report.
