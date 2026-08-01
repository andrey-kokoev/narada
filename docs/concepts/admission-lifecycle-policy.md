# AdmissionPolicy and ObjectLifecyclePolicy

Status: Chapter G implementation, Task 2377, submitted for review after local verification.

The shared policy contract lives in `@narada-core/narada-policy-contract`. It is a
cross-domain contract, not a replacement for the authorities that execute each
domain. It owns the vocabulary, decision shape, refusal gates, and evidence
requirements. Site governance, NARS execution, task storage, projection
transport, and client rendering remain owned by their existing surfaces.

## AdmissionPolicy

`AdmissionPolicy` has schema `narada.admission_policy.v1`. Its owner identifies
the policy authority and its revision is part of every decision. The policy
declares both permitted ingress channels and permitted payload kinds:

- ingress channels: operator messages, email intake, inbox task creation,
  remote operator input, and projection ingress;
- payload kinds: operator text, inbox events, email facts, task requests, remote
  inputs, and projection events.

The evaluator requires an authorization result, source freshness, target
authority, turn state, capacity posture, attempt number, and current evidence.
It returns exactly one of these outcomes:

- `accepted` — the target may admit the input now;
- `queued` — the input is admitted to a declared queue;
- `rejected` — the input is refused and must not be retried implicitly;
- `delayed` — the input is not admitted while a turn, transport, or capacity
  condition is unresolved;
- `review_required` — a human or Site-owned review gate must resolve before
  admission.

Every result carries retry posture, backpressure posture, policy revision, the
target authority, and an audit record. Unauthorized and stale sources are
refused before any Site hook is consulted. A Site hook may make a decision more
restrictive, such as requiring review, but cannot relax a core refusal or mint
authority for another surface. This keeps Site-specific governance explicit
without flattening Sites into one global allow/deny rule.

The four required ingress mappings are:

| Ingress | Canonical owner | Site-specific hook | Durable evidence |
| --- | --- | --- | --- |
| Operator message queue | NARS admission policy | target-Site message policy | input reference, queue decision, turn state |
| Email intake | mail/intake authority | Site extraction and review policy | message reference, parsed payload, decision |
| Inbox task creation | task governance | Site task-creation policy | inbox event, task request, admission decision |
| Remote operator input | source authority plus target NARS | target authority and crossing policy | source epoch, target authority, transport/replay evidence |

Projection ingress is also represented as a fifth channel for surfaces that
need to submit an already-governed projection event rather than an operator
command.

## ObjectLifecyclePolicy

`ObjectLifecyclePolicy` has schema `narada.object_lifecycle_policy.v1`. It
defines a shared lifecycle algebra while retaining an object-family state model.
The shared gates are ownership, mutation authority, revision freshness, stale
state reconciliation, explicit revocation, explicit archival, replay evidence,
cleanup eligibility, and mandatory audit evidence.

The catalog maps these object families without renaming their domain states:

| Object family | Representative local states | Object-specific authority |
| --- | --- | --- |
| task | `opened`, `claimed`, `needs_continuation`, `in_review`, `deferred`, `closed`, `confirmed` | task governance |
| session | `starting`, `ready`, `closing`, `closed`, `failed` | NARS session core |
| projection | `proposed`, `active`, `stale`, `revoked` | projection authority |
| artifact | `active`, `revoked`, `expired`, `archived` | NARS session core |
| attachment | `requested`, `replaying`, `live`, `closing`, `closed`, `failed` | NARS session core |
| grant | `proposed`, `active`, `suspended`, `expired`, `revoked` | grant authority |
| loop | `created`, `running`, `paused`, `stale`, `stopped` | loop authority |
| health record | `observed`, `degraded`, `stale`, `superseded` | health authority |

Each policy adds the shared `archived` retention state where the local domain
needs a storage boundary. That does not mean a task status, session status, or
projection status is rewritten into one universal enum. The local state and
transition map remain authoritative; the shared policy governs whether a
requested mutation is admissible.

The transition evaluator refuses an unauthorized actor, a non-owning authority,
an expected/observed revision mismatch, a stale object without verified
reconciliation evidence, an undeclared state, an invalid local transition, an
implicit revoke, an implicit archive, replay without verified durable evidence,
and cleanup before archival. Task reopen is an explicit object-specific rule,
so the existing `closed`/`confirmed` recovery semantics are preserved rather
than accidentally made terminal by the shared algebra.

The migration rule is additive:

- existing state machines continue to own their local transitions and storage;
- adapters provide the policy family, authority, revision, and evidence refs;
- policy hooks preserve task, Site, provider, and transport-specific rules;
- a refusal is durable and explainable through the shared decision/audit shape;
- adoption can proceed one ingress or object family at a time.

The implementation and contract tests are in
`packages/narada-policy-contract/src/admission-lifecycle-policy.ts` and
`packages/narada-policy-contract/src/admission-lifecycle-policy.test.ts`.
They cover all admission outcomes, retry/backpressure/audit evidence, Site
restriction and relaxation refusal, eight object families, authorized
transitions, unauthorized actors, stale revisions and objects, explicit
revoke/archive/cleanup/replay gates, task reopen, and verified reconciliation.
