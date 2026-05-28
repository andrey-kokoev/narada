---
status: closed
depends_on: [1282, 1283, 1284]
closed_at: 2026-05-15T20:45:21.259Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement Claude Code interactive session lifecycle

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1288-1290-claude-code-carrier-stage-3.md

## Goal

Extend the Claude Code carrier from policy-gated process launch to a bounded interactive Carrier Session lifecycle.

## Context

Stage 2 should admit and prove narrow process launch. Stage 3 should make the carrier operationally usable for an interactive session while preserving Narada proper as authority.

## Required Work

1. Add lifecycle handling for start, ready, resumed, interrupted, handoff_requested, close_requested, closed, and failed Claude Code carrier states.
2. Record durable evidence for lifecycle transitions, runtime pid or handle where available, startup hydration result, and closeout posture.
3. Ensure interactive session state can be reconstructed from launch result and carrier-session evidence.
4. Expose bounded status/readback for the latest Claude Code carrier session.

## Non-Goals

- Do not grant arbitrary tool execution authority.
- Do not make chat transcript or runtime logs the authority locus.
- Do not implement multi-agent orchestration in this task.

## Execution Notes

- Added `tools/agent-start/claude-code-lifecycle.mjs` to model and evidence bounded Claude Code interactive Carrier Session lifecycle transitions.
- Lifecycle states covered: start, ready, resumed, interrupted, handoff_requested, close_requested, closed, and failed.
- Lifecycle events record agent id, agent start event id, carrier session id, runtime handle when available, startup hydration result, closeout posture, failure evidence, launch result/process-attempt refs, and authority posture.
- Added reconstruction from launch result, process-attempt, and lifecycle event evidence without requiring direct SQLite inspection.
- Added bounded latest-session readback for the current/last known Claude Code session lifecycle state.
- Preserved the invariant that lifecycle/readback does not admit task, inbox, outbox, publication, Site mutation, credential, native shell, or external Site authority.
- Fixed event ordering to reconstruct by recorded numeric lifecycle index instead of filesystem timing.

## Verification

- `node --test tools\agent-start\claude-code-lifecycle.test.mjs` passed with 1 test.
- `node --test tools\agent-start\start-agent.test.mjs` passed with 12 tests.
- The lifecycle fixture writes reconstructable interrupted, closed, and failed evidence without requiring live Claude Code installation.

## Acceptance Criteria

- [x] Claude Code carrier lifecycle states are modeled and evidenced.
- [x] Readback reports current or last known session lifecycle state.
- [x] Interrupted and closed states produce reconstructable evidence.
- [x] Tests cover lifecycle transition evidence without requiring live Claude Code installation.
