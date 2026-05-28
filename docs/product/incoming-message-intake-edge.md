# Incoming Message Intake Edge

`IncomingMessageIntakeEdge` is the configured path from a source surface to a
Site intake boundary.

When used inside an
[`OperatorSiteCommunicationRelation`](operator-site-communication-relation.v0.md),
it is only the Operator-to-Site directional component. The bidirectional
relation also needs a Site-to-Operator outbound edge or Canonical Outbox route.

It is the lifecycle object for an incoming path. It is not a new candidate
payload ontology, not a second inbox, and not a generic `MessageCandidate`
layer. Arrivals on an edge must map to existing Narada artifacts such as
Canonical Inbox envelopes, Remote Candidate Exchange messages, Admission
Rejection Ledger decisions, or SourceRecord/Fact observations.

## Rule

```text
An intake edge governs reachability and arrival.
Existing artifacts preserve or admit the arrived material.
Target Site authority owns consequence.
```

An edge may prove that a source can reach a receiving boundary. It does not
prove local admission, task creation, knowledge authorship, capability grant,
relation activation, or effect execution.

## Object Shape

Minimum fields:

| Field | Meaning |
| --- | --- |
| `edge_id` | Stable identity for the configured intake path. |
| `owning_site_id` | Site that owns the receiving boundary and edge lifecycle. |
| `source_surface` | Surface where material originates, such as mailbox, file drop, CLI/MCP, webhook, hosted registry, pub/sub, or daemon source. |
| `target_authority` | Receiving boundary such as `canonical_inbox`, `remote_candidate_exchange`, `source_record_fact`, `operator`, or a target-specific admission surface. |
| `transport_mode` | `local_filesystem`, `cli`, `mcp`, `http`, `mailbox_graph`, `webhook`, `pubsub`, `cloudflare_worker`, or another declared transport family. |
| `capability_posture` | Required capability kind, grant refs, credential refs, and denied actions. Raw secret values are never edge fields. |
| `trust_posture` | Authentication, signature, sender, origin, replay, freshness, and verification expectations for arrivals. |
| `health_state` | Current lifecycle/health state. |
| `evidence_refs` | Configuration, doctor, receipt, test, or decision evidence supporting the state. |
| `authority_limits` | Explicit non-authority claims for the edge. |

The target authority is local to the receiving Site. A hosted or remote edge can
preserve material for a target Site, but it cannot admit consequences for that
Site unless a separate local authority reports that decision.

## Lifecycle

| State | Meaning | Authority and health semantics |
| --- | --- | --- |
| `declared` | The desired edge is named with source and target posture. | No route or capability is proven. No arrivals should be treated as expected. |
| `configured` | Route, endpoint, credential references, or local adapter config exist. | Configuration evidence exists, but reachability is not proven. |
| `reachable` | Preflight or doctor proves the source can reach the boundary. | Transport can be attempted; arrival/admission are still separate. |
| `receiving` | At least one bounded arrival has been preserved or admitted through the intended artifact path. | Edge is operational for arrival. Consequence remains governed by the mapped artifact. |
| `degraded` | Edge partially works but has stale health, missing publication, intermittent transport, failing verification, or reduced capability. | Intake may be read-only, manual, retry-only, or blocked by policy. Output must name the degraded check. |
| `suspended` | Operator, Site policy, capability revocation, trust failure, or incident response blocks use. | No new arrivals should be accepted except explicit repair/test traffic. Existing candidates remain governed by their artifact lifecycle. |
| `retired` | Edge is intentionally no longer used. | Historical evidence remains inspectable. New traffic should be refused, redirected, or recorded as rejected/deferred. |

Health state is an edge projection. It does not mutate the target artifact by
itself. For example, changing an edge to `suspended` does not reject all pending
Remote Candidate Exchange messages unless a local admission decision records
that outcome.

## Arrival Mapping

Incoming material maps by source posture and target authority:

| Arrival posture | Existing artifact | Mapping rule |
| --- | --- | --- |
| Local CLI/MCP/direct Site submission targeting local intake | Canonical Inbox envelope | Use `narada inbox submit` / `submit-observation` or equivalent target-authority submission. The envelope is inert until promoted. |
| Human file drop | Canonical Inbox envelope or Admission Rejection Ledger decision | Dry-run candidates remain source-surface observations; admitted items become one envelope; rejected/deferred items should be recorded in the ledger. |
| Hosted or remote communication candidate | Remote Candidate Exchange message and receipt | Remote preservation stays remote candidate state. Local admission may later create a Canonical Inbox envelope or ledger decision. |
| Site Communication Surface message | Site Communication candidate projected through Remote Candidate Exchange semantics | Registry/dashboard receipt is not target admission. Local finalization must reference target Site decision evidence. |
| Site pub/sub signal | Canonical Inbox envelope with crossing coordinates, or Remote Candidate Exchange message when hosted/remote preservation is needed | Subscription expands delivery only. Receiving Site admission remains local. |
| Mailbox/Exchange source delta | SourceRecord/Fact, then mailbox-specific fact/projection/admission path | Mailbox source read is a source boundary. Mail facts and mailbox projections are not generic inbox candidates unless policy creates an envelope or task proposal. |
| Webhook receipt | SourceRecord/Fact or Remote Candidate Exchange message, then governed admission | Webhook arrival is inert until policy maps it to a local envelope, ledger decision, fact, or target-specific artifact. |
| Site-local daemon observation | SourceRecord/Fact, or Canonical Inbox envelope after governed file-drop admission | Daemon observation does not create tasks or mutate Site config directly. |
| Rejected, deferred, malformed, unauthorized, unsupported, stale, duplicate, or untrusted arrival | Canonical Admission Rejection Ledger | Record the decision with reason codes and evidence refs instead of silently dropping or inventing another candidate store. |

The edge decides how material reaches the boundary and which artifact family is
responsible. It does not replace the artifact family's lifecycle.

Trust and provenance posture for an edge is a projection over route evidence,
source identity, freshness, and verification status. See
[`Incoming Intake Trust And Provenance Projection`](incoming-intake-trust-provenance-projection.md)
for the required attachment points and default-display limits.

## No Generic MessageCandidate Ontology

This doctrine deliberately does not introduce a generic `MessageCandidate`
object.

Narada already has the needed artifact families:

- [Canonical Inbox](../concepts/canonical-inbox.md) for local inert typed
  envelopes and promotion.
- [Remote Candidate Exchange](remote-candidate-exchange.v0.md) for hosted or
  remote preservation before local admission.
- [Canonical Admission Rejection Ledger](../concepts/canonical-admission-rejection-ledger.md)
  for considered/admitted/rejected/deferred/superseded decisions.
- SourceRecord/Fact for source observations that should remain in the compiler
  pipeline until policy admits consequence.

If a product surface currently names `message_candidate`, treat that as a
surface-specific compatibility schema or remote-candidate instantiation, not as
a new universal layer.

## Authority Limits

An `IncomingMessageIntakeEdge` must not claim:

- target Site local admission;
- task lifecycle mutation;
- knowledge admission;
- capability grant or credential access;
- Site Registry relation activation;
- Site config mutation;
- mailbox readiness;
- effect execution;
- raw secret possession;
- remote receipt finality.

Capability and trust checks are edge gates. Passing them may allow transport or
preservation; it still does not authorize target consequence.

## Relationship To Existing Doctrine

| Doctrine | Relationship |
| --- | --- |
| [Canonical Inbox](../concepts/canonical-inbox.md) | Local inert envelope substrate for admitted intake. Intake edges may target it, but edge health is not envelope admission. |
| [Message Routing Authority Posture](message-routing-authority-posture.md) | Decides whether CLI/MCP/inbox submissions may enter a target intake artifact, especially across loci or Sites. |
| [Incoming Intake Trust And Provenance Projection](incoming-intake-trust-provenance-projection.md) | Defines trust/provenance fields and display posture for edges, remote candidates, inbox envelopes, and ledger decisions without making trust an authority. |
| [Hosted Message Local Admission Boundary](hosted-message-local-admission-boundary.md) | Defines target-Site pull/admit/finalize flow from hosted remote candidates to local inbox or ledger decisions. |
| [Remote Candidate Exchange](remote-candidate-exchange.v0.md) | Hosted/remote preservation artifact for pending target-Site decisions. Intake edges may deliver to it or pull from it. |
| [Canonical Admission Rejection Ledger](../concepts/canonical-admission-rejection-ledger.md) | Decision record for rejected, deferred, malformed, unauthorized, stale, duplicate, superseded, or unsupported arrivals. |
| [Site Communication Surface](site-communication-surface.v0.md) | Communication composer/chat surfaces use an intake edge to preserve remote candidates and await local target admission. |
| [Operator Site Communication Relation](operator-site-communication-relation.v0.md) | Declares the Site-governed relation that composes operator-facing projections with inbound intake and outbound notification/outbox crossings. |
| [Site Pub/Sub Signal Exchange](site-pubsub-signal-exchange.md) | Subscriptions are delivery edges for typed inert signals, not automatic local admission. |
| [Site-Local Daemon Sources](site-local-daemon-sources.md) | Daemon source observations may remain SourceRecord/Fact until a governed edge admits them into local intake. |
| [Mailbox Runtime Readiness](mailbox-runtime-readiness.md) | Mailbox source read/evaluation readiness is distinct from approval/effect readiness; mailbox arrivals are not generic message candidates by default. |

Current channel classification is recorded in
[`incoming-message-intake-edge-audit-20260518.md`](incoming-message-intake-edge-audit-20260518.md).

## Examples

Local CLI observation:

```text
edge: cli_to_narada_proper_canonical_inbox
source_surface: narada CLI / MCP facade
target_authority: canonical_inbox
state: receiving
arrival artifact: Canonical Inbox envelope
consequence: none until inbox promotion
```

Hosted registry message to a Site:

```text
edge: site_registry_message_to_target_site
source_surface: Site Communication Surface
target_authority: remote_candidate_exchange -> target canonical_inbox
state: reachable or receiving
arrival artifact: Remote Candidate Exchange message and receipt
consequence: target Site may later admit to Canonical Inbox or record ledger decision
```

Site-local file drop:

```text
edge: project_site_inbox_drop
source_surface: .ai/inbox-drop
target_authority: source_record_fact -> canonical_inbox
state: receiving
arrival artifact: filesystem.change fact until `narada inbox ingest-files --admit`
consequence: one inert envelope per admitted item
```

Mailbox source:

```text
edge: exchange_mailbox_source_to_mail_facts
source_surface: Microsoft Graph mailbox
target_authority: source_record_fact
state: receiving
arrival artifact: SourceRecord/Fact and mailbox projection
consequence: policy may later create recommendations, intents, or inbox/task proposals
```

## Doctor And Work-Next Expectations

Future doctor or readiness surfaces should report edge posture separately from
artifact admission:

- edge identity and lifecycle state;
- source and target authority;
- transport mode and reachability;
- capability/trust posture without raw secrets;
- last arrival and mapped artifact id;
- degraded/suspended/retired reason;
- next bounded repair or admission command.

Work-next surfaces should route to the existing artifact lifecycle. They should
not expose `IncomingMessageIntakeEdge` as a queue of generic messages.
