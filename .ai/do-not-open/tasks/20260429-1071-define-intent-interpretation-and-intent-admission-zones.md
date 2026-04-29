---
status: opened
amended_by: architect
amended_at: 2026-04-29T15:51:56.618Z
---

# Define Intent Interpretation and Intent Admission zones

## Chapter

Intent Interpretation and Admission

## Goal

Define Narada doctrine and implementation path for separating natural-language intent interpretation from authority-bearing intent admission, so vague role nudges can become typed candidates without becoming arbitrary execution.

## Context

Inbox envelope env_423be104-8b60-4b60-bfa7-cb3b4197742c records that short Builder nudges such as 'process tasks', 'go on', or 'continue' should not require magic phrasing from the Operator, but also must not become arbitrary execution. The correct decomposition is two governed zones: Intent Interpretation turns natural/operator utterances into typed intent candidates with confidence and ambiguity evidence; Intent Admission decides whether those candidates are admitted, refused, routed, deferred, clarified, or handed off under the target authority.

## Required Work

1. Read docs/concepts/command-execution-intent-zone.md, docs/concepts/canonical-inbox.md, docs/concepts/narada-mcp-facade.md, docs/concepts/inhabited-evolution.md, docs/concepts/capa-operation.md, docs/concepts/governed-crossing.md, and role bootstrap guidance in AGENTS. 2. Add doctrine defining Intent Interpretation Zone: inputs, outputs, non-execution authority limit, confidence, ambiguity, and candidate shape. 3. Add doctrine defining Intent Admission Zone: typed candidate inputs from chat, inbox, CLI, MCP, UI, file-drop, schedule; checks for target authority, role posture, task/chapter state, stop rules, capability, freshness, mutation risk, and review/handoff requirements; admitted outcomes and refusal/clarification/deferral behavior. 4. Define role inhabitation entry protocol so Builder activation or vague continuation discovers assigned/open work, applies stop rules, chooses next admissible path, artifacts large evidence, updates lifecycle, and leaves review_request handoff when expected. 5. Define bounded admitted path enum or equivalent controlled set, including continue_current_task, discover_next_task, process_assigned_tasks, review_completed_work, submit_observation, repair_local_system, answer_question_only, ask_clarifying_question, refuse_due_to_guardrail, and handoff_for_review. 6. Link doctrine to canonical inbox scale-relative crossing metadata and clarify that inbox envelopes carrying typed intent enter at Intent Admission while chat usually enters Interpretation first. 7. Specify implementation follow-up or first machinery slice without collapsing interpretation into execution. 8. Verify with pnpm verify if safe or focused docs/task guard when Builder dirty implementation prevents full verification.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:51:56.618Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Intent Interpretation Zone is defined with inputs outputs authority limits confidence ambiguity and non-execution rule
- [ ] Intent Admission Zone is defined with inputs outputs authority checks admissible path outcomes and refusal clarification deferral handoff behavior
- [ ] Role inhabitation entry protocols explain how Builder handles vague continuation through interpretation then admission instead of magic phrases
- [ ] Doctrine links to canonical inbox CEIZ MCP facade task lifecycle and role bootstrap surfaces
- [ ] Implementation follow-up or initial machinery path is specified without collapsing interpretation into execution and pnpm verify or focused docs verification passes
