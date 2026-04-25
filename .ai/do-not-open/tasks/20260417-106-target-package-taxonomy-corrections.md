# Target Package Taxonomy Corrections

## Mission
Correct the initial target package taxonomy so it matches the kernel layering and current code reality more precisely.

This task supersedes the incorrect parts of `20260417-105-target-package-taxonomy.md` and explicitly replaces the accidental executed note that was removed.

## Corrections

### 1. Split Generic Persistence From Mailbox Persistence

The original mapping treated `src/persistence/` as generic kernel storage. That is too broad.

Current mailbox-specific modules in `src/persistence/` include:

- `messages.ts`
- `tombstones.ts`
- `views.ts`
- `blobs.ts`

These belong with `verticals/mailbox`, not `layers/kernel`.

Generic persistence primitives are narrower, for example:

- `cursor.ts`
- `scope-cursor.ts`
- `apply-log.ts`
- `lock.ts`

Even these should be reviewed case by case rather than moved as one block.

### 2. Keep Intent And Execution Separate From Foreman

The original mapping placed `intent/` and `executors/` under `layers/foreman`.

That contradicts the kernel pipeline:

- `Policy`
- `Intent`
- `Execution`
- `Confirmation`

So the corrected target shape should either:

- keep `intent` and `executors` distinct under `layers/`, or
- place them under `layers/outbound` only if the package is truly effect-family specific

Current best correction:

```text
packages/
  layers/
    kernel/
    foreman/
    scheduler/
    outbound/
    observation/
    daemon/
    cli/
    intent/
    execution/
```

If package count is considered too high later, collapse deliberately then, not by smearing boundaries now.

### 3. Facts Are Generic; Fact Adapters May Be Vertical-Specific

The original mapping placed `facts/` in `verticals/mailbox`.

That is too low-level for the current implementation.

Correct split:

- generic fact store and fact types belong with `layers/kernel`
- mailbox-specific record-to-fact adapters belong with `verticals/mailbox`

Concretely:

- `src/facts/store.ts` → `layers/kernel`
- `src/facts/types.ts` → `layers/kernel`
- `src/ids/fact-id.ts` → `layers/kernel`
- `src/adapter/graph/exchange-to-facts.ts` → `verticals/mailbox`

### 4. Worker Registry Is Not Necessarily Outbound-Only

The original mapping placed `workers/` under `layers/outbound`.

That is too narrow.

`src/workers/registry.ts` describes explicit worker identities and concurrency policy enforcement across executor families. That reads as generic execution infrastructure.

Corrected direction:

- `workers/` belongs with generic execution infrastructure, not mail outbound specifically
- candidate homes:
  - `layers/execution`
  - or `layers/kernel` if worker identity remains minimal

Preferred target: `layers/execution`

### 5. Observation Should Not Swallow Generic Logging/Tracing Automatically

The original mapping put `metrics.ts`, `tracing.ts`, and `logging/` into `layers/observation`.

That may be right operationally, but it is not yet proven conceptually.

Correction:

- `observability` query surfaces belong in `layers/observation`
- `logging`, `metrics`, and `tracing` should be treated as cross-cutting runtime infrastructure until a firmer package boundary is chosen

For now they should be marked `TBD`, not conclusively placed.

### 6. Sources Likely Deserve Their Own Layer Package

The earlier task left `sources/` ambiguous. That ambiguity is important enough to formalize.

Corrected likely target:

```text
packages/
  layers/
    sources/
```

Reason:

- sources are first-class in `00-kernel.md`
- they are not just kernel utility code
- they are not verticals themselves

This package would hold source contracts and generic source machinery, while vertical-specific source adapters still live under each vertical.

## Revised Target Shape

```text
packages/
  layers/
    kernel/
    sources/
    foreman/
    scheduler/
    intent/
    execution/
    outbound/
    observation/
    daemon/
    cli/
  verticals/
    mailbox/
    search/
  domains/
    charters/
    obligations/
    knowledge/
```

## Revised Mapping Principles

- generic durable facts → `layers/kernel`
- generic source contracts → `layers/sources`
- policy and arbitration → `layers/foreman`
- leases and runnable work → `layers/scheduler`
- durable effect boundary → `layers/intent`
- generic workers and executors → `layers/execution`
- mail-specific side effects and reconciliation → `layers/outbound`
- read-only query surfaces → `layers/observation`
- Exchange/Graph ingestion and mailbox materialization → `verticals/mailbox`

## Definition Of Done

- [ ] incorrect `105` mappings are explicitly corrected
- [ ] intent and execution are separated from foreman
- [ ] facts are split into generic store vs vertical adapters
- [ ] mailbox persistence is split from generic persistence
- [ ] revised target taxonomy is ready for future migration work
