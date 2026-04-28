---
status: closed
depends_on: [1045]
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:14:54.060Z
criteria_proof_verification:
  state: unbound
  rationale: Generated Site AGENTS.md now contains distinct Architect and Builder bootstrap sections, preserves target-locus and authority rules, generated governance config includes agent_role_contracts for admitted roles only, focused Site bootstrap tests and pnpm verify passed.
closed_at: 2026-04-28T23:15:07.627Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1046 — Generate Architect and Builder sections in Site AGENTS contracts

## Goal

Update Site bootstrap generation so new Sites include role-specific Architect and Builder thread instructions in generated AGENTS.md.

## Context

The current siteAgentsContract() helper writes only 'You are architect' fresh-thread guidance. New Sites should orient both architect and builder threads while preserving the same Site authority locus, inbox, task, lifecycle, and mutation-evidence rules.

## Required Work

1. Modify the generated Site AGENTS.md contract to include a common Site identity section and separate Architect Thread Bootstrap and Builder Thread Bootstrap sections.
2. Architect section must emphasize intent interpretation, doctrine/topology, specs, acceptance criteria, review/admission posture, and not becoming builder by convenience.
3. Builder section must emphasize executing approved work packages, means and methods, verification, reporting field conditions, and not redesigning/admitting own work.
4. Preserve current required rules on authority locus, canonical inbox/task/lifecycle/command/evidence/publication surfaces, and no direct state edits.
5. Update generated Site config governance coordinates if task 1045 introduced a concrete shape.

## Non-Goals

- Do not change Narada proper root AGENTS.md semantics beyond necessary references
- Do not create role-specific task authorization enforcement yet

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Generated AGENTS.md contains distinct Architect Thread Bootstrap and Builder Thread Bootstrap sections
- [x] Generated AGENTS.md still contains the Site-local authority and target-locus rules
- [x] Generated content does not admit roles beyond Architect and Builder
- [x] Existing Site bootstrap tests are updated and pass
