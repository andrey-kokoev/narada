---
status: confirmed
depends_on: [1288, 1289, 1290, 1291, 1292, 1293]
closed_at: 2026-05-15T23:50:20.287Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add Narada-native supervised session runtime and operational doctor

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1294-1299-agent-carriers-stage-4-operationalization.md

## Goal

Make Narada-native sessions startable, inspectable, interruptible, and closeable under a supervised local runtime posture.

## Context

Stage 3 proved reconstruction/readiness helpers but explicitly did not claim production daemon readiness. Stage 4 should add the local supervised session mechanics needed for day-to-day operational use without making the supervisor a new authority owner.

## Required Work

1. Add a supervised session runner or control module for start, heartbeat, inspect, interrupt, close, failure, and reconstruction states.
2. Record supervisor evidence for runtime handle, heartbeat/readiness, adapter posture, capability posture, latest work packet, latest handoff, and closeout.
3. Expose an operational doctor/readback command that reports whether Narada-native is fixture-only, provider-configured, running, stopped, failed, or blocked.
4. Verify that the supervisor cannot mutate task, inbox, outbox, publication, credential, or external Site state except through canonical request surfaces.

## Non-Goals

- Do not install a system service or scheduled task unless separately admitted.
- Do not make the supervised runtime autonomous across unbounded work queues.
- Do not grant provider credentials, shell authority, or external effects by implication.

## Execution Notes

- Added `tools/narada-native-carrier/supervisor.mjs` with supervised local session controls for start, heartbeat/inspect, interrupt, close, failure, event readback, and reconstruction-aware doctor output.
- Added `tools/narada-native-carrier/supervisor-cli.mjs` as a bounded operator-facing command surface for `doctor`, `inspect`, `start`, `heartbeat`, `interrupt`, `close`, and `fail` posture readback/control.
- Supervisor evidence records runtime handle, adapter posture, capability/registration posture, latest evidence refs, latest work packet summary, latest handoff summary, residual blockers, closeout/failure state, and authority non-claims.
- `supervisorDoctor` distinguishes fixture fallback, provider-configured, running, stopped, failed, and blocked states using supervisor events, adapter registration readiness, and reconstruction/readiness residuals.
- Supervisor records no raw transcripts, no raw secret values, no credential access, and no direct task lifecycle, inbox, outbox, publication, or external Site mutation.
- Added tests covering start/heartbeat/interrupt/close/reconstruction, provider-configured/running/failed/blocked doctor states, evidence redaction, authority non-claims, direct command-function readback, and JSON output from the CLI script.
- Rejected review repair: supervisor is no longer only a module-helper surface; the CLI script provides bounded operational readback/control, and adjacent dependency repairs now make adapter registration refuse unsafe evidence policy and task handoff use real governed read/report command shapes.

## Verification

- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed with 5 tests.
- `node --test tools\narada-native-carrier\task-handoff.test.mjs` passed with 5 tests.
- `node --test tools\narada-native-carrier\adapter-registration.test.mjs` passed with 6 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed with 2 tests.

## Acceptance Criteria

- [x] Narada-native supervised session lifecycle is startable, inspectable, interruptible, closeable, and reconstructable.
- [x] Operational doctor/readback distinguishes fixture-only, provider-configured, running, stopped, failed, and blocked states.
- [x] Supervisor evidence excludes raw transcripts and secret values.
- [x] Tests or smoke proof verify lifecycle, doctor output, and authority non-claims.
