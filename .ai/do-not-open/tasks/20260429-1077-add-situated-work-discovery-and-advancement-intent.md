---
status: closed
amended_by: architect
amended_at: 2026-04-29T16:56:20.366Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T17:06:41.572Z
criteria_proof_verification:
  state: unbound
  rationale: Defined situated_work_discovery_and_advancement as an interpretation-to-admission path; specified Architect, Builder, and Resident checklists; covered outcomes for review, tasks, inbox, answer-only, clarification, refusal, deferral, and handoff; required Site/role/session/task/chapter/inbox/handoff/verification/residual/authority checks; linked source envelope through task and verified with pnpm verify.
closed_at: 2026-04-29T17:06:55.942Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add situated work discovery and advancement intent

## Chapter

Intent Interpretation and Admission

## Goal

Define and prepare implementation of a role-bounded situated work discovery and advancement intent so ordinary Operator nudges like builder is done, where are we, continue, or what next become governed work-surface checks and next admissible actions rather than magic phrases.

## Context

Inbox envelope env_2e3c341a-ad66-44d3-a7fe-72884390d540 extends the closed Intent Interpretation/Admission task 1071. It observes that Operator should not need magic phrases like 'process inbox'. Natural situated nudges such as 'builder is done', 'where are we', 'continue', or 'what next' should be interpreted into a bounded role/Site work-surface discovery and advancement intent, then admitted or refused through the Intent Admission zone.

## Required Work

1. Read docs/concepts/intent-interpretation-admission-zones.md, AGENTS role bootstrap guidance, canonical inbox docs, task lifecycle docs, and task 1071 evidence. 2. Define situated_work_discovery_and_advancement or a better named intent candidate. 3. Specify interpretation inputs: ordinary Operator nudges, current Site, role, session, recent work, and authority posture. 4. Specify admission checks: task/chapter state, handoff/review surfaces, inbox relevance, working tree, latest commits, verification posture, residuals, blocked items, role-specific expectations, and mutation authority. 5. Define role-specific checklists for Architect, Builder, and Resident. 6. Define admissible outcomes and stop/clarification/refusal rules so the intent does not become arbitrary autonomous action. 7. Link this doctrine to existing intent zones and current workboard/handoff tasks. 8. Specify first machinery slice or CLI/MCP surface if appropriate. 9. Verify with focused docs guard or pnpm verify when safe.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T16:56:20.366Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A situated work discovery and advancement intent is defined as an Intent Interpretation to Intent Admission path
- [x] Role-specific checklists are specified for Architect Builder and Resident without becoming unbounded autonomous action
- [x] Admitted outcomes cover review builder output process assigned tasks process inbox answer question ask clarification refuse defer or handoff as appropriate
- [x] The intent checks current Site role session task chapter inbox handoff verification residual and authority posture surfaces
- [x] Source inbox envelope is routed and focused docs verification or pnpm verify passes
