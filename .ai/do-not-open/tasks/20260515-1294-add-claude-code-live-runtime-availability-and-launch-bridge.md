---
status: confirmed
depends_on: [1288, 1289, 1290, 1291, 1292, 1293]
closed_at: 2026-05-15T23:48:50.205Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add Claude Code live runtime availability and launch bridge

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1294-1299-agent-carriers-stage-4-operationalization.md

## Goal

Move Claude Code carrier launch from fixture/readback proof to a live-runtime launch bridge when the declared Claude Code runtime is available.

## Context

Stage 3 proved Claude Code lifecycle, effect mediation, and operator affordance packets without requiring live Claude Code availability. Stage 4 should add the smallest live launch bridge while preserving Narada proper as the authority locus.

## Required Work

1. Add live Claude Code runtime discovery through declared PATH/shim resolution or configured carrier runtime reference, without hardcoding Node, package-manager, NVM, WSL, or terminal-specific paths.
2. Implement a launch bridge that consumes the existing Claude Code launch packet and records live launch attempt evidence before and after process start.
3. Preserve refusal/readiness diagnostics when the live Claude Code runtime is unavailable, not configured, or ambiguous.
4. Record pid/process handle, startup command posture, MCP approval posture, withheld authorities, and closeout/readback evidence without storing raw transcripts or secrets.

## Non-Goals

- Do not grant Claude Code task, inbox, outbox, publication, credential, native shell, or external Site mutation authority.
- Do not bind authority to volatile terminal/window ids.
- Do not require live Claude Code availability for unit tests.

## Execution Notes

- Added `tools/agent-start/claude-code-live-runtime.mjs` with bounded Claude Code runtime discovery through either `NARADA_CLAUDE_CODE_RUNTIME_COMMAND` or PATH resolution for the declared `claude` command.
- Runtime discovery reports `available`, `unavailable`, or `ambiguous` with actionable diagnostics and does not hardcode Node, package-manager, NVM, WSL, or terminal-specific paths.
- Added a live launch bridge that consumes an existing Claude Code launch packet, records pre/post process-start evidence, preserves startup command and MCP approval posture, records pid/process-handle evidence, and refuses unavailable or ambiguous runtime states before spawn.
- Launch evidence records withheld authorities, no direct task/inbox/outbox/publication mutation, no credential access, and no raw transcript or secret values.
- Repaired rejected review finding: live launch now constructs a bounded carrier environment from allowlisted `NARADA_*` launch-packet variables only, without inheriting ambient parent `process.env` or unrelated secret-bearing variables.
- Added tests covering configured runtime availability, unavailable PATH state, ambiguous PATH state, refused launch evidence, and started launch evidence without requiring a live Claude Code install.

## Verification

- `node --test tools\agent-start\claude-code-live-runtime.test.mjs` passed with 5 tests.
- `node --test tools\agent-start\claude-code-smoke.test.mjs` passed with 2 tests.
- `node --test tools\agent-start\start-agent.test.mjs` passed with 12 tests.
- `node --test tools\agent-start\claude-code-lifecycle.test.mjs` passed with 1 test.
- `node --test tools\agent-start\claude-code-affordance.test.mjs` passed with 1 test.

## Acceptance Criteria

- [x] Claude Code runtime availability is reported through a bounded doctor/readiness surface.
- [x] Live launch attempts use the existing launch packet and emit reconstructable evidence.
- [x] Unavailable or ambiguous runtime posture is refused with actionable diagnostics.
- [x] Tests cover configured, unavailable, and ambiguous runtime states without requiring a live Claude Code install.
