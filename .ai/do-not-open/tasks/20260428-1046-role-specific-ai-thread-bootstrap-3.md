---
status: opened
depends_on: [1045]
---

# Task 1046 — Generate Architect and Builder sections in Site AGENTS contracts

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- packages/layers/cli/src/commands/sites.ts
- packages/layers/cli/test/commands/sites-init.test.ts
- packages/layers/cli/test/commands/sites-client-bootstrap.test.ts
- packages/layers/cli/test/commands/sites-project-bootstrap.test.ts
- docs/product/site-bootstrap-contract.md

## Context

The current siteAgentsContract() helper writes only 'You are architect' fresh-thread guidance. New Sites should orient both architect and builder threads while preserving the same Site authority locus, inbox, task, lifecycle, and mutation-evidence rules.

## Goal

Update Site bootstrap generation so new Sites include role-specific Architect and Builder thread instructions in generated AGENTS.md.

## Required Work

1. Modify the generated Site AGENTS.md contract to include a common Site identity section and separate Architect Thread Bootstrap and Builder Thread Bootstrap sections.
2. Architect section must emphasize intent interpretation, doctrine/topology, specs, acceptance criteria, review/admission posture, and not becoming builder by convenience.
3. Builder section must emphasize executing approved work packages, means and methods, verification, reporting field conditions, and not redesigning/admitting own work.
4. Preserve current required rules on authority locus, canonical inbox/task/lifecycle/command/evidence/publication surfaces, and no direct state edits.
5. Update generated Site config governance coordinates if task 1045 introduced a concrete shape.

## Non-Goals

- Do not change Narada proper root AGENTS.md semantics beyond necessary references
- Do not create role-specific task authorization enforcement yet

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Generated AGENTS.md contains distinct Architect Thread Bootstrap and Builder Thread Bootstrap sections
- [ ] Generated AGENTS.md still contains the Site-local authority and target-locus rules
- [ ] Generated content does not admit roles beyond Architect and Builder
- [ ] Existing Site bootstrap tests are updated and pass
