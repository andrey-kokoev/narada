---
status: closed
depends_on: [1285, 1286, 1287]
closed_at: 2026-05-15T21:21:33.187Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add Narada-native model adapter boundary

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1291-1293-narada-native-carrier-stage-3.md

## Goal

Add a replaceable model/executor adapter boundary to the Narada-native carrier without granting effect authority.

## Context

Stage 2 should materialize a minimal native session harness. Stage 3 should let the harness host a model/executor adapter behind explicit capability and evidence boundaries.

## Required Work

1. Define the adapter interface for prompt/context input, tool proposal output, refusal output, and closeout summary.
2. Implement a deterministic fixture adapter for tests and a placeholder production adapter registration point.
3. Keep adapter output inert until admitted through canonical Narada surfaces.
4. Record adapter invocation evidence without storing secrets or unbounded transcripts by default.

## Non-Goals

- Do not choose or hardwire a production model provider in this task.
- Do not grant native shell or credential authority to the adapter.
- Do not make adapter output a decision or mutation authority.

## Execution Notes

- Added `tools/narada-native-carrier/adapter.mjs` as the replaceable Narada-native model/executor adapter boundary.
- Implemented a deterministic fixture adapter that accepts prompt/context input, emits text output, refusal output, inert proposed action packets, and closeout summary.
- Adapter invocation evidence records boundary posture, input summary, adapter output, and explicitly avoids raw secrets or unbounded transcript storage.
- Adapter output remains inert until admitted through canonical Narada surfaces; model/executor adapters own no effect authority.
- Repaired rejected review finding: persisted adapter invocation evidence now stores sanitized output summaries, omits raw `text_output` and proposed-action payload values, and bounds prompt/transcript evidence by default.
- Added focused tests for inert proposal output, invocation evidence, authority separation, refusal without prompt, and redaction of raw adapter output and prompt-like secrets.

## Verification

- `node --test tools\narada-native-carrier\adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\work-loop.test.mjs` passed with 1 test.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed with 1 test.

## Acceptance Criteria

- [x] Narada-native carrier has a documented model/executor adapter interface.
- [x] A deterministic fixture adapter can run inside the carrier harness.
- [x] Adapter outputs are inert proposals until admitted elsewhere.
- [x] Tests prove adapter invocation evidence and authority separation.
