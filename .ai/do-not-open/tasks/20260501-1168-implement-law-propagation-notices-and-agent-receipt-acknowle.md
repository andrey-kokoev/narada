---
status: claimed
---

# Implement law propagation notices and agent receipt acknowledgments

## Chapter

law-change-propagation

## Goal

Make Operator law changes propagate through durable Narada inbox notices with explicit affected-agent receipt and absorption evidence.

## Context

Pilot notice env_9cdb8daa-917f-4050-be66-1ef237c49676 exposed the current gap: an Operator communication law can be submitted as an inbox observation, but Narada lacks a first-class law-notice lifecycle with affected principals, receipts, absorption evidence, timeout posture, and escalation. OSM is only an attention transport and must not become the authority medium.

## Required Work

Define a first-class law-change notice path over Canonical Inbox; model affected roles and agents; add receipt and absorption commands or inbox actions; expose pending/unacknowledged law notices in role duty loops; make OSM notification optional and pointer-only; add documentation and tests using the semantic-duplication pilot notice.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Law notices are represented as durable inbox/crossing artifacts with source, authority, affected roles or agents, effective scope, and supersession/reference fields.
- [ ] Agents can acknowledge receipt and separately record absorption or blocker evidence without mutating implementation work.
- [ ] Duty-loop or work-next surfaces show pending law notices before ordinary task recommendations when the notice affects the current role.
- [ ] OSM notifications, if used, contain only a pointer to the durable law notice and are not treated as authority.
- [ ] Timeout or non-acknowledgment creates an explicit escalation/proposal path instead of silent drift.
- [ ] The pilot notice env_9cdb8daa-917f-4050-be66-1ef237c49676 is exercised in tests or documented replay evidence.
- [ ] Documentation states that Operator law changes travel through inbox/crossing evidence and require receipts from affected active agents.
