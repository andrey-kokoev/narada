# Remote Candidate Exchange v0

`remote_candidate_exchange.v0` specifies a generic contract for a hosted or
remote surface to hold candidate messages for a target Site until that Site
locally admits, rejects, defers, expires, or errors the candidate.

This contract is not telemetry-only and is not a second Canonical Inbox. Site
Telemetry Publication may use it for remote messages, but the same shape also
fits cross-Site publication/subscription signals, review handoffs, capability
notices, knowledge candidates, task candidates, and future bounded intake
families.

The configured path that delivers material to, or pulls material from, a remote
candidate surface is an
[`IncomingMessageIntakeEdge`](incoming-message-intake-edge.md). The edge owns
reachability and capability/trust posture; Remote Candidate Exchange owns
remote preservation, receipt, and finalization artifacts.

## Rule

```text
Remote arrival creates candidate state.
Cloud receipt confirms only remote preservation.
Local consequence requires target Site admission.
```

The remote surface may authenticate transport, preserve a candidate, expose
pending/detail/receipt projections, and record finalization evidence. It must
not mutate the target Site's Canonical Inbox, task lifecycle, knowledge store,
capability registry, lineage records, or Site configuration.

## Artifact Family

| Artifact | Schema | Purpose |
| --- | --- | --- |
| Remote candidate message | `narada.remote_candidate.message.v0` | Candidate payload preserved by a remote surface. |
| Remote candidate receipt | `narada.remote_candidate.receipt.v0` | Remote receipt and final status projection. |
| Remote candidate finalization | `narada.remote_candidate.finalize.v0` | Target Site report of local admission, rejection, deferral, expiration, or error evidence. |
| Local admission plan | target-specific | Descriptor-only plan for the target Site admission boundary. |
| Admission/rejection ledger entry | target-specific | Durable local decision evidence for malformed, unauthorized, stale, duplicate, untrusted, admitted, rejected, deferred, or superseded candidates. |

## Remote Candidate Message

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | `narada.remote_candidate.message.v0`. |
| `candidate_id` | yes | Stable remote candidate identity. |
| `surface_id` | yes | Remote surface or receiver coordinate. |
| `exchange_id` | no | Optional exchange stream coordinate for grouping related candidates. |
| `status` | yes | `pending`, `admitted`, `rejected`, `deferred`, `error`, `expired`, or `superseded`. New submits start as `pending`. |
| `target_site_id` | yes | Site whose local authority must decide consequences. |
| `target_authority` | yes | Intended local authority boundary such as `canonical_inbox`, `task_lifecycle`, `evidence_admission`, `site_governance`, `capability_consent`, `knowledge`, or `operator`. |
| `source` | yes | Source kind/ref/principal/site coordinates. |
| `kind` | yes | Candidate kind. Generic values include `observation`, `proposal`, `command_request`, `knowledge_candidate`, `task_candidate`, `incident`, `telemetry_signal`, `review_request`, `handoff`, `capability_notice`, and `pubsub_signal`. |
| `subject` | no | Bounded human-readable subject. |
| `body` | no | Bounded human-readable body. Required only for message-like candidates. |
| `payload` | yes | Bounded structured payload. |
| `payload_bounds` | yes | Size and raw-value-exclusion declaration. |
| `replay_key` | yes | Retry-stable dedupe key for source/surface/target/kind/payload identity. |
| `idempotency_key` | yes | Transport idempotency key. It may equal `replay_key`, but is named separately for route compatibility. |
| `submitted_at` | yes | Time the sender prepared or submitted the candidate. |
| `received_at` | yes | Time the remote surface preserved the candidate. |
| `expires_at` | no | Optional remote pending expiry. Expiry is remote status unless the target Site records a local decision. |
| `freshness` | no | Optional current freshness posture for the candidate. |
| `evidence_refs` | yes | Bounded source evidence references. |
| `capability` | no | Capability requirements, requests, claims, references, grants, refusals, or revocations as inert metadata only. |
| `trust` | no | Trust/provenance projection such as verification status, source identity summary, digest, forwarding chain, and redacted verification evidence refs. |
| `crossing` | yes | Scale-relative crossing coordinates describing source/target authority posture. |
| `admission_posture` | yes | Explicit statement that local admission is required and remote surface authority is candidate-only. |
| `authority_limits` | yes | Non-empty list of things the candidate and remote surface cannot do. |

## Receipt

`narada.remote_candidate.receipt.v0` records what the remote surface can
truthfully say.

| Field | Required | Meaning |
| --- | --- | --- |
| `receipt_id` | yes | Stable receipt identity. |
| `candidate_id` | yes | Candidate being receipted. |
| `surface_id` | yes | Surface that preserved the candidate. |
| `status` | yes | Same lifecycle values as the candidate status. |
| `remote_received` | yes | `received_at`, `source_ref`, `idempotency_key`, `replay_key`, and retry count. |
| `cloud_receipt_only` | yes | `true` while status is `pending`, `deferred`, `expired`, `error`, or `superseded` without local admission. |
| `remote_surface_authority` | yes | Always `candidate_only` for this contract. |
| `local_decision_ref` | no | Reference to a local admission/rejection/deferral/error decision when the target Site reports one. |
| `local_admission` | no | Present only when the target Site admitted the candidate locally. |
| `rejection` | no | Present for local or remote rejection. |
| `deferral` | no | Present when local authority deferred the candidate. |
| `error` | no | Present when local admission failed or remote preservation failed after initial receipt. |
| `evidence_refs` | yes | Bounded evidence for the receipt status. |

A cloud receipt is valid evidence that a remote surface accepted and preserved a
candidate. It is not evidence that the target Site admitted the candidate.

## Finalization

`narada.remote_candidate.finalize.v0` is sent by a target Site or its governed
puller after local handling. It updates the remote receipt as a report of local
truth; it does not create local truth retroactively.

For the target-Site pull/admit/finalize sequence and descriptor-only local
admission plan posture, see
[`hosted-message-local-admission-boundary.md`](hosted-message-local-admission-boundary.md).

Allowed statuses:

| Status | Required local evidence |
| --- | --- |
| `admitted` | `local_decision_ref`, `local_site_id`, admitted artifact id/kind, and admitted timestamp. |
| `rejected` | `local_decision_ref`, reason codes, and rejection evidence refs. |
| `deferred` | `local_decision_ref`, deferral target/reason, and next review posture. |
| `error` | Error code/message/retryability and evidence refs. |
| `expired` | Expiry evidence and actor/rule that marked expiry. |
| `superseded` | Superseding candidate/decision reference. |

Finalize capability is separate from submit and poll capability. A surface must
not infer finalize authority from publish, submit, read, or admin capability.

## Local Admission Mapping

For Canonical Inbox targets, a remote candidate maps to a local
`narada.site_inbox.envelope_admission_request.v0` descriptor:

| Remote field | Local inbox field |
| --- | --- |
| `candidate_id` | payload `remote_candidate.candidate_id`; suggested envelope id may derive from it but is locally assigned. |
| `target_site_id` | `target_locus` and crossing `owning_site`. |
| `target_authority=canonical_inbox` | crossing `target_authority=canonical_inbox`. |
| `source` | local request `source.kind=remote_candidate_exchange`, `source.ref=candidate_id`, optional source Site. |
| `kind` | local envelope `kind` when compatible; otherwise local admission must reject, defer, or map through a declared adapter. |
| `subject` / `body` / `payload` | bounded local payload with `schema=narada.remote_candidate.local_payload.v0`. |
| `crossing` | local scale-relative crossing coordinates with `requested_crossing=admission_request`. |
| `admission_posture` | local decision remains descriptor-only until the local inbox command writes an envelope. |

The existing `narada.site_inbox.remote_message.v0` contract is a narrower
compatibility instantiation. It remains valid as a Site Inbox adapter shape, but
future hosted routes should accept or project the generic
`narada.remote_candidate.message.v0` envelope and map to Site Inbox only when
`target_authority` is `canonical_inbox`.

## Telemetry Publication Instantiation

Site Telemetry Publication uses Remote Candidate Exchange when a telemetry
surface receives a message or signal that may require target Site action.

Required specialization:

- `kind` is usually `telemetry_signal`, `observation`, `proposal`,
  `task_candidate`, `review_request`, or `pubsub_signal`;
- `source.site` names the publisher Site when known;
- `surface_id` names the telemetry surface realization;
- `exchange_id` may name the Publication Edge or pub/sub stream;
- `payload` may include bounded telemetry event references, projection ids, or
  SiteRegistry read-model refs;
- `payload_bounds.raw_values_excluded` must be `true`;
- `authority_limits` must state that telemetry candidate arrival does not admit
  local inbox, task, knowledge, capability, or Site governance consequences.

Telemetry candidates are one use of the generic contract, not the owner of it.

## Trust And Provenance Projection

Remote candidates may carry trust/provenance evidence, but the remote surface
remains candidate-only. Pending, detail, receipt, and finalization views should
show verification status, claimed or verified source, forwarding summary,
digest/evidence refs, and local-admission-required posture without exposing raw
cryptographic material. A `verified` or `decrypted_verified` candidate is still
inert until the target Site admits it locally.

For the shared fields, vocabulary, and display limits, see
[`Incoming Intake Trust And Provenance Projection`](incoming-intake-trust-provenance-projection.md).

## Rejection, Deferral, And Ledger Expectations

Remote and local systems should record decisions instead of letting candidates
disappear by silence.

| Condition | Expected posture |
| --- | --- |
| Malformed candidate | Remote surface may refuse preservation; if locally considered, record a local rejection ledger entry with parse/shape reason codes. |
| Unauthorized submit | Remote surface refuses before storing payload where possible and records bounded audit metadata. No local admission is implied. |
| Unauthorized poll/finalize | Remote surface refuses the route; candidate status is unchanged. |
| Stale or expired candidate | Remote surface may mark `expired`; target Site may separately record local `rejected`, `deferred`, or `expired` decision evidence. |
| Duplicate submit | Surface returns the existing receipt, increments retry/duplicate posture, and does not create a second pending candidate. |
| Untrusted source | Target Site records `rejected` or `deferred` with trust reason codes unless local policy allows manual review. |
| Unsupported kind or target authority | Target Site records `rejected` or `deferred`; remote surface must not invent a local mapping. |
| Raw secret or raw runtime payload | Refuse preservation or local admission and record a redacted reason code. |
| Local admission failure | Finalize as `error` only with retryability and evidence refs; do not claim admission. |

Local decision evidence should use the Canonical Admission Rejection Ledger or
the target authority's equivalent durable ledger. A rejected/deferred candidate
may later be appealed or superseded, but the original decision remains visible.

## Route Contract

Hosted route names are realization details. A generic route family should expose
these semantics:

| Operation | Capability | Semantics |
| --- | --- | --- |
| submit | `remote_candidate.submit` | Preserve a candidate or return the existing receipt for duplicate replay key/idempotency key. |
| pending/list | `remote_candidate.poll` | Return bounded pending projections and descriptor-only local admission plans when available. |
| detail | `remote_candidate.poll` | Return one bounded candidate projection. |
| receipt | `remote_candidate.poll` | Return receipt status without exposing raw secrets. |
| finalize | `remote_candidate.finalize` | Update remote receipt from target Site decision evidence. |

Current Cloudflare Site Telemetry Surface routes under `/api/messages` may
remain as compatibility routes. Alignment work should map them to the generic
operation names without making the hosted Worker a local admission authority.

## Fixtures

Normative examples:

- `docs/product/fixtures/remote-candidate-exchange/generic-task-candidate.message.json`
- `docs/product/fixtures/remote-candidate-exchange/telemetry-signal.message.json`
- `docs/product/fixtures/remote-candidate-exchange/site-inbox-admission-plan.expected.json`
- `docs/product/fixtures/remote-candidate-exchange/finalize-admitted.payload.json`
- `docs/product/fixtures/remote-candidate-exchange/rejection-ledger-entry.expected.json`

## Residual Implementation Tasks

- Add package-level generic Remote Candidate Exchange types and validators.
- Align hosted message route request/response handling with
  `narada.remote_candidate.*` while preserving compatibility with
  `narada.site_inbox.remote_*`.
- Add D1 schema versioning notes for generic candidate rows without renaming
  current compatibility tables prematurely.
- Add receiving Site admission fixtures that prove descriptor-only planning,
  local inbox admission, rejection ledger recording, and remote finalization.
- Add route tests for malformed, unauthorized, stale, duplicate, untrusted,
  unsupported-kind, raw-secret, rejected, deferred, admitted, and error cases.
- Keep submit, poll, finalize, read, publish, and admin capabilities separate.
