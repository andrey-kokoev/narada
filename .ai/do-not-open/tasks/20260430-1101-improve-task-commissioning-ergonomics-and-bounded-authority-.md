---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T01:32:18.022Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-30T01:32:18.228Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Improve task commissioning ergonomics and bounded authority inspection

## Chapter

Architect Inbox Processing

## Goal

Reduce avoidable context burn during task commissioning by adding bounded task-authority/preflight inspection, safer criteria handling, and compact lifecycle summary surfaces.

## Context

<!-- Context placeholder -->

## Required Work

0. Source summary: While commissioning a User Site task, the architect burned context by inspecting a legacy task DB before discovering the active canonical task authority, by relying on criteria arguments that split on commas, and by exposing large lifecycle snapshot output during diagnosis. The current tools make it too easy to inspect noisy authority surfaces instead of asking for a bounded task-authority/preflight view.
1. Read source inbox envelope env_110efd23-1c2f-4403-83e9-ef5ba85879cc and preserve its authority context.
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

- [x] Provide a bounded task authority doctor/preflight command that identifies canonical task DB, task spec path, legacy task DB/spec surfaces, last allocated number, and dirty state without dumping full lifecycle snapshots.
- [x] Make task create criteria input less footgun-prone by preserving repeatable --criteria arguments as units; comma splitting should be opt-in, explicit CSV mode, or clearly diagnosed.
- [x] Provide bounded lifecycle summary output intended for agent context instead of requiring lifecycle export or snapshot inspection for ordinary commissioning diagnosis.
- [x] Add focused tests covering canonical authority detection, legacy-surface warning, comma-containing criteria preservation or diagnostic, and compact lifecycle summary output.
- [x] Update CLI help/docs so agents know the bounded preflight path and avoid raw lifecycle snapshot inspection.
