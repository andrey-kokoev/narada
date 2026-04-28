---
status: closed
closed_at: 2026-04-28T03:31:25.477Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

## Goal
Add a durable Site relation ledger and validation surface so Site absorption and reciprocal Site references are not represented only by manual config/document edits.

## Required Work
1. Add a canonical Site relation registry library that stores relation records under `.ai/site-relation-registry.json` with explicit relation kind, source Site, target Site, authority effect, admitted material, evidence refs, lineage event refs, reciprocal requirement, and status.
2. Add CLI commands under `narada sites relation` to record, list, validate, and explain relation edges without mutating Site configs or moving authority.
3. Ensure validation detects missing reciprocal relation records when reciprocal evidence is required and reports pass/fail details in JSON/human output.
4. Document the ledger as the durable pre-mutation evidence surface for absorption/lineage edges, including its relationship to Site lifecycle preflight and Site provenance lineage.
5. Add focused tests for record/list/explain/validate behavior.

## Acceptance Criteria
- `narada sites relation record` creates a durable relation record without moving Site authority or editing Site configs.
- `narada sites relation validate` reports failure for a required reciprocal edge that is missing and pass after the reciprocal relation is recorded.
- `narada sites relation explain <id>` states whether the relation is authority-moving, evidence-only, reciprocal-satisfied, or blocked.
- Docs distinguish relation records from lifecycle mutation operators and from graph projections.
- Focused CLI tests pass, and `pnpm verify` passes.

## Source Observation
Inbox envelope `env_c929ffef-534e-4bcb-9f43-beee7c26be62` reported that Staccato Site absorption exposed ad hoc absorption edge schema and fragile reciprocal Site references.

## Execution Notes

<!-- Record what was done, decisions made, and files changed. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
