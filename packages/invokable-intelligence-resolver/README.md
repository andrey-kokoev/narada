# @narada2/invokable-intelligence-resolver

Deterministic hierarchical resolution for invokable intelligence (#2182).
Turns an `InvocationIntent` plus explicit context into an explainable
`InvocationPlan`, or a typed `InvocationRefusal` when no eligible plan
exists. Never infers precedence from insertion order or environment
variables; never calls a model.

## Resolution pipeline

1. **Input** — `InvocationIntent` + explicit `ResolverContext`
   (target-Site, User-Site, Host-Site refs, runtime family, ISO time).
2. **Load** — candidate resources, live assertions, and policies through
   the registry storage contract (#2181).
3. **Policy-conflict check** — a capability both required and forbidden
   by applicable hard-constraint policies refuses immediately with
   `policy-conflict`.
4. **Cumulative hard eligibility** — each step can only remove
   candidates:
   intent model filter → intent required capabilities → hard constraints
   from all loci (target → user → host, then policy id) → host
   feasibility (eligibility locus; deny eliminates, any allow rule makes
   an allowlist) → credential feasibility at the host → requested option
   support (v1 families: `thinking`, `batch` + `off-peak` window).
5. **Ranking** — User-Site preferences score *eligible* candidates only.
   Preferences cannot override target-Site governance or host
   feasibility.
6. **Stable tie-breakers** — score desc, then lowest model id, then
   lowest endpoint id. Fully documented, no heuristics.
7. **Plan** — resolved refs (model, model provider, inference provider,
   endpoint, adapter, credential), effective options (target-Site
   defaults first, intent options win), resolver version, and complete
   decision provenance (applied constraints/preferences/defaults,
   rejected candidates with reasons).

## Capability subjects

Capabilities attach to their natural subject: `credential/*` to the
path's credential locator, everything else to the model. Failure
attribution follows the subject: credential-family failures report
`credential-unavailable`; model-scoped failures report
`hard-constraint` / `missing-required-capability`; expired evidence
reports `stale-capability` wherever it is detected.

## Determinism

- Plans stamp `context.time` (not wall clock) and derive their id from a
  deterministic FNV-1a hash of `{intent, context, resolver version}`.
  Identical canonical inputs produce byte-stable plans — the same
  resolution is also idempotent for restart/replay.
- Refusal reason codes are selected by documented precedence:
  `stale-capabilities` → `credentials-unavailable` →
  `unsupported-options` → `no-candidates`, based on candidates whose
  sole elimination reason matches.

## Usage

```ts
import { resolveInvocation } from "@narada2/invokable-intelligence-resolver";

const result = await resolveInvocation(intent, {
  targetSite, userSite, hostSite, runtime: "workers", clock, access, topology_observations,
}, {
  store,
  // Required even when empty so cross-Site acquisition can never be skipped implicitly.
  materializedInputs: { admitted: [], excluded: [], acquisition_refs: [] },
});

if (result.schema.endsWith("invocation-plan.v2")) { /* invoke result.selected */ }
else { /* surface result.reason_code + result.rejected_candidates */ }
```

## Non-goals (v1)

- No inference: the resolver plans, it never invokes.
- No nondeterministic scoring or opaque heuristics.
- No policy precedence inferred from row order or env var presence.

## Scripts

```sh
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # node --import tsx --test
```
