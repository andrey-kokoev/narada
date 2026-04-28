---
status: opened
depends_on: [1049]
---

# Task 1050 — Add Site operator surface declaration shape

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/product/site-governance-coordinates.md
- docs/product/site-bootstrap-contract.md
- docs/product/site-factorization.md
- docs/concepts/canonical-routing-addressing.md

## Context

Once Operator Surface is defined, Sites need a declarative place to say which surfaces are expected or preferred for a role/workflow. This should sit adjacent to embodiments and agent role contracts, not replace them.

## Goal

Extend Site governance/product documentation with declarative operator_surfaces that remain orientation and recovery metadata, not authority.

## Required Work

1. Design an operator_surfaces coordinate or equivalent shape for Site governance examples.
2. Include fields for id, purpose, site_id, role_id, workflow/locus binding, embodiment_id, adapter, launch, focus/window identity, placement hints, and recovery posture.
3. Document that the declaration is advisory/orienting unless admitted through a separate materialization command or external adapter.
4. Show how Windows Terminal, Komorebi, YASB, VS Code, browser profile, MCP console, and daemon panels are adapter examples, not the primitive.
5. Preserve backward compatibility for Sites without declared surfaces.

## Non-Goals

- Do not require every Site to declare surfaces
- Do not add secrets or capabilities to surface declarations
- Do not build adapter-specific schema exhaustively

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

- [ ] Site governance docs include operator_surfaces shape with minimal fields
- [ ] Docs state surfaces do not grant mutation, effect, or capability authority
- [ ] Docs distinguish surface declaration from adapter materialization
- [ ] Existing Site governance examples remain coherent for Sites without surfaces
