---
status: opened
---

# Consolidate compact role-loop ergonomics surfaces

## Goal

Create a coherent compact role-loop surface for Architect and Builder duties so next-loop behavior no longer depends on remembered convention or ad hoc parsing.

## Context

Source inbox envelope env_1fa63e04-f234-4a68-840f-b123e3c65040 groups operator-loop ergonomics gaps: no compact Architect next-loop command, PowerShell wrapping damage, inconsistent task create/work-next output shapes, weak dirty ownership visibility, schema-unsafe operator-surface inspect, and informal role-loop semantics.

## Required Work

1. Inventory existing compact inbox, workboard, work-next, task-create, operator-surface inspect, and role-loop guidance. 2. Design a canonical compact Architect loop command that reports pending reviews, architect-owned work, blocked Builder tasks, underspecified handoffs, dirty ownership posture, and recommended next action. 3. Specify or implement stable output modes for agent and chat consumption that avoid PowerShell table wrapping and full payload echo by default. 4. Normalize task create and work-next output shapes so success, blocked, no-work, and pulled-work states are consistently machine-readable and compact-renderable. 5. Add or specify a dirty ownership classifier that groups changed files by task, evidence, agent ownership, stale state, or unknown ownership. 6. Document role-loop primitives so an Operator nudge such as next enters an intent interpretation path rather than relying on magic-spell memory. 7. Keep the work staged into coherent slices if full implementation is too large for one task, but produce a concrete execution plan and first implementable slice.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] There is a documented or implemented compact Architect loop surface with recommended next action.
- [ ] Agent/chat output modes avoid full payload echo and table wrapping by default.
- [ ] Task create and work-next success/blocked/no-work/pulled-work states have consistent machine-readable shape or a task captures the exact remaining delta.
- [ ] Dirty working tree ownership can be classified or a precise implementation task is created for it.
- [ ] Role-loop docs explain how next resolves into governed duties rather than remembered convention.
