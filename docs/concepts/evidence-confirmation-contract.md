# Evidence and confirmation contract

## Purpose

`EvidencePacket` is the shared proof envelope for consequential Narada claims.
It records what was claimed, which evidence produced the claim, who verified it,
which artifacts and commands support it, when it was observed, what authority
and object scope it belongs to, and how its identity correlates across a
request, input, turn, session, capability, intent, effect, and observation.

The packet is evidence, not permission. It cannot admit an input, mint an
authority, or authorize a mutation. Existing admission and lifecycle policies
remain the decision authorities.

## Confirmation rule

`EffectConfirmation` is separate from provider and transport outcomes. A
provider success, a closed transport, silence, or a fresh projection may be a
useful signal, but none is an effect observation. A consequential effect is
confirmed only when an admissible, correlated observation, artifact, replay, or
reconciliation packet has sufficient trust (`attested` or `verified`) and a
matching effect identity.

If the observation is absent, stale, invalidated, interrupted, reconnecting, or
degraded, the result remains `unknown` and requires reconciliation. The contract
does not turn uncertainty into failure or success.

The outcome vocabulary is explicit:

- `accepted` means admitted or observed as accepted, not completed.
- `completed` means a trusted observation supports completion.
- `failed` and `cancelled` are confirmed terminal observations when the
  observation authority says so.
- `interrupted_unknown`, `stale`, `reconnecting`, and `degraded` preserve
  unresolved state and require follow-up.

## Reference preservation

Task lifecycle records may keep their existing opaque `evidence_refs`; the
contract adds packet identities rather than replacing those fields. Runtime
records may carry packet references and a confirmation reference alongside
request and provider outcome fields. The package exposes additive builders for
both projections.

## Mapped evidence sources

The packet envelope can represent existing evidence without changing its
authority:

- task lifecycle closeout evidence becomes a task-scoped packet reference;
- SOP run receipts become command/test and artifact references;
- git commit or diff evidence becomes a `git_diff` artifact;
- E2E and probe results become test-output or observation artifacts;
- projection health evidence becomes a projection signal, never an effect
  confirmation by itself;
- provider and transport outcomes remain non-confirming signals unless an
  independent observation packet corroborates the effect.

## Implementation

The versioned contract is implemented in
`packages/evidence-confirmation-contract/src/evidence-confirmation.ts`.
Focused tests cover admission, permission separation, correlation mismatch,
terminal outcomes, non-confirming provider/transport/projection signals,
interrupted replay, and additive task/runtime references.
