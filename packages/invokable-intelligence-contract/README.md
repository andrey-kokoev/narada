# @narada2/invokable-intelligence-contract

Versioned top-level contract for Narada's invokable-intelligence ontology:
typed resources, qualified capability assertions, typed policy documents,
and the runtime chain **Invocation Intent → Plan → Attempt → Evidence**.

Task: #2180. Later tasks build on this package: portable storage (#2181),
the deterministic resolver (#2182), management/migration surfaces (#2183),
local runtime integration (#2184), Cloudflare carrier integration (#2185),
and cutover (#2186).

## What it models (and what it refuses to model)

The core move is to stop collapsing five different things into
"provider/model" name pairs:

- **Inference provider** — who runs inference (e.g. Cloudflare Workers AI).
- **Model provider** — who publishes the model (e.g. Kimi/Moonshot, Meta).
- **Model** — what is invoked, explicitly related to its model provider.
- **Inference endpoint / adapter** — how invocation is reached and driven.
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
- `scope` — `global` or a specific authority locus with an explicit Site
  reference.
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

## Invocation chain

- `InvocationIntent` — purpose, required capabilities, optional requested
  model/options. Produced by callers, carries no resolution.
- `InvocationPlan` — the resolver's output: explicit resolved refs
  (model, model provider, inference provider, endpoint, adapter,
  credential), effective options, resolver version, and full decision
  provenance (applied constraints/preferences/defaults, rejected
  candidates with reasons).
- `InvocationAttempt` / `InvocationEvidence` — execution record and
  usage/timing evidence.
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

## Non-goals (v1)

- No storage adapters, no resolver — those are #2181/#2182.
- No generic key/value settings or EAV ontology.
- No provider/model environment variables as part of the canonical
  contract.

## Scripts

```sh
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # node --import tsx --test
```
