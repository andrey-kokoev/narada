---
status: closed
depends_on: [1308, 1321, 1322, 1323, 1324, 1325, 1326]
closed_at: 2026-05-16T03:11:36.877Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define carrier orchestration session contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1327-1332-narada-native-carrier-orchestration-wrapper.md

## Goal

Define the Narada-native wrapper input and output contract for composing to-data, to-intelligence, and handoff emission.

## Context

The carrier needs a wrapper contract before orchestration code can safely coordinate bounded reads, intelligence invocation, and inert handoff drafts.

## Required Work

1. Specify wrapper input fields: siteRoot, carrierSessionId, agentId, taskNumber, to-data registry, provider or intelligence registry, capability lookup, and clock.
2. Specify orchestration_result.v0 output fields for mode, stage statuses, evidence refs, refusal or fallback reason, and all mutation flags false.
3. Add schema tests covering success, refusal, fixture fallback, provider-backed execution, and no-authority flags.

## Non-Goals

- Do not implement live provider transport in this task.
- Do not call task report, task close, inbox, outbox, command, or publication commands.
- Do not store raw prompts, raw provider outputs, raw transcripts, or credential values.

## Execution Notes

- Added `tools/narada-native-carrier/orchestration-session-contract.mjs` with explicit wrapper input and orchestration result schemas.
- Wrapper input fields include `siteRoot`, `carrierSessionId`, `agentId`, `taskNumber`, `toDataRegistry`, `providerOrIntelligenceRegistry`, `capabilityLookup`, and `clock`.
- `orchestration_result.v0` fields include mode, status, stage statuses, evidence refs, refusal/fallback reasons, Intelligence-Authority Separation posture, raw-output flags, and all mutation flags false.
- Added validation for no-authority posture, inert intelligence output, no authority decision, and no raw prompt/provider output/transcript/secret recording.
- Added `tools/narada-native-carrier/orchestration-session-contract.test.mjs` covering success, refusal, fixture fallback, provider-backed execution, and no-authority validation.

## Verification

- `node --test tools\narada-native-carrier\orchestration-session-contract.test.mjs` passed: 5 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 67 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] The wrapper contract has explicit inputs, outputs, stage statuses, evidence refs, and no-mutation flags.
- [x] Schema tests cover success, refusal, fixture fallback, and provider-backed modes.
- [x] The contract preserves Intelligence-Authority Separation.
