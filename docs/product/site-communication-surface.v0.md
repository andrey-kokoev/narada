# Site Communication Surface v0

`site_communication_surface.v0` defines how a registry or dashboard surface may
let an operator communicate with a selected Site without becoming that Site's
authority.

The first product shape is:

```text
selected Site projection
-> OperatorSiteCommunicationRelation projection
-> message composer or Site-scope projected chat
-> inbound remote candidate / inbox-message crossing
-> target Site local admission, rejection, deferral, or residual
```

The Site Registry may preserve, display, and receipt communication candidates.
It must not mutate the target Site's task lifecycle, Canonical Inbox,
OperatorSiteCommunicationRelation lifecycle, knowledge, secrets, runtime state,
or configuration.

The message path from composer or projected chat to the target Site boundary is
an [`IncomingMessageIntakeEdge`](incoming-message-intake-edge.md). The surface
may preserve a compatibility `message_candidate`, but that schema is a
surface-specific Remote Candidate Exchange instantiation, not a new universal
candidate ontology.

In this context the intake edge is directional. It is not the whole
Operator/Site communication relation and it does not describe the Site-to-Operator
outbound path.

The Site-governed relation that binds one operator-facing communication surface
to one Site is
[`OperatorSiteCommunicationRelation`](operator-site-communication-relation.v0.md).
Composer and chat controls are projection-only derivations of that relation and
its directional crossings.

## Authority Reading

The Site Communication Surface is a communication and intelligence surface, not
an action authority.

Related doctrine:

- Governed Crossing: arrival is not admission, and projection does not confer
  mutation authority.
- Canonical Inbox: inbound envelopes are inert until local admission.
- Canonical Outbox: outbound effect intents are separate from transport
  execution and confirmation.
- Remote Candidate Exchange: a hosted surface may preserve a candidate and
  receipt delivery, but local consequence requires target Site admission.
- Verifiable Envelope Trust: authenticity and integrity are evidence, not
  mutation authority.
- Capability-governed Secret Management: raw bearer values and secrets stay out
  of registry rows, fixtures, logs, and chat context.
- Operator Site Communication Relation: relation configuration and projection
  derivation are separate from inbound admission and outbound execution.

## Surface Components

| Component | Role | Authority limit |
| --- | --- | --- |
| Site tile message composer | Human operator composes a message to one selected Site. | Sends only through the shared inbox-message crossing. |
| Site-scope projected chat | AI answers questions about one selected Site's published projection. | May propose or submit inbox messages only through the shared crossing. |
| Receipt display | Shows remote preservation, delivery, and target Site finalization reports. | Delivery is not local admission. |
| Capability guard | Authenticates access to send or read protected communication status. | Capability use does not create Site authority. |

The default chat shape is **Site-scope projected chat**. A registry-wide or
cross-Site comparison chat is a separate future surface and must not be implied
by per-Site chat controls.

## Site-Scope Projected Chat

A chat session must name exactly one selected Site:

```json
{
  "schema": "narada.site_communication.chat_request.v0",
  "chat_scope": "site_projection",
  "site_id": "narada-proper",
  "projection_ref": "site-registry:narada-proper:projection:latest",
  "operator_prompt": "What needs attention on this Site?"
}
```

The chat runtime may read only bounded projection context for that Site.

Allowed context:

| Context | Condition |
| --- | --- |
| Site Registry record | The selected `site_id` is the subject. |
| Freshness/projection payloads | Published to, or explicitly fetched through, the registry projection. |
| Relation lifecycle | Visible under the registry relation policy. |
| Dashboard rows | Published into the registry projection or explicitly supplied as projection context. |
| Receipt metadata | Public or authorized communication receipt summaries. |
| Product/docs excerpts | Only when deliberately included in the registry-side context bundle. |

Forbidden context:

| Context | Reason |
| --- | --- |
| Local task lifecycle DBs | Private target Site authority substrate. |
| Raw inbox payloads | Local admission/private intake material. |
| Raw secrets or bearer values | Capability boundary violation. |
| Raw logs and private runtime traces | Not published projection context. |
| Unexported filesystem state | Realization detail, not registry projection. |
| Other Site projections | Cross-Site scope leak unless explicitly selected by a separate surface. |
| Direct D1 admin state | Registry implementation detail unless exposed as a read model. |

The chat runtime must refuse or narrow requests that require forbidden context:

```json
{
  "schema": "narada.site_communication.chat_response.v0",
  "site_id": "narada-proper",
  "response_kind": "refusal",
  "reason_codes": ["private_site_context_not_in_projection"],
  "message": "I can answer only from the published projection for narada-proper."
}
```

## Shared Message Send Path

Human compose and chat compose use the same message candidate contract.

```json
{
  "schema": "narada.site_communication.message_candidate.v0",
  "candidate_id": "scm_narada-proper_20260517_001",
  "surface_id": "site-registry:narada-proper:cloudflare",
  "target_site_id": "narada-proper",
  "target_authority": "canonical_inbox",
  "idempotency_key": "site-message:narada-proper:2026-05-17:001",
  "source": {
    "kind": "operator_surface",
    "site_id": "narada-proper",
    "principal": "operator"
  },
  "kind": "operator_message",
  "subject": "Question about stale projection",
  "body": "Please inspect why the registry projection is stale.",
  "payload": {
    "schema": "narada.site_communication.operator_message_payload.v0",
    "urgency": "normal",
    "related_projection_ref": "site-registry:narada-proper:projection:latest"
  },
  "crossing": {
    "scale": "site",
    "authority_scope": "narada-proper",
    "from_locus": "site-registry:narada-proper:cloudflare",
    "to_locus": "site:narada-proper:canonical_inbox",
    "owning_site": "narada-proper",
    "target_authority": "canonical_inbox",
    "requested_crossing": "admission_request",
    "admission_state": "received"
  },
  "payload_bounds": {
    "max_body_bytes": 12000,
    "raw_values_excluded": true
  },
  "authority_limits": [
    "remote_preservation_is_not_local_inbox_admission",
    "message_candidate_cannot_mutate_task_lifecycle",
    "message_candidate_cannot_mutate_site_config",
    "message_candidate_cannot_grant_capability",
    "chat_can_only_compose_or_send_this_candidate"
  ]
}
```

Minimum required fields:

| Field | Meaning |
| --- | --- |
| `schema` | `narada.site_communication.message_candidate.v0`. |
| `candidate_id` | Stable remote candidate identity. |
| `surface_id` | Registry or communication surface preserving the candidate. |
| `target_site_id` | Selected Site whose local authority must decide consequence. |
| `target_authority` | Usually `canonical_inbox` for this contract. |
| `idempotency_key` | Retry-stable send key. |
| `source` | Human, chat, Site, or agent source metadata without raw credentials. |
| `kind` | Message kind such as `operator_message`, `proposal`, `question`, `incident`, or `task_candidate`. |
| `subject` / `body` | Bounded human-readable content. |
| `payload` | Bounded structured content. |
| `crossing` | Scale-relative governed crossing coordinates. |
| `payload_bounds` | Size and raw-secret exclusion declaration. |
| `authority_limits` | Explicit no-authority limits. |

Chat-authored messages must include a chat provenance block:

```json
{
  "composed_by": {
    "kind": "site_scope_projected_chat",
    "site_id": "narada-proper",
    "projection_ref": "site-registry:narada-proper:projection:latest",
    "human_confirmed_send": true
  }
}
```

Unless a future delegated-send capability is explicitly admitted, chat-proposed
messages are drafts that require operator confirmation before send.

## Receipts

The communication surface exposes distinct receipts:

| Receipt | Meaning | Does it imply target Site admission? |
| --- | --- | --- |
| `remote_preserved` | Registry accepted and stored the candidate. | No. |
| `transport_delivered` | Candidate reached the target delivery endpoint or drop. | No. |
| `local_admitted` | Target Site reported local admission evidence. | Yes, only for the named artifact. |
| `local_rejected` | Target Site reported a local rejection decision. | No consequence except the recorded rejection. |
| `local_deferred` | Target Site reported deferral. | No final admission. |
| `expired` | Remote or local pending window expired. | No. |

Receipt projection:

```json
{
  "schema": "narada.site_communication.receipt.v0",
  "receipt_id": "scr_scm_narada-proper_20260517_001",
  "candidate_id": "scm_narada-proper_20260517_001",
  "target_site_id": "narada-proper",
  "status": "remote_preserved",
  "cloud_receipt_only": true,
  "local_decision_ref": null,
  "evidence_refs": ["site-registry:d1:communication_candidates:scm_narada-proper_20260517_001"],
  "authority_limits": [
    "receipt_status_is_projection",
    "cloud_receipt_is_not_local_site_admission"
  ]
}
```

## Capability And Trust Posture

Routes that send messages or read protected receipt detail must be guarded by a
capability reference or bearer-token verifier appropriate to the realization.

Rules:

1. Store verifier hashes or credential references, not raw tokens.
2. Do not include raw token values in D1 rows, HTML, JSON fixtures, logs, chat
   context, or test snapshots.
3. Treat signatures and token verification as transport/admission evidence, not
   authority to mutate target Site state.
4. Keep submit, read, finalize, admin, and delegated-send capabilities separate.
5. Let the target Site own final admission/rejection and finalization evidence.

## Hosted Route Semantics

Route names are realization details. The first route family should expose these
semantics:

| Operation | Capability | Semantics |
| --- | --- | --- |
| `compose_preview` | optional local UI only | Render a bounded candidate before send; no preservation. |
| `submit_message` | `site_communication.submit` | Preserve a candidate or return the existing receipt for duplicate idempotency key. |
| `receipt_read` | `site_communication.receipt.read` | Return bounded receipt status. |
| `pending_read` | `site_communication.pending.read` | Return target-visible pending candidates when authorized. |
| `finalize_receipt` | `site_communication.finalize` | Target Site reports local admission/rejection/deferral/error evidence. |

Compatibility routes under the existing Site Registry message API may remain,
but they should map to these operation semantics instead of creating a second
communication ontology.

## UI Rules

Per-Site tile UI should show:

- `Message` action for direct inbox-message compose;
- `Chat` action for Site-scope projected chat;
- selected Site identity in the composer and chat panel;
- relation/freshness warnings before send;
- receipt state distinct from local admission state.

The UI must not show task execution, lifecycle mutation, registry relation
mutation, capability grant, or secret-management controls as chat or message
side effects.

## Operator Operations Posture

Operators should read the Site Communication Surface as a communication crossing
and projection-scoped intelligence surface, not as a control surface for the
target Site.

Direct message composer posture:

- The composer is scoped to exactly one selected Site.
- The operator supplies the send token, target delivery endpoint, capability
  reference, message kind, subject, and body at send time.
- Raw bearer tokens are transport-time inputs only. They are not registry
  knowledge and must not be stored in D1 rows, HTML, fixtures, logs, docs, chat
  context, or responses.
- Sending records or submits a remote communication candidate through the
  shared inbox-message crossing. It does not directly mutate the target Site's
  Canonical Inbox, task lifecycle, Site config, capability registry, or relation
  lifecycle.

Receipt reading:

- A delivery receipt says what the registry or transport surface has recorded.
  It is not target Site admission.
- A target admission receipt is local-Site decision evidence. Pending admission
  means the target Site has not reported an admitted, rejected, deferred, or
  error decision.
- A cloud receipt may be useful evidence for retry, audit, or operator followup,
  but it must not be shown as local truth for the target Site.
- Target-Site pull/admit/finalize semantics are specified in
  [`hosted-message-local-admission-boundary.md`](hosted-message-local-admission-boundary.md).

Site-scope projected chat posture:

- Chat is scoped to one selected Site projection. It is not registry-wide chat
  and must not silently compare other Sites.
- Chat may read only projection context deliberately supplied to it: selected
  Site record, projection/freshness payload, relation lifecycle visible through
  registry policy, dashboard rows published as projection context, receipt
  summaries, and deliberately included product/docs excerpts.
- Chat must refuse or narrow requests for private task databases, raw inbox
  payloads, secrets, bearer values, raw logs, unexported filesystem state,
  direct D1 admin state, cross-Site context, direct task execution, Site config
  mutation, relation mutation, or capability grants.
- Chat may propose a typed inbox envelope. It may submit only through the same
  guarded send API as the direct composer, with explicit operator confirmation
  unless a future delegated-send capability is admitted.

Residuals:

- Registry-scope or cross-Site chat is a future product surface, not a hidden
  mode of Site-scope chat.
- Delegated-send without explicit operator confirmation needs a separate
  governed capability and tests before it can be enabled.
- Live transport delivery can be added later, but delivery remains distinct from
  target Site admission.

## Fixtures

Normative fixtures:

- `docs/product/fixtures/site-communication-surface/message-candidate.valid.json`
- `docs/product/fixtures/site-communication-surface/chat-request.valid.json`
- `docs/product/fixtures/site-communication-surface/chat-response-refusal.expected.json`
- `docs/product/fixtures/site-communication-surface/receipt.remote-preserved.expected.json`
- `docs/product/fixtures/operator-site-communication-relation/relation.valid.json`

## Residual Implementation Tasks

- Align hosted Site Registry message routes with this contract.
- Add D1 communication candidate, attempt, and receipt schema where existing
  message tables are insufficient.
- Add per-Site message composer UI.
- Add deterministic Site-scope projected chat stub before live LLM integration.
- Add explicit delegated-send capability only if an operating case earns it.
