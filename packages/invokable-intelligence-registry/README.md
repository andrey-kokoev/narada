# @narada2/invokable-intelligence-registry

Portable persistence for the invokable-intelligence ontology (#2181).
One storage contract, two embodiments — `node:sqlite` for local authority
loci and Cloudflare D1 for remote ones — over a normalized relational
schema, with a shared conformance suite both adapters must pass.

Built on `@narada2/invokable-intelligence-contract` (#2180): every write
is validated against the contract before it touches the store.

## Design

- **One core, two thin adapters.** All behavior lives in
  `RegistryStoreCore` over a minimal `SqlExecutor` surface
  (`run`/`get`/`all`/`transact`). The node:sqlite adapter transacts with
  `BEGIN IMMEDIATE`; the D1 adapter transacts with `batch()`. Behavior
  cannot drift between embodiments because there is only one
  implementation.
- **Typed domain tables.** `resources`, `resource_relations`,
  `assertions`, `policies`, `policy_bindings`, `invocation_intents`,
  `invocation_plans`, `invocation_refusals`, immutable execution attempts
  and transitions, result envelopes, terminal outcomes, observations,
  admitted audit evidence, telemetry, and `schema_migrations`. No generic settings/EAV
  table. Full records are stored as contract JSON in `doc` columns;
  query-relevant fields (kind, locus, site, capability family/name,
  supersession) are real columns.
- **Authority loci are preserved, never merged.** `locus`/`site_id` are
  stored on every assertion and policy; reads filter explicitly.
  Nothing in the query layer combines target-, User-, and Host-Site
  records on its own.
- **Derived graph edges.** `resource_relations` (provided-by, owned-by,
  driven-by, serves, held-by) and `policy_bindings` are extracted from
  contract refs inside the same transaction as the write — queryable,
  always consistent with the document.
- **Supersession with history.** `supersedeAssertion(oldId, next)` is
  atomic; the old row stays with a `superseded_by` pointer and is
  excluded from reads unless `includeSuperseded` is set. Conflicts
  (missing, already superseded, self-supersede) raise `RegistryError`
  with `code: "supersede-conflict"`.
- **Deterministic reads.** Every list operation is `ORDER BY id`, so
  canonical dumps are byte-stable across adapters — the cross-adapter
  equivalence test relies on it.

## Migrations

`migrate()` applies versioned steps gated by `schema_migrations`;
idempotent and safe on an empty or previously initialized store.
Current schema version is 5; v5 removes the superseded mutable attempt and
evidence tables. Rollback: the SQLite adapter runs migration in a
single transaction (failure leaves the store untouched); D1 `batch()` is
the best-effort equivalent — D1 does not offer interactive DDL
transactions, and this is documented rather than hidden.

## Usage

```ts
import { SqliteRegistryStore, D1RegistryStore, createFakeD1 } from "@narada2/invokable-intelligence-registry";

const local = await SqliteRegistryStore.open(".ai/intelligence-registry.db");
const remote = await D1RegistryStore.open(env.INTELLIGENCE_REGISTRY_DB); // D1 binding
const testStore = await D1RegistryStore.open(createFakeD1(":memory:"));  // D1 API over node:sqlite
```

`createFakeD1` wraps node:sqlite with the D1 binding API so the D1
adapter runs the full conformance suite without miniflare/Wrangler; it
is exported for downstream packages' tests (e.g. the carrier in #2185).

## Conformance

`defineRegistryConformanceSuite(label, makeTarget)` registers the shared
suite. The package's own tests run it against both adapters (18 tests)
plus a cross-adapter canonical-read equivalence test over the
`CLOUDFLARE_KIMI` and `BATCH_OFFPEAK` fixtures. Any future adapter
(e.g. a real D1 binding in worker integration tests) should register
the same suite.

## Non-goals

- No resolver (#2182), no management surfaces (#2183).
- No global database that silently overrides any Site's authority —
  each store instance belongs to one locus; cross-locus effects require
  explicit materialization (later tasks).
- No secret material: credential locators are validated by the contract.

## Scripts

```sh
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # node --import tsx --test
```
