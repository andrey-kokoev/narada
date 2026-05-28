---
status: confirmed
depends_on: [1288, 1289, 1290, 1291, 1292, 1293]
closed_at: 2026-05-15T23:49:06.577Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Prove Claude Code live session smoke lifecycle

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1294-1299-agent-carriers-stage-4-operationalization.md

## Goal

Run and verify a bounded Claude Code carrier live-session smoke path when the runtime is available, with a fixture fallback for CI.

## Context

A carrier is not fully operational until a real session can be launched, inspected, interrupted or closed, and reconstructed from durable evidence. This task proves that path without granting the carrier direct Narada authority.

## Required Work

1. Add a smoke command or fixture harness that exercises launch, startup hydration, ready/readback, interrupt, close, and reconstruction for a Claude Code carrier session.
2. When live Claude Code is available, run one bounded no-effect session and capture evidence refs; when unavailable, emit a skipped-with-blocker proof rather than a false pass.
3. Verify effect requests during the smoke remain mediated as inert or governed handoff candidates.
4. Document the exact operator commands for launch, inspect, interrupt, close, and reconstruct.

## Non-Goals

- Do not execute arbitrary Claude Code tool calls as part of the smoke.
- Do not treat transcript output as lifecycle authority.
- Do not require network access or external account credentials unless separately admitted.

## Execution Notes

- Added `tools/agent-start/claude-code-smoke.mjs` as the bounded Claude Code live-session smoke proof surface.
- The smoke path builds an existing Claude Code launch packet, records launch result and process-attempt evidence, runs the live-runtime bridge, then records lifecycle events for start, ready/startup hydration affordance, interrupt, close request, closed, readback, and reconstruction.
- Runtime unavailable or ambiguous posture emits a `skipped_with_blocker` smoke proof with launch/process-attempt/live-launch evidence refs and `operational_success_claimed: false`.
- Available runtime smoke uses a no-effect spawn handle, records lifecycle/reconstruction evidence, and mediates a task effect request as an inert governed candidate.
- Repaired rejected review finding inherited from task 1294: smoke proof now runs through the bounded live launch bridge environment and asserts the spawned carrier receives only allowlisted `NARADA_*` startup variables, with parent environment inheritance disabled.
- Documented operator affordances in the smoke proof for launch, inspect, interrupt, close, and reconstruct.

## Verification

- `node --test tools\agent-start\claude-code-smoke.test.mjs` passed with 2 tests.
- `node --test tools\agent-start\claude-code-live-runtime.test.mjs` passed with 5 tests.
- `node --test tools\agent-start\claude-code-lifecycle.test.mjs` passed with 1 test.
- `node --test tools\agent-start\claude-code-effect-mediator.test.mjs` passed with 4 tests.

## Acceptance Criteria

- [x] A smoke surface exists for Claude Code live-session lifecycle proof.
- [x] The smoke path produces durable launch/readback/interrupt/close/reconstruction evidence.
- [x] Runtime-unavailable posture is explicit and does not claim operational success.
- [x] Effect mediation remains enforced during the smoke.
