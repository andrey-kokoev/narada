---
status: closed
depends_on: [1255]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T02:12:57.782Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T02:12:58.272Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Add read-only crew launch intent sequence verifier

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Make Narada proper crew launch intent sequences checkable without executing launch.

## Context

Chapter: narada-proper-crew-launch-intent-sequences. Depends on task 1255 materialized launch intent artifacts.

## Required Work

Add a local verifier script/tool for .narada/crew launch intent sequence JSON that validates required live MCP tool names against .narada/capabilities/mcp-surfaces.json, verifies non-admitted launch side effects remain false/listed, and reports launch/focus/bind execution as blocked unless a carrier is separately admitted. Add tests and audit evidence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Verifier passes for architect launch intent sequence
- [x] Verifier fails/refuses when process launch or direct shortcut execution is marked admitted
- [x] No launch, .lnk creation, PC-locus, or operator-surface runtime mutation occurs
