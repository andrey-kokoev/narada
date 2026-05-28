---
status: confirmed
depends_on: [1488]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T03:39:49.102Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T03:39:49.529Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Specify Operator Site Communication Relation contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1494-1498-operator-site-communication-relation.md

## Goal

Crystallize OperatorSiteCommunicationRelation as the governance object that relates one operator-facing communication surface to one Site without making the UI, chat, inbox, outbox, or transport path the authority.

## Context

Doctrine grounding sharpened the earlier OperatorSiteCommunicationEdge idea: the UI thread is projection-only, but the relation is not projection-only. The coherent shape is a bidirectional governed relation composed from inbound intake and outbound outbox/notification crossings. Existing Site Communication Surface, Incoming Message Intake Edge, Canonical Inbox, Canonical Outbox, Operator Surface, and Site Factorization docs already define neighboring pieces, but the higher relation remains unnamed and underspecified.

## Required Work

1. Ground the contract in Site Factorization, Operator Surface, Incoming Message Intake Edge, Canonical Inbox, Canonical Outbox, governed crossing, Site Communication Surface, and capability/trust doctrine.
2. Define OperatorSiteCommunicationRelation as a Site-governed relation/configuration object, not a projection-only UI and not a new inbox, outbox, chat authority, task authority, or capability authority.
3. Define the directional components: Operator to Site via IncomingMessageIntakeEdge and Site to Operator via Canonical Outbox or an outbound notification/handoff edge.
4. Define owned fields: relation_id, operator_principal_ref, operator_surface_ref, site_ref, inbound_edge_ref, outbound_edge_ref, allowed_message_kinds, capability/trust posture, lifecycle state, receipt policy, suspension posture, and evidence refs.
5. Define non-owned consequences: local inbox admission, task creation, approval, knowledge admission, registry relation activation, Site config mutation, credential possession, and effect execution.
6. Define lifecycle states and receipts in a way that distinguishes remote preservation, transport delivery, local admission, rejection, deferral, operator acknowledgement, and approval.
7. Produce a versioned product doctrine artifact and at least one JSON fixture showing a valid relation with projection-only UI derivation.

## Non-Goals

- Do not implement Cloudflare routes, dashboard UI, chat runtime, or transport execution in this task.
- Do not rename existing public APIs unless the contract explicitly records a compatibility posture.
- Do not introduce a generic MessageCandidate ontology.
- Do not let operator acknowledgement mean approval or target Site admission.

## Execution Notes

- Added `docs/product/operator-site-communication-relation.v0.md` as the versioned product doctrine artifact.
- Defined `OperatorSiteCommunicationRelation` as a Site-governed relation/configuration object with projection-only UI derivations, not as a projection-only UI and not as inbox, outbox, chat, task, capability, approval, transport, or Site Registry authority.
- Mapped inbound Operator-to-Site communication through `IncomingMessageIntakeEdge` to Remote Candidate Exchange or Canonical Inbox admission request, with local Site admission/rejection/deferral remaining separate.
- Mapped Site-to-Operator communication through Canonical Outbox or an outbound notification/handoff edge, with transport delivery, operator acknowledgement, and operator approval separated.
- Defined owned fields, lifecycle states, receipt distinctions, authority limits, compatibility posture, and raw-secret/raw-cryptographic-material exclusions.
- Added `docs/product/fixtures/operator-site-communication-relation/relation.valid.json` showing a valid relation plus projection-only UI derivation.
- Cross-linked the relation from Site Communication Surface, Operator Surface, Site Factorization, Incoming Message Intake Edge, and Canonical Outbox.

## Verification

- `git diff --check -- docs/product/operator-site-communication-relation.v0.md docs/product/fixtures/operator-site-communication-relation/relation.valid.json docs/product/site-communication-surface.v0.md docs/concepts/operator-surface.md docs/product/site-factorization.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-outbox.md` passed; Git emitted existing LF/CRLF working-copy warnings for several docs.
- `Get-Content -Raw docs/product/fixtures/operator-site-communication-relation/relation.valid.json | ConvertFrom-Json | ConvertTo-Json -Depth 20` passed, proving the fixture is valid JSON.
- `rg "OperatorSiteCommunicationRelation|governed configuration|projection-only|IncomingMessageIntakeEdge|Canonical Outbox|operator_acknowledged|operator_approved|remote_preserved|transport_delivered|local_admitted|relation_id|operator_principal_ref|operator_surface_ref|inbound_edge_ref|outbound_edge_ref|allowed_message_kinds|capability_posture|trust_posture|lifecycle_state|receipt_policy|suspension_posture|evidence_refs" docs/product/operator-site-communication-relation.v0.md docs/product/fixtures/operator-site-communication-relation/relation.valid.json` confirmed required terms, fields, and receipt distinctions are present.
- `rg "operator-site-communication-relation|Operator Site Communication Relation|OperatorSiteCommunicationRelation" docs/product/site-communication-surface.v0.md docs/concepts/operator-surface.md docs/product/site-factorization.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-outbox.md` confirmed cross-links are present.

## Acceptance Criteria

- [x] A versioned Operator Site Communication Relation artifact exists.
- [x] The artifact explicitly says the relation is a governed configuration object with projections, not projection-only.
- [x] Inbound and outbound directional crossings are mapped to existing doctrine artifacts.
- [x] Owned fields, authority limits, lifecycle states, and receipt distinctions are explicit.
- [x] At least one fixture demonstrates valid relation shape and projection-only UI derivation.
