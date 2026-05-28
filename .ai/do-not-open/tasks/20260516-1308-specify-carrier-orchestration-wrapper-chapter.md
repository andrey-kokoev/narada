---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:41:54.098Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify carrier orchestration wrapper chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured build chapter for composing to-data and to-intelligence adapters inside a supervised Narada-native carrier session.

## Context

A usable carrier needs a wrapper that obtains bounded data, invokes configured intelligence, and emits inert handoff drafts without owning task or effect authority.

## Required Work

1. Inspect current work-loop, task-handoff, supervisor, and reconstruction surfaces.
2. Define orchestration boundaries between to-data reads, to-intelligence invocation, and canonical handoff emission.
3. Specify fallback behavior for missing data adapters, missing provider configuration, refusal, timeout, and malformed outputs.
4. Include tests proving orchestration emits bounded handoff drafts and preserves fixture fallback.
5. Submit structured chapter input with ordered build tasks.

## Non-Goals

- Do not let the wrapper directly close, report, publish, command, or mutate inbox state.
- Do not make provider text a Narada decision.
- Do not require live network providers in normal tests.

## Execution Notes

- Inspected current orchestration-adjacent surfaces:
  - `work-loop.mjs` currently chooses fixture/provider execution and writes governed handoff, interrupt, and closeout evidence.
  - `task-handoff.mjs` admits bounded task packets, calls the registered work loop, and emits task report drafts requiring canonical admission.
  - `supervisor.mjs` records start/heartbeat/interrupt/close/failure evidence and doctor readbacks.
  - `readiness.mjs` reconstructs launch, adapter, handoff, interrupt, and closeout evidence.
- Boundary decision: the orchestration wrapper should compose to-data reads and to-intelligence invocation into inert handoff artifacts. It must not own task report admission, task closure, inbox mutation, outbox transport, command execution, publication, credential reveal, or external Site mutation.

## Structured Chapter Input

Chapter: `narada-native-carrier-orchestration-wrapper`

Goal: Implement a supervised wrapper that composes bounded to-data packets, configured to-intelligence adapters, and canonical handoff draft emission with explicit refusal/fallback behavior.

Ordered implementation tasks:

1. `Define carrier orchestration session contract`
   - Specify wrapper input: `siteRoot`, `carrierSessionId`, `agentId`, `taskNumber`, to-data registry, provider/intelligence registry, capability lookup, and clock.
   - Specify wrapper output: `orchestration_result.v0` with mode, stage statuses, evidence refs, refusal/fallback reason, and all mutation flags false.
   - Verification: schema tests cover success, refusal, fixture fallback, and no-authority flags.

2. `Implement to-data orchestration stage`
   - Invoke to-data readers for task packet, readiness, and evidence refs before intelligence invocation.
   - If required data is unavailable, emit a bounded refusal handoff and closeout rather than synthesizing missing authority.
   - Verification: tests prove missing to-data returns `refused_missing_data_packet` without adapter/provider invocation.

3. `Implement to-intelligence orchestration stage`
   - Select fixture or provider route through existing registration/readiness posture.
   - Preserve provider output as inert `proposed_action_packet` only; provider refusal, timeout, failure, and malformed output remain bounded evidence.
   - Verification: tests prove provider success, provider refusal, timeout, malformed output, and fixture fallback all produce bounded handoff drafts.

4. `Implement canonical handoff emission stage`
   - Emit task-report draft artifacts with suggested `narada task report ... --report-file <draft>` only; do not call task report, task close, inbox, outbox, command, or publication commands.
   - Verification: tests prove direct mutation flags remain false and no lifecycle state changes occur.

5. `Integrate supervisor heartbeat and reconstruction`
   - Add wrapper stage summaries to supervisor heartbeat and readiness reconstruction without raw prompt/output/transcript capture.
   - Verification: reconstruction test proves wrapper evidence can be rebuilt from session JSON refs.

6. `Add end-to-end mocked wrapper proof`
   - Mock to-data and provider transport, run wrapper for a task packet, and assert report draft, handoff, interrupt, closeout, supervisor heartbeat, and readiness posture are coherent.
   - Verification: no raw secrets, raw prompts, raw provider output, unbounded transcripts, credential material, or authority mutations are recorded.

Fallback/refusal matrix:

- Missing to-data adapter: refuse before intelligence invocation.
- Missing provider registration: use fixture fallback only when configured as fixture; otherwise refuse as provider not configured.
- Missing capability/credential reference: bounded refusal evidence.
- Provider refusal/failure/timeout/malformed output: bounded refusal handoff and closeout.
- Handoff draft write failure: supervisor failure evidence, no canonical task mutation.

## Verification

- Inspected `tools\narada-native-carrier\work-loop.mjs`.
- Inspected `tools\narada-native-carrier\task-handoff.mjs`.
- Inspected `tools\narada-native-carrier\supervisor.mjs`.
- Inspected `tools\narada-native-carrier\readiness.mjs`.

## Acceptance Criteria

- [x] The proposed chapter cleanly composes to-data and to-intelligence through a wrapper.
- [x] The wrapper has explicit refusal and fallback behavior.
- [x] All outputs remain inert until canonical admission.
- [x] The chapter is ready for governed commission.
