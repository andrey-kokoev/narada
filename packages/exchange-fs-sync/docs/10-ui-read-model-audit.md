# Control Plane UI Read-Model Audit

> **Invariant**: UI must be projection, not authority.  
> The operator console may only read from durable stores through derived observability queries.  
> No UI action may write directly into `work_items`, `work_item_leases`, `execution_attempts`, `outbound_commands`, or `intents`.

---

## 1. Current Read Surfaces

### 1.1 Facts
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `FactStore.getById` | **Authoritative durable** | `src/facts/store.ts` | Single fact lookup |
| `FactStore.getBySourceRecord` | **Authoritative durable** | `src/facts/store.ts` | Provenance lookup |
| `FactStore.getFactsForCursor` | **Authoritative durable** | `src/facts/store.ts` | Cursor-scoped batch |
| `FactStore.getUnadmittedFacts` | **Authoritative durable** | `src/facts/store.ts` | Facts pending admission |

**UI Gap**: No derived read model exists for fact timelines, fact-to-context grouping, or fact-type histograms. UI would need a `FactTimelineView` that groups facts by `context_id` and `source_cursor`.

### 1.2 Contexts
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `CoordinatorStore.getConversationRecord` | **Authoritative durable** | `src/coordinator/store.ts` | Mail-vertical metadata |
| `CoordinatorStore.getLatestRevisionOrdinal` | **Authoritative durable** | `src/coordinator/store.ts` | Revision tracking |
| `ForemanFacade.onContextsAdmitted` input (`PolicyContext[]`) | **Derived (ephemeral)** | `src/foreman/context.ts` | Formed at runtime from facts |

**UI Gap**: No persisted context index exists outside the mail-vertical `conversation_records` table. A generic `context_records` table (or view) does not yet exist for timer/webhook/fs contexts.

### 1.3 Work Items
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `CoordinatorStore.getWorkItem` | **Authoritative durable** | `src/coordinator/store.ts` | Single item |
| `CoordinatorStore.getActiveWorkItemForContext` | **Authoritative durable** | `src/coordinator/store.ts` | Context-scoped active item |
| `CoordinatorStore.getLatestWorkItemForContext` | **Authoritative durable** | `src/coordinator/store.ts` | Latest item by context |
| `getActiveWorkItems` | **Derived read model** | `src/observability/queries.ts` | Top 50 active |
| `getRecentFailedWorkItems` | **Derived read model** | `src/observability/queries.ts` | Top 50 failed |
| `getWorkItemsAwaitingRetry` | **Derived read model** | `src/observability/queries.ts` | Retry-ready items |

### 1.4 Leases
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `CoordinatorStore.getActiveLeaseForWorkItem` | **Authoritative durable** | `src/coordinator/store.ts` | Single lease |
| `CoordinatorStore.recoverStaleLeases` | **Authoritative durable** | `src/coordinator/store.ts` | Recovery scan |

**UI Gap**: No derived query exposes a lease timeline or current lease holder dashboard. UI would benefit from `getLeasesForWorkItem(workItemId)` and `getExpiredLeases()`.

### 1.5 Evaluations
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `CoordinatorStore.getEvaluationByExecutionId` | **Authoritative durable** | `src/coordinator/store.ts` | Single evaluation |
| `CoordinatorStore.getEvaluationsByWorkItem` | **Authoritative durable** | `src/coordinator/store.ts` | Work-item history |
| `getRecentSessionsAndExecutions` | **Derived read model** | `src/observability/queries.ts` | Execution list (does not surface evaluation content) |

**UI Gap**: No derived query surfaces evaluation content (summary, classifications, proposed actions) for the UI. A read model such as `getEvaluationsForContext(contextId, scopeId)` is needed.

### 1.6 Intents
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `IntentStore.getById` | **Authoritative durable** | `src/intent/store.ts` | Single intent |
| `IntentStore.getByIdempotencyKey` | **Authoritative durable** | `src/intent/store.ts` | Idempotency lookup |
| `IntentStore.getPendingIntents` | **Authoritative durable** | `src/intent/store.ts` | Pending by family |
| `getIntentSummaries` | **Derived read model** | `src/observability/queries.ts` | Pending / executing / failed_terminal aggregates |

### 1.7 Executions
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `CoordinatorStore.getExecutionAttempt` | **Authoritative durable** | `src/coordinator/store.ts` | Single attempt |
| `CoordinatorStore.getExecutionAttemptsByWorkItem` | **Authoritative durable** | `src/coordinator/store.ts` | Work-item history |
| `ProcessExecutionStore.getById` | **Authoritative durable** | `src/executors/store.ts` | Process execution |
| `ProcessExecutionStore.getByIntentId` | **Authoritative durable** | `src/executors/store.ts` | Latest by intent |
| `getProcessExecutionSummaries` | **Derived read model** | `src/observability/queries.ts` | Active / recent / failed aggregates |
| `getRecentSessionsAndExecutions` | **Derived read model** | `src/observability/queries.ts` | Charter execution list |

### 1.8 Confirmations
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `OutboundStore.getCommandStatus` | **Authoritative durable** | `src/outbound/store.ts` | Command status |
| `OutboundStore.getLatestVersion` | **Authoritative durable** | `src/outbound/store.ts` | Version lookup |
| `getRecentOutboundCommands` | **Derived read model** | `src/observability/queries.ts` | Top 50 commands |
| `buildMailboxDispatchSummary` | **Derived read model** | `src/observability/queries.ts` | Pending outbound count |

**UI Gap**: No unified confirmation view exists across mail (`outbound_commands`) and process (`process_executions.confirmation_status`). A cross-family `ConfirmationSummary` read model is missing.

### 1.9 Worker Status
| Surface | Type | Location | Notes |
|---------|------|----------|-------|
| `WorkerRegistry.listWorkers` | **Authoritative registry** | `src/workers/registry.ts` | Static identity list |
| `WorkerRegistry.isRunning` | **Derived (in-memory)** | `src/workers/registry.ts` | Runtime flight status |
| `getWorkerStatuses` | **Derived read model** | `src/observability/queries.ts` | Combines registry + durable state |

---

## 2. Classification Legend

- **Authoritative durable** — SQLite tables that are the source of truth. UI may read these only through store interfaces or observability wrappers.
- **Derived read model** — Explicitly read-only queries in `src/observability/`. Safe for UI consumption.
- **Derived (in-memory)** — Ephemeral runtime state (e.g., `WorkerRegistry.inFlight`). Accurate only while the daemon is running; not durable.
- **Forbidden for UI authority** — UI must never write here, and must not treat these as mutable state surfaces.

---

## 3. Missing Derived Read Models (Explicit Gaps)

| Gap | Why Needed | Proposed Location |
|-----|------------|-------------------|
| **Fact timeline view** | UI needs to show what facts led to a context/work item | `src/observability/queries.ts` |
| **Context index (generic)** | Timer/webhook/fs contexts have no durable index | `src/coordinator/store.ts` schema + `src/observability/queries.ts` |
| **Lease dashboard** | Operators need to see who holds leases and which are stale | `src/observability/queries.ts` |
| **Evaluation content view** | UI needs to display charter output summaries | `src/observability/queries.ts` |
| **Unified confirmation summary** | Cross-vertical view of submitted vs confirmed effects | `src/observability/queries.ts` |
| **Decision audit trail** | UI needs to show why an intent was created | `src/observability/queries.ts` |
| **Scope-level aggregate snapshot** | Current snapshot is mailbox-scoped; needs generic `scope_id` filter | `src/observability/queries.ts` |

---

## 4. UI Authority Rules

1. **Read paths**: UI may call `ObservationPlane.snapshot()`, individual `src/observability/queries.ts` functions, or store `get*` methods that are explicitly read-only.
2. **Write paths**: All UI-initiated mutations must go through dedicated **operator-action handlers** (future `src/operator-actions/`) that validate, audit-log, and then call the correct authority layer (Scheduler, Foreman, Executor).
3. **Forbidden tables**: UI code must never execute `insert`, `update`, or `delete` directly against:
   - `work_items`
   - `work_item_leases`
   - `execution_attempts`
   - `evaluations`
   - `foreman_decisions`
   - `outbound_commands` / `outbound_versions` / `managed_drafts`
   - `intents`
   - `facts` (except through the `FactStore.ingest` boundary)
   - `process_executions` (except through `ProcessExecutionStore` write methods)

---

## 5. See Also

- [`00-kernel.md`](00-kernel.md) — Observation non-authority invariant
- [`02-architecture.md`](02-architecture.md) — Authority boundaries
- [`src/observability/queries.ts`](../../src/observability/queries.ts) — Existing derived queries
- [`src/observability/types.ts`](../../src/observability/types.ts) — Read-model type definitions
