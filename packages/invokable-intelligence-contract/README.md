# @narada2/invokable-intelligence-contract

Versioned top-level contract for Narada's invokable-intelligence ontology:
typed resources, qualified capability assertions, typed policy documents,
and the runtime chain **Intent → Plan Snapshot → Attempt → Result → Outcome**,
with observations, admitted evidence, and telemetry kept distinct.

The original ontology, storage, and resolver work was delivered by
#2180–#2182. The contract was then hardened by Narada-proper tasks
#2204–#2210; implementation continues through the repository-local
`invokable-intelligence-implementation-v2` chapter.

## What it models (and what it refuses to model)

The core move is to stop collapsing an executable route into
"provider/model" name pairs:

- **Inference provider** — who runs inference (e.g. Cloudflare Workers AI).
- **Model provider** — who publishes the model (e.g. Kimi/Moonshot, Meta).
- **Model** — what is invoked, explicitly related to its model provider.
- **Model offering** — a model as offered by one inference provider with
  offering-specific capabilities, limits, and commercial properties.
- **Inference endpoint / adapter / execution route** — where invocation is
  reached, how it is driven, and the exact executable composition selected.
- **Credential locator** — where a credential is *looked up*; the contract
  structurally refuses secret material (validators reject `secret`,
  `token`, `value`, ... fields on locators).

Identity format is `<kind>:<slug>` (e.g. `model:kimi-k2-thinking`,
`inference-provider:cloudflare-workers-ai`). The kind is part of the
identity, so a malformed or cross-kind reference is detectable without a
registry lookup.

## Qualified capability assertions

What a resource can do is stated as `CapabilityAssertion` with:

- `capability: { family, name }` — an open vocabulary (`thinking/levels`,
  `batch/available`, `off-peak/window`, ...). New families need no
  contract change.
- `scope` — model, offering, route component, route composition, or an
  authority locus with an explicit Site reference.
- `provenance`, `validity` (interval + freshness), `confidence`, and
  `evidence` references.

Identity, relation, assertion, and policy are distinct record types.

## Typed policy documents and authority loci

Policies are typed by kind — `hard-constraints`, `preferences`,
`defaults`, `eligibility` — and each document is owned by exactly one
authority locus:

- **target-Site** — governance: hard constraints and defaults.
- **User-Site** — operator preferences; ranks, never overrides.
- **Host/PC-Site** — feasibility: what this host can actually do.

Rule types are restricted per policy kind (`POLICY_KIND_RULES`), so a
contradictory document — e.g. a preferences policy containing a hard
constraint — is rejected by validation. Precedence is never inferred
from insertion order or environment variables; each document carries an
explicit `revision`.

The machine-readable authority matrix also separates target governance,
principal consent and prohibition, User preference, target defaults,
execution feasibility, declared capability, and observed capability. A
foreign locus cannot escalate its effect merely by copying a record.

## Offerings, routes, and execution topology

An executable candidate is a `ModelOffering` plus an explicit route through
client, launcher, carrier, runtime, adapter, inference service, and endpoint.
Process, network, trust, account, and Site boundaries are first-class.
Capabilities compose by typed scope: hard capability claims intersect, while
narrower descriptive facts may override only within their declared scope.

Local and Cloudflare routes therefore share one ontology while retaining
structurally different topology and feasibility evidence.

## Materialization and access

Cross-locus effects use a versioned materialization envelope that preserves
origin, destination, statement revision and digest, scope, validity,
provenance, and authorization. Destination admission is idempotent and
supports refresh, conflict refusal, supersession, revocation, expiry, and
request-scoped signature verification. Portable SQLite/D1 DDL and operation
contracts are included; concrete adapters remain runtime-owned.

Route eligibility is evaluated before ranking. Service accounts, principals,
credential bindings, grants and consent, entitlements, quotas, budgets, and
governance constraints produce independent typed refusals. Credential
bindings carry secret-transport handles, never raw secret values.

## Time and invocation outcomes

Plans are immutable snapshots with an explicit authoritative clock, timezone,
validity interval, source revisions, and digest. Immediate, queued, delayed,
retry, and resume use is deterministic; stale or policy-changed plans require
re-planning before provider invocation.

Attempts, result envelopes, terminal outcomes, observations, admitted
evidence, and telemetry are separate records. Acknowledgment timeout is an
explicit unknown-admission outcome, not provider failure. Retry and replay
append lineage without overwriting prior attempts or results; payload
deletion preserves digest and audit tombstones.

## Invocation chain

- `InvocationIntent` — purpose, required capabilities, optional requested
  model/options. Produced by callers, carries no resolution.
- `InvocationPlan` / temporal plan snapshot — the resolver's output:
  explicit offering and executable-route refs, effective options, resolver
  version, clock/validity data, and full decision
  provenance (applied constraints/preferences/defaults, rejected
  candidates with reasons).
- `InvocationExecutionAttempt`, execution transitions, result envelope, and
  terminal outcome — distinct, append-only execution records.
- Observation, admitted evidence, and telemetry — distinct truth,
  admission, and operational-reporting surfaces.
- `InvocationRefusal` — typed no-plan outcome with a machine-readable
  `reason_code`.

## Validation

`validateResource`, `validateAssertion`, `validatePolicy`,
`validateInvocation` return structured `ContractError[]` and never throw
on malformed input. `validateBundle` adds cross-reference integrity:
every ref must resolve to a resource in the bundle.

## Fixtures

- `CLOUDFLARE_KIMI` — Cloudflare (inference provider) invoking Kimi's
  model with thinking controls, across all three authority loci.
- `BATCH_OFFPEAK` — batch availability plus an off-peak window policy.

Both validate clean and are used as conformance seeds by later tasks.

## Non-goals

- No concrete runtime storage adapter or resolver implementation.
- No generic key/value settings or EAV ontology.
- No provider/model environment variables as part of the canonical
  contract.

## Scripts

```sh
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # all test/*.test.ts suites
```
