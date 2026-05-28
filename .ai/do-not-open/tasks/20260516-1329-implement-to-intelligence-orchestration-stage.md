---
status: closed
depends_on: [1308, 1321, 1322, 1323, 1324, 1325, 1326]
closed_at: 2026-05-16T03:12:13.832Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement to-intelligence orchestration stage

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1327-1332-narada-native-carrier-orchestration-wrapper.md

## Goal

Select fixture or provider execution through registered intelligence posture and preserve outputs as inert proposals.

## Context

Provider text must remain proposed action material, not a Narada decision or direct mutation authority.

## Required Work

1. Select fixture or provider route through existing registration and readiness posture.
2. Preserve provider output as inert proposed_action_packet evidence only.
3. Represent provider refusal, timeout, failure, and malformed output as bounded evidence.
4. Add tests for provider success, refusal, timeout, malformed output, failure, and fixture fallback.

## Non-Goals

- Do not require live network providers in normal tests.
- Do not admit provider output as task evidence without canonical review.
- Do not store raw provider output or unbounded transcript text.

## Execution Notes

- Added `tools/narada-native-carrier/to-intelligence-orchestration-stage.mjs`.
- The stage selects fixture fallback or provider-backed route from registration/readiness posture.
- Provider output is normalized through bounded adapter output sanitation and preserved only as inert `proposed_action_packet` evidence requiring canonical admission.
- Provider refusal, timeout, failure, and malformed output are represented as bounded problem observations without raw provider output, raw secrets, or unbounded transcripts.
- Added `tools/narada-native-carrier/to-intelligence-orchestration-stage.test.mjs` covering provider success, refusal, timeout, malformed output, failure, and fixture fallback.

## Verification

- `node --test tools\narada-native-carrier\to-intelligence-orchestration-stage.test.mjs` passed: 4 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 74 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Fixture and provider routes are selected through registered posture.
- [x] All provider outputs remain inert proposed action evidence.
- [x] Tests cover success, refusal, timeout, malformed output, failure, and fixture fallback.
