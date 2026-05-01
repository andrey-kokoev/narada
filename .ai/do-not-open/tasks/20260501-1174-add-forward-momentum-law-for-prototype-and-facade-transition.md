---
status: opened
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

- [ ] Agent-facing docs state that prototype, facade, spike, or partial-capability closure is a transition point, not an endpoint.
- [ ] Review/closure language distinguishes scope-complete, capability-complete, doctrine-complete, and transition-complete.
- [ ] Tasks that create multiple typed surfaces or branches require each branch to have implementation, deferral with rationale, or rejection evidence.
- [ ] Role-loop docs instruct agents to preserve the full capability shape, not only the most recently named fragment.
- [ ] Forward-momentum behavior is documented as sanctioned when local, low-risk, and within role authority.
- [ ] The typed MCP Inbox MCP plus EE-MCP incident is referenced as the motivating fixture or replay evidence.
