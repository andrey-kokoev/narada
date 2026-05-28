---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:44:10.203Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify live supervised session chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured build chapter for a real Narada-native supervised session lifecycle with start, heartbeat, interrupt, close, and reconstruction evidence.

## Context

The current supervised lifecycle is fixture-oriented. A live supervised session chapter should prove runtime handles and adapter reachability without granting Narada authority to the carrier.

## Required Work

1. Inspect supervisor lifecycle, doctor, readiness, and reconstruction code.
2. Define live session startup and heartbeat evidence that can report to-data and to-intelligence reachability.
3. Specify interrupt, close, failure, and reconstruction behavior.
4. Include tests for blocked, fixture-only, provider-backed, and live-running states.
5. Submit structured chapter input with ordered build tasks.

## Non-Goals

- Do not require a permanently running daemon to pass unit tests.
- Do not store raw transcripts or raw provider outputs in supervisor evidence.
- Do not let runtime liveness become task authority.

## Execution Notes

- Inspected supervisor lifecycle, CLI, readiness, and reconstruction surfaces. Current lifecycle records bounded JSON evidence for start, heartbeat, interrupt, close, failure, doctor, and reconstruction, but runtime handles are fixture-oriented.
- Boundary decision: live runtime liveness is evidence about a carrier embodiment, not task/effect authority. Supervisor events may report reachability and health, but may not execute task, inbox, outbox, command, publication, credential, or external Site mutations.

## Structured Chapter Input

Chapter: `narada-native-live-supervised-session`

Goal: Implement live supervised session lifecycle evidence for Narada-native carriers, distinguishing fixture-only, provider-backed, blocked, failed, and live-running states from durable bounded evidence.

Ordered implementation tasks:

1. `Define live runtime handle schema`
   - Add runtime handle kinds for `local_process`, `mcp_session`, and `fixture`.
   - Fields include stable handle id, process/session presence, started_at, heartbeat_due_at, reachability summary, and raw transcript/secret flags false.
   - Verification: schema tests for fixture, live process, and missing runtime handles.

2. `Implement live start evidence`
   - Start records runtime handle and configured to-data/to-intelligence reachability probes without performing provider calls or task mutations.
   - Blocked posture is emitted for missing registration, missing consent, stale/revoked grant, or missing required local executable.
   - Verification: tests cover fixture-only, provider-configured, blocked-missing-capability, and blocked-runtime-unavailable start.

3. `Implement heartbeat evidence`
   - Heartbeat reports runtime alive/degraded/stale, latest bounded work packet summary, latest handoff ref, to-data reachability, and provider readiness posture.
   - Verification: tests prove no raw transcript, raw provider output, or secret values are recorded.

4. `Implement interrupt/close/failure semantics`
   - Interrupt records requested/acknowledged/unsupported without killing unrelated processes.
   - Close records stopped/unknown/stale with authority transfer false.
   - Failure records reason class and terminal flag with bounded diagnostics.
   - Verification: tests for clean close, stale close, interrupted, failed nonterminal, and failed terminal states.

5. `Expand supervisor doctor states`
   - Doctor distinguishes `fixture_only`, `provider_configured`, `blocked`, `running`, `degraded`, `failed`, `interrupted`, and `stopped`.
   - It reports residual blockers and next diagnostic command, not repair mutation.
   - Verification: doctor tests cover all states.

6. `Expand reconstruction from durable evidence`
   - Reconstruct live session from session JSON files only; no direct SQLite or secret-store inspection required.
   - Verification: reconstruction test proves launch, supervisor events, adapter evidence, handoff, interrupt, and closeout can be read back in order.

Residuals:

- Unit tests should use fake runtime handles and mocked reachability; live provider/network execution remains out of scope.
- Operator launch affordances belong to a later operator/doctor chapter.

## Verification

- Inspected `tools\narada-native-carrier\supervisor.mjs`.
- Inspected `tools\narada-native-carrier\supervisor-cli.mjs`.
- Inspected `tools\narada-native-carrier\readiness.mjs`.

## Acceptance Criteria

- [x] The proposal defines live supervised session lifecycle evidence.
- [x] Doctor output distinguishes fixture-only, provider-backed, blocked, failed, and live-running states.
- [x] Session reconstruction works from durable bounded evidence.
- [x] The chapter is ready for governed commission.
