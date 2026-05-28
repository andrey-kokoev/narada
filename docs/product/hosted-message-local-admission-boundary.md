# Hosted Message Local Admission Boundary

Hosted Site Communication and Remote Candidate Exchange preserve candidate
messages for a target Site. They do not admit those messages into the target
Site.

This document defines the target-Site pull/admit/finalize boundary from hosted
candidate state to local Canonical Inbox or Admission Rejection Ledger evidence.

## Rule

```text
Submit preserves remotely.
Pull inspects remotely.
Admit or reject locally.
Finalize reports local decision evidence back to the hosted surface.
```

Remote preservation, local admission, and remote finalization are separate
states. A cloud receipt is not a local inbox receipt.

## Flow

Canonical target-Site flow:

```text
remote candidate submit
-> remote receipt / pending projection
-> target Site puller polls pending/detail
-> local descriptor-only admission plan
-> local decision:
   admitted -> Canonical Inbox envelope
   rejected/deferred/expired/superseded/error -> Admission Rejection Ledger or target-authority equivalent
-> finalize remote candidate with local decision evidence
-> remote receipt reflects finalization as projection only
```

The puller belongs to the target Site or an admitted runtime acting for that
target Site. The hosted surface may expose pending candidates and receipts, but
it must not write target `.ai/inbox.db`, `.ai/inbox-envelopes`, task lifecycle,
knowledge, capability, Site config, or relation lifecycle state.

## Descriptor-Only Local Admission Plan

For `target_authority=canonical_inbox`, a pulled remote candidate maps to a
descriptor-only local admission plan before any local mutation.

Required plan fields:

| Field | Meaning |
| --- | --- |
| `schema` | Local plan schema, such as `narada.site_inbox.remote_local_admission_plan.v0`. |
| `remote_candidate_contract` | Source contract, normally `narada.remote_candidate.message.v0`. |
| `remote_candidate_id` | Candidate id preserved by the hosted surface. |
| `target_site_id` | Target Site that owns local admission. |
| `target_authority` | `canonical_inbox` for inbox admission plans. |
| `status` | `local_admission_required`, `rejected`, `deferred`, `error`, or another local decision posture. |
| `remote_surface_authority` | Always `candidate_only`. |
| `local_site_admission_required` | `true` until local command/evidence writes the target artifact. |
| `descriptor_only` | `true` before local mutation. |
| `db_mutated` | `false` for the plan. |
| `envelope_written` | `false` for the plan. |
| `request` | Proposed local inbox submission descriptor: source, kind, target locus, bounded payload, crossing coordinates, authority level, and evidence refs. |
| `trust` | Descriptor-only trust/provenance projection from the remote candidate, including verification status and redacted evidence refs. |
| `refusal_or_deferral` | Optional reason codes when the plan cannot proceed to envelope admission. |

The descriptor may recommend a local envelope shape, but the receiving Site
assigns actual envelope identity and writes portable artifacts only through its
Canonical Inbox command or equivalent local admission service.

Trust posture in the plan is evidence for local consideration, not local
admission. See
[`Incoming Intake Trust And Provenance Projection`](incoming-intake-trust-provenance-projection.md)
for the shared vocabulary and default-display limits.

## Local Decisions

| Local outcome | Local artifact | Required evidence | Remote finalization status |
| --- | --- | --- | --- |
| `admitted` | Canonical Inbox envelope or target-authority admitted artifact | `local_site_id`, local artifact id, local kind, admitted timestamp, command/evidence refs | `admitted` |
| `rejected` | Canonical Admission Rejection Ledger entry | decision id, reason codes, deciding principal/rule, evidence refs | `rejected` |
| `deferred` | Admission Rejection Ledger entry or target-authority deferral record | decision id, deferral reason, next review target/posture, evidence refs | `deferred` |
| `expired` | Admission Rejection Ledger entry or expiry decision | decision id, expiry rule/time, actor/rule, evidence refs | `expired` |
| `superseded` | Admission Rejection Ledger entry linking superseding candidate/decision | decision id, superseding candidate or artifact ref, evidence refs | `superseded` |
| `error` | Error decision or retry record | error code, message, retryability, failed command/validation evidence refs | `error` |

Only `admitted` may include `local_admission`. All other outcomes must omit
local admission and provide rejection, deferral, expiry, supersession, or error
details.

## Finalization Payload

`narada.remote_candidate.finalize.v0` reports the target Site decision back to
the hosted surface. It does not create local truth retroactively.

Required common fields:

| Field | Meaning |
| --- | --- |
| `schema` | `narada.remote_candidate.finalize.v0`. |
| `candidate_id` | Remote candidate being finalized, when not implicit in route path. |
| `status` | `admitted`, `rejected`, `deferred`, `expired`, `superseded`, or `error`. |
| `local_site_id` | Target Site that made the decision. |
| `local_decision_ref` | Local decision/admission/refusal evidence. |
| `evidence_refs` | Bounded local evidence refs. |
| `finalized_at` | Time finalization was prepared or accepted. |
| `authority_limits` | Includes that remote receipt is a projection and local truth remains local. |

Additional fields by status:

| Status | Additional required fields |
| --- | --- |
| `admitted` | `local_admission_id`, `local_kind`, `local_admitted_at`, optional `local_admission` summary. |
| `rejected` | `reason_codes` or `rejected_reason`, optional redacted validator detail refs. |
| `deferred` | `deferral_reason`, `deferred_to` or `next_review_posture`. |
| `expired` | `expired_at`, `expiry_rule` or `expired_by`. |
| `superseded` | `superseded_by` candidate/artifact/decision ref. |
| `error` | `error.code`, `error.message`, `error.retryable`. |

The hosted receipt may store and display these fields as projection state. It
must not use them to mutate local Site artifacts.

## Capability Separation

Capabilities remain separate:

| Operation | Capability | Boundary |
| --- | --- | --- |
| Submit candidate | `remote_candidate.submit` or compatibility `site_communication.submit` | Preserves remote candidate only. |
| Poll pending list | `remote_candidate.poll` | Reads bounded pending projections. |
| Read detail/receipt | `remote_candidate.poll` or `site_communication.receipt.read` | Reads one candidate or receipt projection. |
| Finalize | `remote_candidate.finalize` or compatibility `site_communication.finalize` | Reports target Site local decision evidence. |
| Admin/maintenance | `remote_candidate.admin` or hosted admin capability | Manages hosted projection/candidate substrate only. |

Submit capability must not imply poll, read, finalize, admin, local inbox
admission, task mutation, or Site Registry relation mutation. Finalize
capability must come from target Site or operator-admitted authority; it must
not be inferred from publish, submit, read, or admin capability.

## Existing Route Compatibility

Existing hosted routes remain valid compatibility names. They should be read as
Remote Candidate Exchange operations:

| Existing route | Operation reading | Capability |
| --- | --- | --- |
| `POST /api/messages` | `remote_candidate.submit` | `NARADA_SITE_REGISTRY_MESSAGE_TOKEN` or future submit capability ref. |
| `GET /api/messages/pending` | `remote_candidate.poll` | `NARADA_SITE_REGISTRY_POLL_TOKEN` or future poll capability ref. |
| `GET /api/messages/:message_id` | `remote_candidate.detail` | Poll/read capability. |
| `GET /api/messages/:message_id/receipt` | `remote_candidate.receipt` | Poll/read capability. |
| `POST /api/messages/:message_id/finalize` | `remote_candidate.finalize` | `NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN` or future finalize capability ref. |

No route rename is required to preserve this boundary. Route responses should
continue to expose compatibility schemas where needed, while also projecting
`narada.remote_candidate.*` semantics.

## Refusals

The hosted surface should refuse without changing local Site truth when:

- submit token/capability is invalid;
- poll/read/finalize token/capability is invalid;
- candidate is unknown;
- candidate schema, target authority, crossing, or admission posture is missing;
- payload exceeds bounds or contains raw secret/runtime markers;
- finalization status is unsupported by the current implementation;
- finalization lacks required local decision evidence;
- duplicate submit replays an existing candidate/receipt.

If a candidate was locally considered and rejected/deferred/expired/superseded,
the target Site should record a Canonical Admission Rejection Ledger entry or
target-authority equivalent before finalizing.

## Relationship To Existing Doctrine

| Doctrine | Relationship |
| --- | --- |
| [Remote Candidate Exchange](remote-candidate-exchange.v0.md) | Defines generic remote candidate, receipt, finalization, and route contract. This document specializes target-Site pull/admit/finalize sequence. |
| [Site Communication Surface](site-communication-surface.v0.md) | Human compose and projected chat use hosted message candidates but cannot claim target admission. |
| [Site Telemetry Hosted Route And Storage Contract](site-telemetry-hosted-route-storage-contract.v0.md) | Names current `/api/messages` route compatibility and Cloudflare storage posture. |
| [Canonical Inbox](../concepts/canonical-inbox.md) | Receives local admitted envelopes only after target Site admission. |
| [Canonical Admission Rejection Ledger](../concepts/canonical-admission-rejection-ledger.md) | Records rejected, deferred, expired, superseded, malformed, unauthorized, or error local decisions. |
| [Incoming Message Intake Edge](incoming-message-intake-edge.md) | Classifies the hosted path as an intake edge whose arrival artifact is Remote Candidate Exchange until local admission. |
| [Incoming Intake Trust And Provenance Projection](incoming-intake-trust-provenance-projection.md) | Defines how hosted candidates, local admission plans, inbox envelopes, and ledger entries carry trust/provenance evidence without authority collapse. |
