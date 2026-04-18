# Target Package Taxonomy Corrections — EXECUTED

**Date**: 2026-04-17
**Status**: Accepted as corrected end-state structure
**Supersedes**: `20260417-105-target-package-taxonomy.md` (see `20260417-105-target-package-taxonomy-SUPERSEDED.md`)

---

## Revised Target Shape

```text
packages/
  layers/
    kernel/       — generic infrastructure, identity, persistence primitives, recovery
    sources/      — source contracts and generic source machinery
    foreman/      — policy, arbitration, governance, facade, handoff
    scheduler/    — lease management, scheduling, retention, cleanup
    intent/       — durable effect boundary (commands, versions, transitions)
    execution/    — generic workers, executors, registry, concurrency policy
    outbound/     — mail-specific side effects and reconciliation
    observation/  — read-only query surfaces, authority guard
    daemon/       — long-running service host
    cli/          — operator-facing commands
  verticals/
    mailbox/      — Exchange/Graph ingestion, normalization, mailbox materialization
    search/       — full-text search (FTS5)
  domains/
    charters/     — policy envelope definitions
    obligations/  — (future) commitment tracking
    knowledge/    — (future) structured domain memory
```

---

## Detailed Mapping Corrections

### 1. Persistence Split (was too broad)

| Module | 105 (incorrect) | 106 (corrected) |
|--------|-----------------|-----------------|
| `persistence/cursor.ts` | `layers/kernel` | `layers/kernel` ✅ |
| `persistence/scope-cursor.ts` | `layers/kernel` | `layers/kernel` ✅ |
| `persistence/apply-log.ts` | `layers/kernel` | `layers/kernel` ✅ |
| `persistence/lock.ts` | `layers/kernel` | `layers/kernel` ✅ |
| `persistence/messages.ts` | `layers/kernel` ❌ | `verticals/mailbox` |
| `persistence/tombstones.ts` | `layers/kernel` ❌ | `verticals/mailbox` |
| `persistence/views.ts` | `layers/kernel` ❌ | `verticals/mailbox` |
| `persistence/blobs.ts` | `layers/kernel` ❌ | `verticals/mailbox` |

### 2. Intent / Execution Separated From Foreman

| Module | 105 (incorrect) | 106 (corrected) |
|--------|-----------------|-----------------|
| `foreman/` (governance, facade, handoff) | `layers/foreman` | `layers/foreman` ✅ |
| `intent/registry.ts`, `intent/store.ts` | `layers/foreman` ❌ | `layers/intent` |
| `executors/confirmation.ts` | `layers/foreman` ❌ | `layers/execution` |
| `executors/process-executor.ts` | `layers/foreman` ❌ | `layers/execution` |
| `executors/lifecycle.ts` | `layers/foreman` ❌ | `layers/execution` |
| `executors/coordinator.ts` | `layers/foreman` ❌ | `layers/execution` |

Rationale: Kernel pipeline is `Policy → Intent → Execution → Confirmation`. Collapsing Intent/Execution into Foreman breaks the conceptual boundary.

### 3. Facts Split (generic vs vertical)

| Module | 105 (incorrect) | 106 (corrected) |
|--------|-----------------|-----------------|
| `facts/store.ts` | `verticals/mailbox` ❌ | `layers/kernel` |
| `facts/types.ts` | `verticals/mailbox` ❌ | `layers/kernel` |
| `ids/fact-id.ts` | `layers/kernel` ✅ | `layers/kernel` ✅ |
| `adapter/graph/exchange-to-facts.ts` | `verticals/mailbox` ✅ | `verticals/mailbox` ✅ |

### 4. Worker Registry Moved (was outbound-specific)

| Module | 105 (incorrect) | 106 (corrected) |
|--------|-----------------|-----------------|
| `workers/registry.ts` | `layers/outbound` ❌ | `layers/execution` |

Rationale: Worker registry describes explicit worker identities and concurrency policy across executor families — generic execution infrastructure, not mail-specific.

### 5. Logging/Metrics/Tracing Marked TBD

| Module | 105 (incorrect) | 106 (corrected) |
|--------|-----------------|-----------------|
| `observability/queries.ts` | `layers/observation` ✅ | `layers/observation` ✅ |
| `observability/plane.ts` | `layers/observation` ✅ | `layers/observation` ✅ |
| `observability/authority-guard.ts` | `layers/observation` ✅ | `layers/observation` ✅ |
| `logging/` | `layers/observation` ❌ | TBD — cross-cutting |
| `metrics.ts` | `layers/observation` ❌ | TBD — cross-cutting |
| `tracing.ts` | `layers/observation` ❌ | TBD — cross-cutting |

Rationale: Observability query surfaces belong in `observation`, but logging/metrics/tracing are cross-cutting runtime infrastructure. Their final package boundary is deferred.

### 6. Sources Given Their Own Layer

| Module | 105 (ambiguous) | 106 (corrected) |
|--------|-----------------|-----------------|
| `sources/timer-source.ts` | ??? | `layers/sources` |
| `sources/filesystem-source.ts` | ??? | `layers/sources` |
| `sources/webhook-source.ts` | ??? | `layers/sources` |
| `adapter/graph/` | `verticals/mailbox` ✅ | `verticals/mailbox` ✅ |

Rationale: Sources are first-class in the kernel architecture. They are not verticals themselves, nor mere utility code.

---

## Mapping Principles (Revised)

| Concept | Target |
|---------|--------|
| Generic durable facts, identity, recovery, config | `layers/kernel` |
| Generic source contracts and machinery | `layers/sources` |
| Policy, arbitration, governance | `layers/foreman` |
| Leases, runnable work, retention | `layers/scheduler` |
| Durable effect boundary (commands, versions) | `layers/intent` |
| Generic workers, executors, concurrency | `layers/execution` |
| Mail-specific side effects and reconciliation | `layers/outbound` |
| Read-only query surfaces | `layers/observation` |
| Exchange/Graph ingestion, mail normalization | `verticals/mailbox` |
| Full-text search | `verticals/search` |
| Policy envelopes | `domains/charters` |

---

## Definition of Done

- [x] Incorrect `105` mappings are explicitly corrected
- [x] Intent and execution are separated from foreman
- [x] Facts are split into generic store vs vertical adapters
- [x] Mailbox persistence is split from generic persistence
- [x] Revised target taxonomy is ready for future migration work
