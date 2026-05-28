---
status: closed
depends_on: [1308, 1321, 1322, 1323, 1324, 1325, 1326]
closed_at: 2026-05-16T03:11:55.280Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement to-data orchestration stage

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1327-1332-narada-native-carrier-orchestration-wrapper.md

## Goal

Invoke required to-data readers before intelligence invocation and refuse when required data is unavailable.

## Context

The wrapper must not synthesize missing authority or proceed to intelligence when the governed data packet is absent.

## Required Work

1. Invoke to-data readers for task packet, readiness, and evidence refs before intelligence invocation.
2. Emit a bounded refusal handoff and closeout when required data is unavailable.
3. Add tests proving missing to-data returns refused_missing_data_packet before adapter or provider invocation.

## Non-Goals

- Do not claim work or mutate task lifecycle from this stage.
- Do not directly inspect SQLite as the normal data path.
- Do not bypass to-data packet attribution.

## Execution Notes

- Added `tools/narada-native-carrier/to-data-orchestration-stage.mjs`.
- The stage invokes required to-data readers for `task_packet`, `readiness_snapshot`, and `evidence_ref_summary` before intelligence invocation.
- Missing or refused required packets return bounded refusal results with refusal handoff evidence, closeout evidence, no intelligence invocation, and all mutation flags false.
- Added `tools/narada-native-carrier/to-data-orchestration-stage.test.mjs` proving reader order, success path, missing task packet refusal, refused readiness packet refusal, and no provider/adapter invocation after missing data.

## Verification

- `node --test tools\narada-native-carrier\to-data-orchestration-stage.test.mjs` passed: 3 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 70 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] The wrapper reads required data through to-data packets before invoking intelligence.
- [x] Missing required data produces bounded refusal evidence.
- [x] Tests prove no provider invocation occurs after missing required data.
