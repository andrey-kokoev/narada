---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-01T03:38:52.434Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1777606704449_iwxv3h
no_continuation_needed_rationale: Law-only transition guardrail task; no separate continuation branch is needed because the implemented, tested change is the closure-language and prototype/facade posture update itself.
closed_at: 2026-05-01T03:41:41.365Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add forward-momentum law for prototype and facade transitions

## Chapter

agent-role-law

## Goal

Teach agents that prototype, facade, spike, and partial-capability closure is a transition point requiring preservation of the whole capability shape.

## Context

Inbox incident env_043fcb72-8038-4a9e-b33d-862bbb3bc597 reports that a typed MCP facade/prototype closure created Inbox MCP continuation but initially missed the sibling EE-MCP branch until Operator correction. This is broader than lifecycle mechanics: agent-facing law must preserve the full capability shape and continue coherent next work unless blocked.

## Required Work

Update agent-facing law, role-loop docs, and review/closure language so prototype/facade/spike closure is classified as scope-complete, capability-complete, doctrine-complete, or transition-complete; require each typed branch or capability surface to receive implementation task, explicit deferral with rationale, or rejection; document that forward momentum means creating the next coherent task and nudging the right role unless blocked or out of scope.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Agent-facing docs state that prototype, facade, spike, or partial-capability closure is a transition point, not an endpoint.
- [x] Review/closure language distinguishes scope-complete, capability-complete, doctrine-complete, and transition-complete.
- [x] Tasks that create multiple typed surfaces or branches require each branch to have implementation, deferral with rationale, or rejection evidence.
- [x] Role-loop docs instruct agents to preserve the full capability shape, not only the most recently named fragment.
- [x] Forward-momentum behavior is documented as sanctioned when local, low-risk, and within role authority.
- [x] The typed MCP Inbox MCP plus EE-MCP incident is referenced as the motivating fixture or replay evidence.
