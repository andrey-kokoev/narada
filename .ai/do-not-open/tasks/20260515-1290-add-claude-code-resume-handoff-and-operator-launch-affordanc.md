---
status: closed
depends_on: [1282, 1283, 1284]
closed_at: 2026-05-15T20:47:13.369Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add Claude Code resume handoff and operator launch affordance

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1288-1290-claude-code-carrier-stage-3.md

## Goal

Make Claude Code carrier sessions discoverable and resumable through operator-facing launch/readback affordances.

## Context

A usable Claude Code carrier needs more than process spawn: operators need a stable way to launch, inspect, resume, interrupt, and close sessions without inferring state from terminal windows.

## Required Work

1. Add operator-facing command or packet output for Claude Code launch, resume, interrupt, handoff, and close requests.
2. Make launch packets include stable session ids, startup command, MCP approval posture, and result sentinel.
3. Add readback for latest session, resumability posture, and required next operator action.
4. Document verification commands and residual limitations for live Claude Code availability.

## Non-Goals

- Do not bind to volatile window ids as authority.
- Do not require a specific terminal emulator.
- Do not claim full product UI integration unless actually implemented.

## Execution Notes

- Added `tools/agent-start/claude-code-affordance.mjs` to produce operator-facing Claude Code launch/readback affordance packets.
- The affordance exposes launch, resume, interrupt, handoff, and close request shapes from durable launch/session evidence.
- Launch/readback includes stable carrier session id, startup command, MCP approval posture, result sentinel, latest session readback, resumability posture, and next operator action.
- Resume posture explicitly does not depend on volatile terminal/window state.
- Added `tools/agent-start/claude-code-affordance.test.mjs` to verify affordance output and authority non-claims from durable fixture evidence.

## Verification

- `node --test tools\agent-start\claude-code-affordance.test.mjs` passed with 1 test.
- Residual limitation: this proves affordance packet/readback behavior without requiring live Claude Code availability or a real terminal/window binding.

## Acceptance Criteria

- [x] Operator-facing affordance exists for Claude Code launch/resume/interrupt/close posture.
- [x] Launch/readback includes stable carrier session identity and startup command.
- [x] Resume posture does not depend on volatile terminal/window state.
- [x] Verification covers affordance output and authority non-claims.
