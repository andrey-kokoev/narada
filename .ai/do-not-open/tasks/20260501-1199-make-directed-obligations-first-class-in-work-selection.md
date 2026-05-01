---
status: opened
---

# Make directed obligations first-class in work selection

## Chapter

directed-obligations-work-selection

## Goal

Represent review waits, handoffs, and recipient expectations as durable obligation edges so role loops cannot treat addressed work as idle or generic queue work.

## Context

Inbox envelope env_fdf9b9b7-39e8-4b5e-b535-7ee24f59d6e4 reports that narada-andrey Bob showed awaiting review #76 while Kevin did not process the review until Operator correction. The wait was projected as Bob's visual state instead of as a first-class obligation addressed to Kevin or the unique architect role.

## Required Work

Define directed obligations as first-class Narada facts with source, target, kind, status, evidence, and consumption rule. Update or specify task report/review-request, OSM review requests, inbox handoffs, and similar commands so they emit or update obligation records when they create an expectation that another agent should act. Work selection for an agent must check obligations addressed to that agent before generic runnable task discovery, unless the obligation is explicitly deferred or delegated. Implement or specify consumption transitions for review, defer, delegation, rejection, or completion. Ensure operator-surface labels project admitted obligation facts rather than becoming the authority for them.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Directed obligation records include source, target, kind, status, evidence, and consumption rule.
- [ ] Task review requests can create an addressable review_request obligation targeted to an exact identity or uniquely resolved role alias.
- [ ] Agent work selection checks open addressed obligations before generic task queues and reports why an obligation outranks generic work.
- [ ] Review, defer, delegation, rejection, or completion consumes or transitions the corresponding obligation edge.
- [ ] Operator-surface label/activity projections read from obligation records and do not become the authority for obligation state.
