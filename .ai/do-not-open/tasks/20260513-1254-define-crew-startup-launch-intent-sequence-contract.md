---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T02:08:16.719Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T02:08:17.165Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Define crew startup launch intent sequence contract

## Chapter

narada-proper-crew-launch-intent-sequences

## Goal

Extend crew startup shortcut contracts from static startup plans to working launch intent sequences.

## Context

Chapter: narada-proper-crew-launch-intent-sequences. Existing posture is descriptor/projection-only; agent-context memory plan_hydration/readback is now live.

## Required Work

Add package-level types/builders/tests for a launch intent sequence that composes startup request, required MCP readiness checks, optional checkpoint read/hydration plan, launch handoff descriptor, and explicit non-admissions for process launch, .lnk creation, PC-locus mutation, operator-surface runtime mutation, and native shell fallback.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Package can build a launch intent sequence from a crew startup request
- [x] Sequence distinguishes executable handoff intent from process launch
- [x] Refusal tests cover direct shortcut execution/native shell/PC/operator-surface runtime imports
