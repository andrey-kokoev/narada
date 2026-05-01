---
status: opened
---

# Define projection-admitted work selection for role loops

## Chapter

projection-admitted-work-selection

## Goal

Allow role loops to use projections such as OSA activity as admitted work-selection signals without treating projections as authority.

## Context

Inbox envelope env_edeb2408-6f8a-4b9b-ae76-23918ced45a8 reports that an architect loop followed generic workboard order while an active collaborator was visibly awaiting review. The fix is not to make labels authoritative, but to admit fresh, sourced projections as acceleration signals joined back to authoritative lifecycle/report/inbox facts.

## Required Work

Define a role-loop work-selection contract for Architect/reviewer agents. A projection may influence recommendation only when it carries provenance, freshness, ambiguity posture, and a fallback path to authoritative facts. Elevate direct review requests and active collaborator blocked-on-review tasks above ordinary pending review ordering. Expose recommendation reasons such as active_collaborator_blocked, direct_review_request, ordinary_pending_review, and local_followup. Include source facts and projection provenance in bounded output, and require explicit recorded reason to skip an active collaborator review blocker.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Documentation or code defines projection-admitted work selection and distinguishes projections from authority.
- [ ] Role-loop recommendations include reason codes such as active_collaborator_blocked and direct_review_request.
- [ ] Projection-influenced recommendations include provenance, freshness, ambiguity posture, and authoritative source facts.
- [ ] A fresh non-ambiguous active collaborator review blocker outranks ordinary pending review ordering.
- [ ] Tests cover a Bob awaiting_review task outranking a generic pending review, with authority winning if projection and authoritative facts disagree.
