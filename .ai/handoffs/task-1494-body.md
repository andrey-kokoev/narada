Implemented task 1494 as doctrine and fixture work.

Files changed:

- `docs/product/operator-site-communication-relation.v0.md`
- `docs/product/fixtures/operator-site-communication-relation/relation.valid.json`
- `docs/product/site-communication-surface.v0.md`
- `docs/concepts/operator-surface.md`
- `docs/product/site-factorization.md`
- `docs/product/incoming-message-intake-edge.md`
- `docs/concepts/canonical-outbox.md`

Summary:

- Added the versioned Operator Site Communication Relation product contract.
- Defined the relation as a Site-governed configuration object with projection-only UI derivations, not as projection-only UI or a new inbox/outbox/chat/task/capability/approval/transport authority.
- Mapped inbound Operator-to-Site communication to `IncomingMessageIntakeEdge` and existing candidate/inbox artifacts.
- Mapped Site-to-Operator communication to Canonical Outbox or outbound notification/handoff edge semantics.
- Defined owned fields, authority limits, lifecycle states, receipt distinctions, capability/trust posture, suspension posture, and compatibility posture.
- Added a valid JSON fixture showing relation shape and projection-only UI derivation.
- Cross-linked adjacent doctrine.

Verification:

- `git diff --check -- docs/product/operator-site-communication-relation.v0.md docs/product/fixtures/operator-site-communication-relation/relation.valid.json docs/product/site-communication-surface.v0.md docs/concepts/operator-surface.md docs/product/site-factorization.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-outbox.md`
- `Get-Content -Raw docs/product/fixtures/operator-site-communication-relation/relation.valid.json | ConvertFrom-Json | ConvertTo-Json -Depth 20`
- `rg "OperatorSiteCommunicationRelation|governed configuration|projection-only|IncomingMessageIntakeEdge|Canonical Outbox|operator_acknowledged|operator_approved|remote_preserved|transport_delivered|local_admitted|relation_id|operator_principal_ref|operator_surface_ref|inbound_edge_ref|outbound_edge_ref|allowed_message_kinds|capability_posture|trust_posture|lifecycle_state|receipt_policy|suspension_posture|evidence_refs" docs/product/operator-site-communication-relation.v0.md docs/product/fixtures/operator-site-communication-relation/relation.valid.json`
- `rg "operator-site-communication-relation|Operator Site Communication Relation|OperatorSiteCommunicationRelation" docs/product/site-communication-surface.v0.md docs/concepts/operator-surface.md docs/product/site-factorization.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-outbox.md`

Notes:

- No Cloudflare routes, dashboard UI, chat runtime, or transport execution were implemented.
- No existing public API was renamed.
- No generic MessageCandidate ontology was introduced.
- Operator acknowledgement remains distinct from approval and target Site admission.
