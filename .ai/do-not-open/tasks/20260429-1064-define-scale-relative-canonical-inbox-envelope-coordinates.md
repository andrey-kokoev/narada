---
status: claimed
amended_by: architect
amended_at: 2026-04-29T15:00:50.654Z
---

# Define scale-relative canonical inbox envelope coordinates

## Chapter

Canonical Inbox Scale-Relative Crossings

## Goal

Specify and prepare implementation of a single canonical inbox envelope substrate that supports external intake and intra-Site role handoffs through scale-relative crossing coordinates, without creating separate inbox species or collapsing local target authority.

## Context

Inbox envelope env_a59de5c1-e3fc-4da1-b593-33522183f44e observes that Builder-to-Architect handoff is not a separate inbox species from external Narada proper intake. It is the same canonical envelope grammar instantiated at a different scale position. The task should preserve one envelope substrate while adding scale-relative crossing coordinates so projections such as Architect inbox, Builder handoff queue, Narada proper inbox, and CAPA queue remain views over the same substrate.

## Required Work

1. Read docs/concepts/governed-crossing.md, docs/concepts/canonical-routing-addressing.md, docs/concepts/inhabited-evolution.md, docs/concepts/capa-operation.md, docs/product/site-factorization.md, docs/product/site-pubsub-signal-exchange.md, and the external Scale-Relative Operation Topology concept linked from AGENTS. 2. Add or update canonical inbox doctrine to define scale-relative crossing coordinates without creating a second inbox ontology. 3. Specify coordinate fields: crossing.scale, crossing.authority_scope, crossing.from_locus, crossing.to_locus, crossing.owning_site, crossing.target_authority, crossing.requested_crossing, and admission/review state. 4. Specify compatible message kinds including review_request, handoff, approval_request, admission_request, verification_request, blocker, capa_candidate, and capa_addendum while preserving existing kinds. 5. Name projection surfaces as derived views, not separate authority stores. 6. Use the Builder-to-Architect review handoff incident as the motivating test case. 7. Link the doctrine from AGENTS and any relevant concept docs. 8. Run pnpm verify and report residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:00:50.654Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Canonical inbox remains one governed envelope substrate rather than separate external and internal inbox ontologies
- [ ] Envelope crossing coordinates are specified for scale authority scope from locus to locus owning Site target authority requested crossing and admission or review state
- [ ] Message kinds include review request handoff approval request admission request verification request blocker capa candidate and capa addendum without breaking existing observation proposal command request and knowledge candidate use
- [ ] Architect builder handoff incident is used as the motivating test case and expected projection surfaces are named
- [ ] Documentation is linked from AGENTS and relevant concepts and pnpm verify passes
