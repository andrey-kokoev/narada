---
status: in_review
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-15T15:19:32.990Z
criteria_proof_verification:
  state: unbound
  rationale: Verification is recorded in WorkResultReport wrr_f98511dd_20260515-1273-repair-lifecycle-scheduler-claimability-for-admitted-tasks_narada.builder: peek-next returned task 1275, task list showed 1275 and 1276 opened, and lifecycle status showed allocation max 1276 with no drift.
---

# Repair lifecycle scheduler claimability for admitted tasks

## Chapter

Canonical Inbox Promotions

## Goal

Make admitted task lifecycle rows routeable or claimable through the governed Builder work-next path without bypassing lifecycle authority.

## Context

Source inbox envelope: env_e49203fc-f25f-4108-a024-ce051fb01f38

Source: agent_report:codex_session:2026-05-15:agent-carrier-buildout-tasks-admitted-not-claimable

Envelope kind: observation

Summary: Operator expected concrete buildout tasks for Claude Code and Narada native Agent Carrier types. Two lifecycle rows were admitted and read back successfully, but narada_task_work_next for narada.builder still reports no_admissible_task. Current MCP facade exposes admission/read/work-next, but no route/assign/allocate surface to make admitted rows scheduler-claimable.

Evidence:
- Admitted task 20260515-build-agent-carrier-type-claude-code with readback status admitted in D:\code\narada\.ai\task-lifecycle.db.
- Admitted task 20260515-build-agent-carrier-type-narada-native with readback status admitted in D:\code\narada\.ai\task-lifecycle.db.
- Mutation evidence paths: .ai/mutation-evidence/task_lifecycle/mcp_ce69ef6ab1807ed9.json and .ai/mutation-evidence/task_lifecycle/mcp_6e7acd6586f98b68.json.
- narada_task_work_next for narada.builder returned status empty, reason no_admissible_task after both admissions.
- tool_search exposed no task route/assign/allocate MCP surface in this session.

Proposal:
- Expose or use a governed route/assign/allocate surface for admitted task lifecycle rows so Builder work-next can claim them.
- Route the two admitted carrier buildout tasks to narada.builder or another declared Builder-capable agent.
- Clarify whether MCP task admission should itself create claimable work or only inert lifecycle evidence.

Recommendation: Promote to a Narada proper task or repair item for lifecycle/work-next scheduler integration, then route the two admitted Agent Carrier buildout tasks.

## Required Work

0. Source summary: Operator expected concrete buildout tasks for Claude Code and Narada native Agent Carrier types. Two lifecycle rows were admitted and read back successfully, but narada_task_work_next for narada.builder still reports no_admissible_task. Current MCP facade exposes admission/read/work-next, but no route/assign/allocate surface to make admitted rows scheduler-claimable.
1. Read source inbox envelope env_e49203fc-f25f-4108-a024-ce051fb01f38 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] A governed route, assign, allocate, or equivalent lifecycle transition exists for admitted task rows that should become Builder-claimable.
- [x] The two admitted Agent Carrier buildout rows can be routed or otherwise made visible to narada.builder work-next through a declared authority path.
- [x] Regression coverage or a documented verification command proves the admitted-to-claimable transition.
