---
status: opened
depends_on: [1044]
---

# Task 1045 — Add Site governance shape for agent role contracts

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- docs/product/site-governance-coordinates.md
- docs/product/site-bootstrap-contract.md
- docs/concepts/plural-embodiment-singular-authority.md

## Context

Site governance coordinates currently contain agent_identity_contract with a default architect name. That is insufficient for a Site that can deliberately initiate either Architect or Builder threads. The structure must remain declarative: it orients agents but does not grant mutation authority.

## Goal

Extend Site governance coordinates to describe role-specific agent bootstrap contracts without changing runtime authority by implication.

## Required Work

1. Design an agent_role_contracts coordinate or equivalent shape that lists currently inhabited roles only: architect and builder.
2. For each role, include role_id, bootstrap_contract path or section, default first actions, authority limits, and handoff obligations.
3. Preserve backward compatibility for existing agent_identity_contract consumers, either by deriving it from architect or keeping it as a legacy shorthand.
4. Update documentation examples for Site governance coordinates.
5. State explicitly that the coordinate is orientation metadata and does not itself grant effect or mutation authority.

## Non-Goals

- Do not add new runtime authorization semantics
- Do not add a PM/inspector/clerk role
- Do not require existing Sites to migrate immediately

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

- [ ] Site governance docs include role-specific agent contract shape for architect and builder
- [ ] Existing agent_identity_contract semantics remain understandable and backward-compatible
- [ ] Authority anti-collapse rules are explicit for role contracts
- [ ] Deferred roles remain documented as not admitted
