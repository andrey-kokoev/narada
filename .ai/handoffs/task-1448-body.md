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
