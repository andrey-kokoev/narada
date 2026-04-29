---
status: opened
amended_by: architect
amended_at: 2026-04-29T19:17:35.138Z
---

# Define Site state projections and transition protocols

## Chapter

Site State Projection Topology

## Goal

Define product support for Site state projections and transition protocols so Sites can declare hierarchy, authority boundaries, volatile projections, evidence surfaces, transition triggers, reconciliation responsibilities, and escalation rules.

## Context

Inbox envelope env_243de0db-3bca-4438-a295-63d084515aae reports that the Windows operator surface model needs first-class Site state projections and transition protocols. Access mode, display topology epoch, Windows desktop membership, Komorebi state, and YASB runtime each have distinct authority and volatility. Scripts currently write logs but do not update a queryable current-state projection, so each script risks inventing local assumptions.

## Required Work

1. Inspect Site governance coordinates, Operator Surface, Site stabilization, Windows operator surface adapter path, canonical mutation evidence, and visibility-domain reconciliation docs. 2. Define a Site state projection model that separates authority records, volatile runtime observations, projection freshness, transition events, and evidence logs. 3. Define transition protocol grammar: trigger, source authority, target projection, admissibility checks, evidence produced, reconciliation responsibility, rollback/repair posture, and escalation rules. 4. Use the Windows operator surface case as the first fixture without mutating Windows/Komorebi/YASB from Narada proper. 5. Show how scripts should update/query projections through governed surfaces instead of private logs and assumptions. 6. Add docs and, if appropriate, schema/test fixtures for projection declarations. 7. Verify with focused docs/schema checks or pnpm verify and record residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T19:17:35.138Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Docs distinguish authority records from volatile current-state projections
- [ ] Site state model can declare projection surfaces and transition protocols without making scripts authoritative
- [ ] Windows operator surface case is captured as motivating evidence
- [ ] Reconciliation responsibilities and escalation rules are explicit
- [ ] Source envelope env_243de0db-3bca-4438-a295-63d084515aae is routed
