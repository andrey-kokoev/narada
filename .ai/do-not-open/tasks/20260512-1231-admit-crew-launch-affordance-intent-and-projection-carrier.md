---
status: closed
closed_at: 2026-05-12T20:59:28.409Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Admit crew launch affordance intent and projection carrier

## Goal

Create Narada proper portable operator-surface launch affordance intent records and a projection-only crew shortcut materializer carrier from inbox envelope env_50302706-98d2-4076-9916-c8d82aba4820.

## Context

The inbox packet from narada-andrey.Kevin documents a portable crew/agent shortcut pattern. Treat it as external evidence, not Narada proper truth. Preserve proof-before-bind doctrine and refuse source Site state import, direct execution, native shell fallback, PC-locus mutation, and operator-surface runtime copying.

## Required Work

1. Read source inbox envelope env_50302706-98d2-4076-9916-c8d82aba4820 and preserve its authority context. 2. Add or standardize operator-surfaces/agent-launch-affordances.json and schema/docs for Narada proper identities. 3. Add a projection-only materializer/carrier that can plan/apply/verify local .crew/agent-shortcuts artifacts without launching processes or mutating runtime bindings. 4. Add tests for non-admitted identity refusal, source-state import refusal, and proof-before-bind requirements. 5. Record audit/ledger evidence, verify, close the source inbox envelope appropriately, and commit.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read inbox envelope `env_50302706-98d2-4076-9916-c8d82aba4820` as external evidence from `narada-andrey.Kevin`.
- Added portable Narada proper launch affordance intent records:
  - `operator-surfaces/agent-launch-affordances.json`
  - `operator-surfaces/agent-launch-affordances.schema.md`
- Added projection-only materializer:
  - `tools/operator-surface-carriers/agent-launch-affordance-materializer.mjs`
  - `tools/operator-surface-carriers/agent-launch-affordance-materializer.test.mjs`
- Materializer writes only local projection JSON files under `.crew/agent-shortcuts`; it does not create executable `.lnk` files, launch processes, mutate runtime bindings, copy operator-surface runtime, or mutate PC-locus state.
- Routed source envelope to `task:1231`.
- Recorded audit and ledger evidence.

## Verification

- `node --test tools/operator-surface-carriers/agent-launch-affordance-materializer.test.mjs`
  - Result: 4 tests passed.
- `node tools/operator-surface-carriers/agent-launch-affordance-materializer.mjs --mode plan --site-root D:\code\narada --site-id narada`
  - Result: planned projections for `narada.architect` and `narada.builder`, no refusals.
- `node tools/operator-surface-carriers/agent-launch-affordance-materializer.mjs --mode apply --site-root D:\code\narada --site-id narada --mutation-authorized`
  - Result: applied projection files under ignored `.crew/agent-shortcuts`.
- `node tools/operator-surface-carriers/agent-launch-affordance-materializer.mjs --mode verify --site-root D:\code\narada --site-id narada`
  - Result: verified, `projection_count=2`, no missing projection files.
- `Get-Content operator-surfaces\agent-launch-affordances.json | ConvertFrom-Json`
  - Result: JSON valid.

## Acceptance Criteria

- [x] Launch affordance intent records exist for admitted Narada proper identities
- [x] Projection-only materializer refuses non-admitted identities and source-state import
- [x] Materializer does not launch processes, mutate PC-locus state, or copy operator-surface runtime
- [x] Proof-before-bind requirements are represented in docs/tests
- [x] Inbox envelope is handled with durable evidence
