# Site Registry Communication Relation Reconciliation

Date: 2026-05-18

## Scope

This note reconciles the existing Site Registry communication and Site-scope
chat plan with
[`OperatorSiteCommunicationRelation`](operator-site-communication-relation.v0.md).
It reviews the Cloudflare Worker routes, embedded UI composer/chat controls,
chat runtime stub, route/storage documentation, and boundary tests before
additional UI work depends on the communication model.

The target locus for the reviewed implementation is the Site Registry
Cloudflare package. This note does not deploy Cloudflare resources, mutate
external Site configuration, or implement Worker/UI behavior.

## Existing Surface Map

| Surface | Current artifact | Relation component | Required reading |
| --- | --- | --- | --- |
| Site tile `Message` control | Embedded Worker UI posts to `/api/site-communications/send`. | Projection over `OperatorSiteCommunicationRelation`, active inbound edge, and allowed message kinds. | Opens an Operator-to-Site candidate composer only; it does not admit an inbox envelope, approve work, mutate tasks, or prove delivery. |
| Site tile `Chat` control | Embedded Worker UI reads selected Site projection and drafts a send request. | Projection over selected Site state plus relation projection policy. | Chat context is selected-Site projection only. Chat-authored text is a draft until the operator explicitly sends through the shared API. |
| `compose_site_inbox_message` chat tool | `packages/site-registry-cloudflare/src/site-scope-chat.ts`. | Projection/draft artifact. | Produces an inert candidate for operator confirmation. It exposes no direct target inbox, task lifecycle, Site config, relation mutation, or secret read capability. |
| `submit_site_inbox_message` chat tool | Send plan for `POST /api/site-communications/send`. | Inbound edge send plan through the relation, using the current shared API. | Produces an API call plan only. It must remain human-confirmed and capability-gated. |
| `POST /api/site-communications/send` | `SiteCommunicationSendPayload` and `SiteCommunicationRecord`. | Compatibility route for Operator-to-Site inbound edge plus remote candidate preservation. | Despite `outbound_communication` schema names, this is not the Site-to-Operator outbound edge. It records a guarded cloud communication candidate and receipt projection. |
| `GET /api/site-communications/:communication_id` | Read-only status response. | Receipt/projection read. | Reads the preserved communication record. It does not become local Site truth. |
| `GET /api/site-communications/:communication_id/receipt` | Read-only receipt response. | Receipt projection. | Displays delivery and target admission receipt projections separately. |
| `/api/messages/*` compatibility routes | Remote message submit, pending, detail, receipt, finalize. | Remote Candidate Exchange and Incoming Message Intake Edge. | Remote preservation and target finalization remain separate. Finalize records target-reported decision evidence; it is not a registry admission decision. |
| `/api/relations/transition` | Site Registry publication relation lifecycle. | Site Registry relation, not `OperatorSiteCommunicationRelation`. | This relation governs public registry publication standing. It must not be read as activating operator communication by itself. |
| Future Site-to-Operator notifications | Not implemented by the current package. | Outbound edge / Canonical Outbox side of the relation. | Must be designed separately. Existing `/api/site-communications/send` is not this edge. |

## Label Review

The current implementation already avoids the highest-risk authority collapse:

- `delivery_receipt.status = recorded_not_delivered` is a registry-side record,
  not target Site admission.
- `admission_receipt.status = pending_target_site_admission` remains pending
  until target Site evidence is reported.
- Responses carry `delivery_is_admission: false`,
  `target_site_mutated: false`, and no-authority fields.
- Tests assert that live network delivery is not attempted in v0 and target
  Site state is not mutated.
- Chat tools declare `authority: proposal_only` or `shared_api_only` and keep
  `direct_mutation_exposed: false`.

The remaining vocabulary risk is compatibility naming. Worker schemas currently
use `narada.site_registry.outbound_communication.*` and D1 table names such as
`site_registry_outbound_communications`. Those names are acceptable only as
registry-perspective compatibility labels. UI and docs must explain that the
relation semantics are Operator-to-Site inbound edge plus remote candidate
preservation, not the Site-to-Operator outbound edge governed by Canonical
Outbox.

Receipt labels should align to the relation vocabulary:

| Relation receipt | Current label | Required UI/API posture |
| --- | --- | --- |
| `relation_configured` | Active public Site Registry relation currently gates target eligibility. | Display as route eligibility only, not proof of communication readiness or Site authority mutation. |
| `remote_preserved` | `delivery_receipt.cloud_record_created` / stored communication row. | Prefer "recorded" or "preserved" over "sent" for v0. |
| `transport_delivered` | Not produced in v0; delivery status remains `recorded_not_delivered`. | Do not show "delivered" unless live transport evidence exists. |
| `local_admitted` | `admission_receipt.status = admitted` or `/api/messages/:id/finalize` target report. | Target-Site evidence only, scoped to the named artifact. |
| `operator_acknowledged` | Not implemented. | Any future acknowledge control must write through the declared outbound crossing and must not mean approval. |
| `operator_approved` | Not implemented. | Approval requires a separate approval authority and must not be inferred from acknowledgement, send, receipt, or chat. |

## Required Implementation Adjustments

Before additional UI work proceeds, the implementation tasks should preserve the
current routes but add relation coordinates and sharper labels:

1. Worker/API response alignment, owned by the Site Registry Cloudflare Worker:
   include `operator_site_communication_relation_ref`, `inbound_edge_ref`,
   `remote_candidate_ref` or equivalent compatibility coordinates, and
   relation authority limits in `/api/site-communications/send`, detail, and
   receipt responses.

2. UI label alignment, owned by the Site Registry communication UI: display the
   v0 send outcome as "recorded" or "preserved" until transport evidence exists;
   keep delivery and admission badges separate; do not render acknowledgement
   or approval controls until their declared crossings exist.

3. Chat projection alignment, owned by the Site-scope chat runtime/UI: include
   relation and inbound-edge refs in composed payloads and send plans, while
   retaining the selected-Site projection-only read boundary.

4. Compatibility documentation, owned by product docs and route tests: state
   that `outbound_communication` names are compatibility labels from the
   registry perspective and do not define the Site-to-Operator outbound edge.

5. Future outbound edge work, owned by a later Site-to-Operator notification or
   Canonical Outbox task: define operator acknowledgement/reply handling
   separately from the existing send route.

No immediate task split is required inside the current 1494-1498 crystallization
chapter. The above items are implementation follow-up candidates for the next
Site Registry communication implementation chapter.

## Compatibility Notes

Route renames are not required. Existing clients and tests may continue to use:

- `POST /api/site-communications/send`
- `GET /api/site-communications/:communication_id`
- `GET /api/site-communications/:communication_id/receipt`
- compatibility `/api/messages/*` remote candidate routes
- `narada.site_registry.outbound_communication.*` schemas

Compatibility is conditional on outputs continuing to say that cloud recording,
transport delivery, local admission, operator acknowledgement, and operator
approval are distinct states.

## Residual Risks

- The word `outbound` can still be misread as the relation's Site-to-Operator
  outbound edge unless response coordinates and UI copy make the direction
  explicit.
- Site Registry relation lifecycle and Operator Site Communication Relation
  lifecycle both use the word `relation`; implementation tickets must name
  which relation they mutate or project.
- `recorded_not_delivered` is correct for v0 but can look like a failed send in
  UI if displayed without "preserved candidate" context.
- Operator acknowledgement and approval are not implemented. Future UI must not
  add those controls as local client state.

## Reconciliation Decision

The existing Worker and chat posture can remain as the compatibility substrate
for the next implementation pass. The admissible next implementation work is to
add relation coordinates and UI/receipt vocabulary alignment, not to rename
routes or treat the Site Registry as target Site admission authority.
