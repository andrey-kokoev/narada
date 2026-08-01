# Host Fleet

`@narada-core/host-fleet` owns the substrate-neutral contracts for operating more
than one Narada host:

- durable `HostKey` and `RuntimeTarget` identity;
- the User Site Host Registry persistence boundary;
- host-qualified health and event projections;
- exact-target resolution with typed ambiguity refusals; and
- bounded requests through a declared Host Gateway endpoint.

Gateway records carry an explicit credential policy. Records without one use
the migration-safe `bridge_compatibility` class; `dedicated_host_gateway`
selects the dedicated host header and enforces optional validity bounds before
any network request. The registry stores only a credential reference, never a
raw secret.

Host lifecycle requests have a versioned preflight contract and a separate
authority-owned execution API. `preflightHostFleetLifecycleIntent` validates
an exact HostKey, explicit confirmation, expected registry revision,
idempotency request ID, and terminal state without mutation. The registry's
`applyLifecycleIntent` performs the immediate revision check, persists a
request-id/hash result for replay, and records actor/request correlation in
the audit ledger.

Enrollment admission is available as a non-mutating CLI preflight through
`narada fleet register --dry-run` and as a versioned enrollment intent for
authority-owned callers. `applyEnrollmentIntent` accepts secret references
only, performs revision and explicit re-enrollment checks, persists a durable
replay result, and records audit correlation. Both intent APIs return typed
`applied`, `replayed`, `unchanged`, or `refused` results; refusal never mutates
the registry.

It does not own Site state, NARS session state, operator-router state, or raw
credentials. Those remain owned by the target host and its Site/runtime
authority.
