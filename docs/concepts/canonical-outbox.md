# Canonical Outbox

Canonical Outbox is the Site-local authority record for outbound effect intents. It is not an outgoing-message folder and not transport execution. It is the governed queue of proposed crossings from Narada to another locus or transport.

Outbox items are inert until an executor performs a transport-specific crossing under its own law. The v0 command surface records, previews, approves, confirms, archives, supersedes, and exports outbox items without sending email, calling webhooks, writing remote GitHub comments, or mutating external systems.

## Withdrawal And Disposition

Submitting an outbox item places an outbound effect intent under Site-local authority. The submitter cannot withdraw it by deleting history. A withdrawal, correction, or replacement is recorded as a disposition request and resolved by the Site authority through the outbox lifecycle.

| State | Admissible Withdrawal Disposition |
| --- | --- |
| `composed` | Archive or supersede before approval. |
| `approved` | Archive, supersede, or require operator confirmation before execution. |
| Transport execution in progress | Cancel only if the executor can halt safely; otherwise record the attempt and reconcile. |
| `confirmed` | Do not withdraw; create a new compensating, reversing, or explanatory outbound item. |

`archived` and `superseded` are not erasure. They are terminal or redirecting records that preserve what was proposed, who proposed it, and why it no longer proceeds.

## Command Surface

```bash
narada outbox compose \
  --target-kind site_inbox \
  --target-ref utz-client-service \
  --transport filesystem_drop \
  --payload-body "message" \
  --route-id route_... \
  --capability-grant-id cap_... \
  --by operator

narada outbox preview <outbox-id>
narada outbox approve <outbox-id> --by operator
narada outbox confirm <outbox-id> --by operator --confirmation-ref file:/path/to/drop
narada outbox archive <outbox-id> --by operator --reason superseded
narada outbox supersede <outbox-id> --by operator --superseded-by <new-outbox-id>
narada outbox export
```

The v0 outbox persists at:

```text
.ai/canonical-outbox.json
```

Exported item artifacts are written to:

```text
.ai/outbox-items/
```

## Item Shape

Each item records:

| Field | Meaning |
| --- | --- |
| `outbox_id` | Durable item identifier |
| `target_kind`, `target_ref` | Destination identity |
| `transport` | Intended transport |
| `payload_ref`, `payload_body` | Payload reference or small inline body |
| `authority_level`, `principal_id` | Authority assertion for composition |
| `approval_required`, `approved_by`, `approved_at` | Approval posture |
| `route_id` | Resolved route record |
| `capability_grant_id` | Capability/consent grant covering execution |
| `status` | `composed`, `approved`, `confirmed`, `archived`, or `superseded` |
| `dry_run_rendering` | Bounded render of what would be sent/delivered |
| `execution_evidence_ref`, `delivery_confirmation_ref` | Evidence after external execution |
| `retry_of`, `supersedes`, `superseded_by` | Retry and supersession links |
| `composed_by`, `composed_at`, `updated_at` | Provenance metadata |

## Relationship To Neighbor Zones

Inbox admits inbound typed envelopes.

Admission Ledger records what candidates were admitted, rejected, deferred, or superseded.

Routing resolves the destination address.

Capability Consent grants authority to use a capability.

Outbox records the outbound effect intent and lifecycle. It requires route and capability references for execution, but those references do not execute anything by themselves.

Transport executors consume approved outbox items in future tasks. They must produce execution evidence and delivery confirmation before an item is confirmed.
