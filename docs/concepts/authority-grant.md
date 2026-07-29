# AuthorityGrant

`AuthorityGrant` is Narada's durable contract for delegated authority. It names the authority owner, the grantor and grantee, the capability and action, the bounded scope, the basis for the grant, and the evidence and audit trail that make the decision replayable.

The implementation is [`packages/domains/concepts/src/authority.ts`](../../packages/domains/concepts/src/authority.ts). The record schema is `narada.authority_grant.v1`.

## Ownership boundary

Every grant has one `owner` and a non-empty `non_owner_boundary`. The owner is the canonical authority runtime or authority surface responsible for admission and enforcement. A projection edge, projection store, projection surface, transport adapter, provider result, or cache freshness signal is not an owner.

The owner boundary is intentionally separate from the grant's `grantor` and `grantee` identities. A declaration can name the requested delegation, but only the owner can admit or enforce it. This prevents a projection from turning a displayed or durable copy into permission.

## Lifecycle

The lifecycle is explicit and monotonic:

```text
declared -> admitted -> enforced
    |          |          |
    +----------+----------+-> revoked
    +----------+----------+-> expired
```

`declared` carries declaration intent only. `admitted` requires an owner-produced admission record. `enforced` requires both admission and an effect reference. `revoked` requires a reason and evidence reference. `expired` requires an expiry timestamp that has been reached. Terminal states cannot transition again.

The implementation rejects:

- a projection principal as owner, grantor, grantee, or lifecycle actor;
- an admitted or enforced phase without its preceding phase;
- enforcement without an effect reference;
- revocation without a reason;
- expiry before the declared expiry time;
- lifecycle transitions by an actor other than the canonical owner.

These are refusal semantics, not advisory warnings. A rejected transition produces an `AuthorityContractError` with a stable code and no mutation of the input object.

## ProjectionTopology relationship

`AuthorityGrant` and `ProjectionTopology` are related but not interchangeable. `ProjectionTopology` describes authority runtimes, governed projection edges, non-canonical stores, surfaces, and typed intent routes. `AuthorityGrant` describes an authority decision that may be carried across those edges.

The topology contract is `narada.runtime_projection_graph.v1`, implemented beside `AuthorityGrant` and queried with `queryProjectionTopology`. Its validation requires:

- every authority runtime to declare one owner and an explicit non-owner boundary;
- every edge to name an existing authority origin and projection-store target;
- every surface to read from an existing projection store;
- every intent route to target an authority runtime, not a projection store;
- every projection store to carry `authority_posture: non_canonical_projection`.

Durability, freshness, attachment order, public reachability, and transport changes do not alter canonical ownership. The focused proof is [`packages/domains/concepts/test/authority.test.ts`](../../packages/domains/concepts/test/authority.test.ts), which keeps the authority owner stable while changing projection freshness and surface order and rejects canonical-store or unknown-route variants.

The registry record is [`packages/domains/concepts/records/authority-grant.concept.json`](../../packages/domains/concepts/records/authority-grant.concept.json); the topology record links to the same implementation and test boundary.
