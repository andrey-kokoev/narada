# Operator Site Communication Relation v0

`OperatorSiteCommunicationRelation` is the Site-governed configuration object
that relates one operator-facing communication surface to one Site.

It is not a chat thread, UI panel, inbox, outbox, transport route, task
authority, capability authority, approval authority, or Site Registry relation
activation. It is the declared relation that composes inbound and outbound
crossings so an Operator can communicate with a Site without turning the
presentation surface into Site authority.

## Rule

```text
The relation governs communication topology.
Directional crossings carry messages.
Target authorities own consequence.
```

The relation may make a communication surface addressable, constrain allowed
message kinds, name capability/trust posture, and define receipt policy. It
does not admit inbound material, execute outbound transport, approve work,
create tasks, grant credentials, or mutate Site configuration by itself.

## Grounding

| Doctrine | Relationship |
| --- | --- |
| [Site Factorization](site-factorization.md) | The Site is the authority object; the relation is one declared interface/configuration object for communication with it. |
| [Operator Surface](../concepts/operator-surface.md) | The operator-facing surface is addressable presentation and interaction; it does not own consequence. |
| [Governed Crossing](../concepts/governed-crossing.md) | Arrival, admission, execution, approval, and truth remain separate crossing outcomes. |
| [Incoming Message Intake Edge](incoming-message-intake-edge.md) | Operator-to-Site messages enter through an inbound intake edge. |
| [Canonical Inbox](../concepts/canonical-inbox.md) | Local admitted inbound envelopes remain inert until promoted. |
| [Canonical Outbox](../concepts/canonical-outbox.md) | Site-to-Operator outbound messages are effect intents before transport execution. |
| [Site Communication Surface](site-communication-surface.v0.md) | UI composer and Site-scope projected chat are projections over this relation and its crossings. |
| [Incoming Intake Trust And Provenance Projection](incoming-intake-trust-provenance-projection.md) | Trust/provenance posture is evidence, not authority. |

## Object Shape

Minimum fields:

| Field | Meaning |
| --- | --- |
| `schema` | `narada.operator_site_communication_relation.v0`. |
| `relation_id` | Stable relation identity. |
| `operator_principal_ref` | Operator principal or role allowed to use the relation. |
| `operator_surface_ref` | Operator Surface, dashboard, console, chat, or control surface projection coordinate. |
| `site_ref` | Site authority object the relation is about. |
| `owning_site_ref` | Site that owns the relation lifecycle. Usually the target Site for direct communication, or a declared coordination Site for federated projections. |
| `inbound_edge_ref` | `IncomingMessageIntakeEdge` for Operator-to-Site delivery or remote candidate preservation. |
| `outbound_edge_ref` | Outbound notification/handoff edge or Canonical Outbox route for Site-to-Operator delivery. |
| `allowed_message_kinds` | Bounded message kinds such as `operator_message`, `question`, `proposal`, `incident`, `approval_request`, `handoff`, or `task_candidate`. |
| `capability_posture` | Capability refs, required grants, denied actions, and operation separation for compose, submit, read, poll, finalize, notify, and acknowledge. |
| `trust_posture` | Verification status, source identity, policy refs, freshness, and redacted evidence refs. |
| `lifecycle_state` | Relation lifecycle state. |
| `receipt_policy` | Which receipts are produced and which surfaces may display them. |
| `suspension_posture` | Why use is degraded or suspended, and which directions are blocked. |
| `projection_policy` | What UI/chat/dashboard projections may derive from the relation. |
| `evidence_refs` | Configuration, route, receipt, trust, capability, and decision evidence refs. |
| `authority_limits` | Explicit non-authority claims for the relation. |

Raw secrets, bearer tokens, private keys, decrypted payloads, and raw
cryptographic material are never relation fields.

## Directional Crossings

### Operator To Site

Operator-to-Site communication flows through an inbound edge:

```text
operator surface projection
-> OperatorSiteCommunicationRelation
-> IncomingMessageIntakeEdge
-> Remote Candidate Exchange or Canonical Inbox admission request
-> local Site admission, rejection, deferral, or residual
```

The relation may name which inbound edge is used and which message kinds are
allowed. The edge governs reachability and arrival. Remote Candidate Exchange
may preserve the candidate. Canonical Inbox may receive an inert local
envelope. The target Site still owns local admission and every consequence.

### Site To Operator

Site-to-Operator communication flows through an outbound intent or notification
edge:

```text
Site decision or notification intent
-> Canonical Outbox item or outbound notification/handoff edge
-> transport execution attempt
-> delivery evidence
-> operator acknowledgement, reply, or approval request handling
```

The relation may name the outbound route and receipt policy. Canonical Outbox
or an equivalent outbound notification edge owns outbound intent lifecycle.
Transport delivery is not operator acknowledgement. Operator acknowledgement is
not approval unless a separate approval crossing records that outcome.

## Lifecycle

| State | Meaning | Authority semantics |
| --- | --- | --- |
| `declared` | Desired relation is named. | No route, capability, or trust posture is proven. |
| `configured` | Surface, Site, inbound edge, outbound edge, and policy refs exist. | Configuration exists, but communication is not proven. |
| `reachable` | At least one direction has passed bounded reachability/preflight. | Transport may be attempted; admission and acknowledgement remain separate. |
| `active` | Relation can be used within its allowed kinds and capability/trust posture. | Active relation is still only topology/configuration. |
| `degraded` | One direction, trust check, capability, freshness, receipt, or projection is partially unavailable. | Output must name the degraded direction/check and allowed safe actions. |
| `suspended` | Operator, Site policy, capability revocation, trust failure, incident response, or stale evidence blocks use. | New communication through blocked directions must be refused or deferred. Existing candidates keep their artifact lifecycle. |
| `retired` | Relation is intentionally no longer used. | Historical evidence remains inspectable; new traffic should be refused or redirected. |

Lifecycle state belongs to the relation. It must not mutate pending inbox
envelopes, remote candidates, outbox items, tasks, approvals, knowledge,
capabilities, Site Registry relations, or Site configuration by itself.

## Receipts

The relation may project receipts from underlying artifacts, but must preserve
their distinctions:

| Receipt | Meaning | Authority limit |
| --- | --- | --- |
| `relation_configured` | Relation configuration is present. | Does not prove route reachability. |
| `remote_preserved` | Remote surface preserved an inbound candidate. | Not target Site admission. |
| `transport_delivered` | Transport says material reached an endpoint or surface. | Not local admission or operator acknowledgement. |
| `local_admitted` | Target Site reported local admission evidence. | Only admits the named artifact. |
| `local_rejected` | Target Site reported a rejection decision. | Records refusal; no positive consequence. |
| `local_deferred` | Target Site reported deferral. | No final admission. |
| `outbox_composed` | Site created an outbound intent. | Not transport execution. |
| `outbox_approved` | Outbound intent was approved for execution. | Not delivery. |
| `outbox_confirmed` | Outbound effect was confirmed. | Confirms only the named outbound item. |
| `operator_acknowledged` | Operator acknowledged seeing or receiving a message. | Not approval, task closure, or Site admission. |
| `operator_approved` | Operator approval was recorded through a governed approval crossing. | Approval scope is only the named request/artifact. |
| `expired` | Pending communication window expired. | Not rejection unless local decision records it. |

Receipt projections should include evidence refs and bounded summaries, not raw
payloads, secrets, or transport logs.

## Projection-Only UI Derivation

UI, dashboard, and chat surfaces may derive projection-only controls from the
relation:

| Projection | Derived from | Limit |
| --- | --- | --- |
| `message_button` | Active inbound edge plus allowed message kind. | Opens compose/admission request; does not admit. |
| `site_scope_chat` | Operator surface ref, selected Site projection, and relation policy. | Reads only bounded selected-Site projection context. |
| `receipt_badge` | Receipt policy and evidence refs. | Shows status; does not mutate status. |
| `acknowledge_button` | Outbound receipt policy. | Records acknowledgement only through the declared crossing. |
| `approval_prompt` | A specific approval request artifact. | Approval requires the target approval surface; acknowledgement is insufficient. |

The relation is not projection-only: it is governed configuration. Its UI
derivations are projection-only and must remain read/display/compose surfaces
until a governed crossing admits the next consequence.

## Authority Limits

`OperatorSiteCommunicationRelation` must not claim or perform:

- local inbox admission;
- task creation, claim, review, closure, confirmation, or reconciliation;
- operator approval;
- knowledge admission;
- Site Registry relation activation;
- Site config mutation;
- capability grant, credential possession, or secret resolution;
- raw transport execution;
- outbox approval or confirmation;
- effect execution;
- remote receipt finality;
- trust verification as authority.

Capability and trust posture are evidence and gates for using configured
crossings. They do not become the authority to mutate target artifacts.

## Compatibility

Existing Site Communication Surface routes may continue to expose
`site_communication.message_candidate.v0` and receipt shapes. They should be
read as compatibility projections of this relation plus Remote Candidate
Exchange and Incoming Message Intake Edge semantics, not as a second authority
model.

The relation does not require route renames. It requires output and fixtures to
make the authority split explicit.

The current Site Registry Worker/UI communication surface is reconciled in
[`Site Registry Communication Relation Reconciliation`](site-registry-communication-relation-reconciliation-20260518.md).
That note treats existing `outbound_communication` route/schema names as
compatibility labels and names the required relation-coordinate and receipt
vocabulary adjustments before further UI implementation.

## Fixture

Normative fixture:

- `docs/product/fixtures/operator-site-communication-relation/relation.valid.json`
- `docs/product/fixtures/operator-site-communication-relation/projection-ui.valid.json`
- `docs/product/fixtures/operator-site-communication-relation/invalid-direct-task-mutation.json`
- `docs/product/fixtures/operator-site-communication-relation/invalid-direct-inbox-admission.json`
- `docs/product/fixtures/operator-site-communication-relation/invalid-raw-secret-field.json`

The fixture demonstrates a valid relation and projection-only UI derivation.
Invalid fixtures document authority-collapse cases for focused validators.
