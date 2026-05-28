# Site Registry Relation Capability Verifier v0

`site_registry_relation_capability_verifier.v0` defines the governed contract for
Site-scoped capability verifiers used by hosted Site Registry relation lifecycle
transitions.

This contract exists before Worker auth or D1 migration changes. It replaces no
live credential by itself and does not grant withdrawal authority. It defines
the shape that later implementation tasks must preserve when moving from a
single global relation withdrawal token toward per-relation, per-Site verifier
records.

## Grounding

This contract is grounded in:

- Capability-Governed Secret Management: raw secret values live in the
  authority-bearing store; artifacts carry references, digests, and policy.
- Canonical Capability Consent Registry: a grant records who may use a
  capability, for what scope, with which credential reference; the registry is
  not a secret store.
- Governed Crossing: withdrawal is a governed disposition request, not deletion
  or erasure of prior relation evidence.
- Verifiable Envelope Trust: signatures, tokens, and digests are evidence, not
  mutation authority.
- Site Relation Ledger: relation records are current-state/evidence projections,
  not authority objects.
- Canonical Routing and Addressing: knowing an endpoint or route does not grant
  permission to execute a transition.

## Surfaces And Authority

| Surface | Owns | Does not own |
| --- | --- | --- |
| Relation current state | Projection of relation lifecycle state and visibility. | Raw verifier material, capability grant, or Site authority. |
| Relation transition event | Durable evidence that a transition request was admitted by the hosted registry crossing law. | Erasure of previous relation history or local Site admission. |
| Capability grant | Local/owning authority statement that a Site/principal may request a scoped transition. | Raw credential value or transition execution by itself. |
| Credential reference | Pointer to a secret store entry, key, or token family. | Consent, retrieval, or use authority by itself. |
| Private verifier record | Hosted registry private auth lookup material, such as digest, key id, scope, status, and rotation metadata. | Public relation state or portable Site truth. |
| Enrollment evidence | Governed proof that a verifier may be created or replaced for a relation. | Permission to use the verifier outside its declared relation/action scope. |

## Enrollment Versus Use

Enrollment and use are separate crossings.

Enrollment creates or rotates a private verifier record. It requires registry
owner/operator authority in v0. A Site-originated self-enrollment path is not
supported in v0 unless a separately admitted signed Site envelope or out-of-band
operator grant exists.

Use authenticates one relation transition request against an already-enrolled
verifier. Successful verifier matching is necessary but not sufficient:
payload validation, relation-scope matching, capability grant reference, replay
checks, and transition law must still pass.

## First-Verifier Bootstrap

The first verifier for a relation may be enrolled only when all are present:

- active relation evidence or candidate relation evidence for the same
  `relation_id`, `site_id`, `subject_site_id`, and `relation_kind`;
- an enrollment actor with `registry_owner` or `operator` authority;
- a capability grant or grant request evidence scoped to the relation and
  transition family;
- a credential reference whose locus and store kind are declared;
- a verifier digest or public verification material, never the raw shared
  secret value;
- idempotency key for the enrollment event;
- evidence refs for the decision.

Unsupported in v0:

- anonymous self-enrollment by any Site that knows a relation id;
- raw token storage in relation rows;
- a public relation endpoint that returns verifier records;
- signed Site envelope verification as the sole bootstrap authority;
- cross-Site enrollment by a publisher for another Site relation.

## Operator Seed And Preflight

The v0 implementation exposes an operator seed posture instead of an
unauthenticated enrollment route. `planRelationCapabilityVerifierEnrollment`
returns a dry-run enrollment plan by default. A live D1 verifier mutation is
planned only when the caller supplies registry-owner/operator standing, bounded
evidence refs, an accepted relation capability ref, a credential ref, and both
`execute: true` and `admin_approved: true`.

The plan is inert: it does not create verifier rows, does not create or rotate
remote Worker secret material, and does not record raw secret values. It is a
preflight artifact for a governed operator seed command or future protected
enrollment route.

Creating or rotating the live remote secret behind `credential_ref` is a
capability-governed secret operation. It must be approved and evidenced through
the owning secret-management surface before the verifier record is created or
rotated in D1.

## Verifier Record Schema

`site_registry_relation_capability_verifier.v0` fields:

- `schema`;
- `verifier_id`;
- `relation_id`;
- `registry_id`;
- `site_id`;
- `subject_site_id`;
- `relation_kind`;
- `capability_kind`: for v0, normally
  `site_registry.relation.withdraw`;
- `allowed_transitions`: transition names such as `withdraw`;
- `allowed_actor`: expected actor kind and Site id;
- `credential_ref`: reference only, never a raw value;
- `verifier_material_kind`: `shared_secret_digest`, `public_key_ref`, or
  `signed_envelope_policy_ref`;
- `verifier_digest`: digest or verifier fingerprint, not a bearer value;
- `digest_algorithm`;
- `status`: `active`, `rotating`, `revoked`, `expired`, or `superseded`;
- `created_at`, `created_by`, `expires_at`;
- `rotation`: last rotation, next review, replaced verifier id;
- `revocation`: revoked by, revoked at, reason;
- `enrollment_evidence_refs`;
- `authority_limits`.

The record is private registry storage. Public relation reads may expose only
bounded posture such as `site_scoped_withdraw_verifier_enrolled: true` and
`verifier_status: active`; they must not expose digest, credential refs, or
secret-store coordinates by default.

## Transition Request Authentication

A Site-originated withdrawal request must provide:

- relation transition payload with stable `event_id` and `idempotency_key`;
- actor kind `site` with `actor.site_id` matching payload `site_id`;
- `capability_ref` matching the scoped capability grant;
- authentication proof for the enrolled verifier, such as an authorization
  token whose digest matches private verifier storage, or a future signed
  envelope;
- evidence refs excluding raw secret values.

The hosted registry must evaluate:

1. payload shape and transition support;
2. relation scope matches the private verifier record;
3. verifier status is active and unexpired;
4. digest/proof matches without logging raw material;
5. idempotency key has not already admitted a conflicting event;
6. capability ref is scoped to the same relation/action;
7. actor and Site ids match the allowed actor;
8. transition law allows the requested state/visibility change.

## Raw-Secret Exclusion

Raw tokens, passwords, bearer values, private keys, and secret resolver outputs
must not be stored in:

- public relation rows;
- relation transition event JSON;
- task reports;
- Worker response bodies;
- rejection payloads;
- fixtures.

Allowed evidence includes credential refs, verifier ids, key ids, digest
algorithm names, digests/fingerprints, secret-store family names, bounded
verification status, and audit refs.

## Replay And Idempotency

Enrollment events and transition events each have their own idempotency keys.

- Repeating the same enrollment idempotency key with the same verifier payload
  returns the original enrollment result.
- Repeating it with conflicting verifier material is refused.
- Repeating a transition idempotency key for the same relation and transition
  returns the prior transition receipt.
- Reusing a transition idempotency key for another relation, actor, or target
  state is refused.

Idempotency never bypasses verifier status checks for new attempts. A revoked
verifier cannot authorize new transition idempotency keys.

## Rotation And Revocation

Rotation is a new enrollment event that creates a replacement verifier and marks
the old verifier `rotating` or `superseded` after overlap rules are satisfied.
Remote secret mutation remains a separate dangerous operation under
Capability-Governed Secret Management and must not be performed as a side
effect of relation transition handling.

Revocation marks a verifier unusable for new transitions and records reason,
actor, and evidence refs. Revocation does not delete historical transition
events or relation records.

## Refusal Posture

Refusals must be explicit and bounded:

| Code | Meaning |
| --- | --- |
| `relation_verifier_missing` | No active verifier exists for relation/action scope. |
| `relation_verifier_scope_mismatch` | Verifier relation, actor, Site, or transition scope differs from payload. |
| `relation_verifier_revoked` | Matching verifier is revoked or superseded. |
| `relation_verifier_expired` | Matching verifier is expired. |
| `relation_verifier_digest_mismatch` | Presented proof does not match private verifier storage. |
| `relation_capability_ref_mismatch` | Payload capability ref is not scoped to the verifier/grant. |
| `relation_enrollment_requires_registry_owner` | v0 enrollment actor is not registry owner/operator. |
| `relation_cross_site_verifier_refused` | Site attempts to enroll or use a verifier for another Site's relation. |
| `relation_payload_contains_raw_secret_marker` | Request contains secret-like material in evidence or reason fields. |

Refusal responses must not echo presented bearer values, verifier digests, or
private credential refs.

## Next Implementation Boundaries

Later tasks may implement:

- D1 migration for private relation verifier records and enrollment events;
- package types and validators for verifier records and enrollment requests;
- Worker enrollment route gated by registry-owner/admin capability;
- Worker transition auth that first checks a relation-scoped verifier before
  admitting Site-originated withdrawal;
- tests for missing, revoked, expired, replayed, cross-Site, and raw-secret
  refusal paths.

Later tasks must not claim live readiness until migration, deploy, capability
binding, and post-deploy smoke evidence are separately admitted.

## Fixtures

- `docs/product/fixtures/site-registry-relation-capability-verifier/verifier-record.valid.json`
- `docs/product/fixtures/site-registry-relation-capability-verifier/enrollment-event.valid.json`
- `docs/product/fixtures/site-registry-relation-capability-verifier/withdraw-request.valid.json`
- `docs/product/fixtures/site-registry-relation-capability-verifier/refusal-cross-site.json`
