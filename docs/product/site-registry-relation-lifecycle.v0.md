# Site Registry Relation Lifecycle v0

`site_registry_relation_lifecycle.v0` defines how a remote-hosted Site
Registry counts, hides, retires, or forgets Sites without collapsing relation
state into raw deletion.

This contract applies to the Cloudflare-hosted Site Registry realization of
Site Telemetry Publication. It is projection infrastructure, not Site authority.

## Authority Reading

A registry relation says that a registry surface is allowed to project a Site
under a declared relation kind. It does not move Site authority, grant mutation
power over the Site, admit remote inbox state, certify identity, or make D1/KV
state into Site truth.

Related doctrine:

- Site relation ledger: relation records are durable evidence, not authority
  movement.
- Site pub/sub signal exchange: transported signals are inert until admitted by
  the receiving locus.
- Capability-governed secret management: capability refs may be recorded; raw
  bearer values must not be stored in relation events.
- Canonical admission/rejection ledger: rejected, deferred, withdrawn, or
  superseded candidates remain visible as decisions rather than disappearing by
  silence.

## Relation Identity

Relation identity is stable across transitions:

```json
{
  "relation_id": "rel_narada-proper_registry_narada-proper_publishes-to",
  "registry_id": "site-registry:narada-proper:cloudflare",
  "site_id": "narada-proper",
  "relation_kind": "publishes_to",
  "subject_site_id": "narada-proper"
}
```

Minimum identity fields:

| Field | Meaning |
| --- | --- |
| `relation_id` | Stable id for the registry relation. |
| `registry_id` | Registry surface or owning registry locus. |
| `site_id` | Site being counted/projected. |
| `relation_kind` | Why the registry knows the Site. |
| `subject_site_id` | Site whose projection is affected. Defaults to `site_id`. |

First-slice relation kinds:

| Kind | Meaning |
| --- | --- |
| `publishes_to` | Site publishes telemetry into this registry surface. |
| `known_to_registry` | Registry owner has admitted this Site as expected/visible. |
| `candidate` | Candidate relation exists but is not active public projection. |

Future relation kinds may include `routes_to`, `subscribes_to`,
`observes`, and `references`.

## State And Visibility

Relation lifecycle state and visibility are separate.

### Relation State

| State | Meaning | Public default |
| --- | --- | --- |
| `candidate` | Relation is proposed or observed but not active. | Hidden |
| `active` | Relation is admitted and may be counted. | Visible when visibility is `public` |
| `withdrawn` | Site-originated or relation-owner request stopped active counting. | Hidden |
| `retired` | Registry owner or lifecycle process ended the relation as historical. | Hidden |
| `rejected` | Candidate relation was refused. | Hidden |
| `superseded` | Relation was replaced by another relation id or surface. | Hidden |

### Visibility

| Visibility | Meaning |
| --- | --- |
| `public` | May appear in default `/api/sites`, `/api/freshness`, and tile UI when state is `active`. |
| `private` | Retained for authorized/private future surfaces only. |
| `suppressed` | Hidden from public projection by registry owner visibility decision. |

`suppressed` is not a relation state. It is a visibility posture over the
relation. Suppression can hide an otherwise active relation without deleting
history.

### Purge

`purged` is not a first-slice state transition. Purge is a future
high-authority operation because it destroys or cryptographically erases
re-derivation material.
See [Site Registry Purge Posture v0](site-registry-purge-posture.v0.md).

This chapter may specify purge refusal posture, but must not implement purge.

## Transition Event

Every lifecycle change is a new governed crossing artifact:

```json
{
  "schema": "narada.site_registry.relation_transition.v0",
  "event_id": "srrt_...",
  "idempotency_key": "narada-proper:withdraw:2026-05-16",
  "registry_id": "site-registry:narada-proper:cloudflare",
  "relation_id": "rel_narada-proper_registry_narada-proper_publishes-to",
  "site_id": "narada-proper",
  "relation_kind": "publishes_to",
  "transition": "withdraw",
  "from_state": "active",
  "to_state": "withdrawn",
  "from_visibility": "public",
  "to_visibility": "private",
  "actor": {
    "kind": "site",
    "site_id": "narada-proper",
    "principal": "narada.architect"
  },
  "capability_ref": "capability:site_registry.relation.withdraw.narada-proper",
  "occurred_at": "2026-05-16T23:20:00.000Z",
  "reason_codes": ["site_requested_not_counted"],
  "evidence_refs": ["task:1433"],
  "raw_secret_values_recorded": false,
  "authority_limits": [
    "relation_transition_is_registry_projection_state",
    "transition_does_not_mutate_site_authority",
    "transition_does_not_delete_provenance",
    "cloud_receipt_is_not_local_site_admission"
  ]
}
```

Required fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | `narada.site_registry.relation_transition.v0`. |
| `event_id` | yes | Stable transition event id. |
| `idempotency_key` | yes | Deduplicates retry attempts for the same transition request. |
| `registry_id` | yes | Registry surface receiving the transition. |
| `relation_id` | yes | Relation being changed. |
| `site_id` | yes | Site affected by public counting/visibility. |
| `relation_kind` | yes | Relation kind being changed. |
| `transition` | yes | Requested transition verb. |
| `from_state` | conditional | Required when caller asserts current state. |
| `to_state` | yes | Resulting relation state. |
| `from_visibility` | conditional | Required when caller asserts current visibility. |
| `to_visibility` | yes | Resulting visibility posture. |
| `actor` | yes | Requesting Site, registry owner, operator, or system actor. |
| `capability_ref` | yes | Capability reference, not a raw token. |
| `occurred_at` | yes | Event timestamp. |
| `reason_codes` | yes | Machine-readable reason list. |
| `evidence_refs` | yes | Bounded evidence refs. |
| `raw_secret_values_recorded` | yes | Must be `false`. |
| `authority_limits` | yes | Projection and no-authority limits. |

## Actor Posture

| Actor kind | May request | Notes |
| --- | --- | --- |
| `site` | `withdraw` for its own relation | The registry may accept only when actor Site matches relation Site or a declared owner/ref is present. |
| `registry_owner` | `activate`, `retire`, `suppress`, `unsuppress`, `reject` | Owns registry projection policy, not the represented Site. |
| `operator` | Same as registry owner only with registry-owner capability ref | Operator identity alone is not enough. |
| `system` | `expire_candidate` or freshness-derived advisory transitions in future | Must not silently withdraw active Sites in v0. |

## First-Slice Transitions

Allowed transition matrix:

| Current | Transition | Next state | Next visibility | Actor |
| --- | --- | --- | --- | --- |
| none | `activate` | `active` | `public` or `private` | `registry_owner` |
| `candidate` | `activate` | `active` | `public` or `private` | `registry_owner` |
| `candidate` | `reject` | `rejected` | `private` | `registry_owner` |
| `active` | `withdraw` | `withdrawn` | `private` | `site` or `registry_owner` |
| `active` | `retire` | `retired` | `private` | `registry_owner` |
| `active` | `suppress` | `active` | `suppressed` | `registry_owner` |
| `active` + `suppressed` | `unsuppress` | `active` | `public` | `registry_owner` |
| `withdrawn` | `reactivate` | `active` | `public` or `private` | `registry_owner` plus Site evidence |
| `retired` | `reactivate` | `active` | `public` or `private` | `registry_owner` plus new evidence |

Refused in v0:

| Requested transition | Reason |
| --- | --- |
| `purge` | Future high-authority operation; not implemented. |
| `delete` | Not a lifecycle transition; use withdraw, retire, suppress, or future purge. |
| `withdraw` by unrelated Site | Actor lacks standing. |
| `activate` by represented Site alone | Registry owner admits counting policy. |
| state change without idempotency key | No replay safety. |
| state change with raw secret values | Secret/capability boundary violation. |

## Public Read Model Rule

Default public routes count only relations where:

```text
state = active
visibility = public
```

Routes affected:

- `GET /api/sites`;
- `GET /api/freshness`;
- public root tile UI.

Withdrawn, retired, rejected, superseded, private, or suppressed relations are
not shown in the default public Site grid.

Historical event/projection material remains retained for authorized future
inspection unless a separate purge operation is admitted.

## Storage Posture

Live hosted relation lifecycle should be D1-backed:

- relation current-state rows provide operational query state;
- relation event rows preserve idempotent transition evidence;
- event JSON is stored as replayable evidence;
- KV may cache public projection results but is not lifecycle authority.

JSON-only storage is acceptable for fixtures and portable evidence, not for the
remote-hosted current lifecycle state.

## Authority Limits

Relation lifecycle transitions:

- do not mutate represented Site authority;
- do not mutate local Narada proper task lifecycle or inbox state;
- do not certify Site identity;
- do not grant capabilities;
- do not delete provenance;
- do not turn cloud receipt into local admission;
- do not expose raw secret values.

## Residuals

- Live Cloudflare migration application and guarded verification.
- Admin/private history surface for withdrawn/suppressed relations.
- Federation route for cross-registry relation projection.
- Future purge operation contract and retention policy integration.
- Future privacy/retention chapter for destructive purge previews and receipts.
