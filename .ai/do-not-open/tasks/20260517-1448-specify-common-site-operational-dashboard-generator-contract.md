---
status: confirmed
depends_on: [1432, 1440]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-17T00:11:03.037Z
criteria_proof_verification:
  state: unbound
  rationale: Added versioned dashboard generator contract artifact distinguishing projection rows from authority, separating reusable Staccato mechanics from Site-specific providers, specifying generic contracts/sections, and making no-secret/no-mutation invariants explicit.
amended_by: narada.builder
amended_at: 2026-05-17T00:11:03.246Z
closed_at: 2026-05-17T00:46:21.982Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
confirmed_by: narada.architect
confirmed_at: 2026-05-18T17:35:11.257Z
---

# Specify common Site operational dashboard generator contract

## Chapter

Common Site Operational Dashboard Generator

## Goal

Define the reusable Site-level operational dashboard generator contract before copying any Staccato-specific dashboard code.

## Context

Staccato earned a useful local operational dashboard, but Narada proper needs the reusable contract before implementation so generic projection mechanics do not become Site authority or copy Staccato-specific providers into shared defaults.

## Required Work

1. Inspect Staccato evidence: `D:/code/staccato-elt/scripts/Build-NaradaStaccatoOpsPage.mjs`, `D:/code/staccato-elt/scripts/ops-dashboard-server.mjs`, and their tests.
2. Ground the contract in SEMANTICS observation/evidence distinction, Site factorization, site telemetry publication, capability-governed secret management, and operator-surface/action posture.
3. Define generic dashboard snapshot, row, section, summary, row-provider, renderer, and freshness contracts.
4. Classify reusable Staccato mechanics versus Staccato-specific row providers.
5. Specify default generic sections: Site identity/loci, authority boundaries, runtime/daemon, agents, task lifecycle, inbox/outbox, publication/telemetry, capabilities, operator attention, residuals/next action.
6. Produce a versioned product artifact that gives Builder enough detail to implement a package without inventing UI authority.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Inspected the Staccato static dashboard builder, local live dashboard server, and tests.
- Read doctrine for SEMANTICS observation/evidence boundaries, Site factorization, Site posture/work-next, Site state projections, capability-governed secret management, and Operator Surface Action Posture.
- Added `docs/product/site-operational-dashboard-generator.v0.md`.
- The artifact defines dashboard snapshot, row, section, summary, row-provider, renderer, and freshness contracts.
- It separates reusable Staccato mechanics from Staccato-specific loci, operations, providers, branding, and hosted route material.
- It specifies the default generic sections and no-secret/no-mutation invariants.
- It states implementation test requirements and next implementation boundaries for package, Narada proper providers, CLI generation, local server, and Site registry telemetry integration.

## Verification

- `git diff --check -- docs/product/site-operational-dashboard-generator.v0.md` passed.
- `Select-String` confirmed the new artifact contains sections for reusable Staccato mechanics, core data contracts, default generic sections, no-secret rule, and next implementation boundaries.

## Acceptance Criteria

- [x] A versioned dashboard generator contract artifact exists.
- [x] The artifact distinguishes observation rows from admitted evidence and authority.
- [x] Reusable Staccato mechanics and Staccato-specific material are explicitly separated.
- [x] Generic row/provider/snapshot/render contracts are specified.
- [x] No-secret and no-mutation UI invariants are explicit.
