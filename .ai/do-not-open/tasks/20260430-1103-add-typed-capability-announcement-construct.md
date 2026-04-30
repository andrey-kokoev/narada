---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T01:41:26.364Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-30T01:41:26.629Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add typed capability announcement construct

## Chapter

Architect Inbox Processing

## Goal

Define and implement a first-class capability announcement construct so Sites can publish newly admitted operational capabilities with scope, entrypoints, evidence, constraints, and adoption posture.

## Context

<!-- Context placeholder -->

## Required Work

0. Source summary: Narada currently has capability declarations, KB documentation, inbox observations, and published inbox envelopes, but no first-class construct for a Site to announce a newly admitted operational capability with scope, entrypoints, evidence, constraints, and adoption posture. The operator-surface message-passing capability exposed this gap: other Narada agents can use it only if they infer it from local files, chat, or ad hoc nudges.
1. Read source inbox envelope env_48fdf40f-0def-4a7e-ba40-5809ea82fae3 and preserve its authority context.
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

- [x] Define CapabilityAnnouncement as a typed envelope and/or durable Site registry projection with fields for capability id, summary, owner Site, authority scope, usable-by identities or roles, entrypoints, prerequisites, evidence, constraints, safety posture, adoption posture, and supersession/versioning.
- [x] Allow a Site to publish a capability announcement to relevant Sites through canonical inbox publication or an equivalent governed crossing.
- [x] Use operator_surface_message_passing as the first test case, including Send-Os.ps1 or Send-OperatorSurfaceInput.ps1 entrypoints, runtime identity binding prerequisite, known submit strategy requirement, no-secrets constraint, and observed successful sends.
- [x] Add focused tests for announcement creation, publication/admission, discovery, supersession, and JSON output.
- [x] Document how agents discover and use admitted capability announcements without relying on chat memory.
