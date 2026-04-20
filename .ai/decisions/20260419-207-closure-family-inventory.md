# Closure Family Inventory

> Task 207 deliverable: disciplined inventory of the five operator families against existing Narada surfaces.

## Family Basis

The near-closed operator basis for Narada:

1. `selection`
2. `inspection`
3. `re-derivation`
4. `promotion`
5. `authority execution`

## Inventory Method

For each family we checked:

- CLI surfaces (`packages/layers/cli/src/commands/`, `packages/ops-kit/src/commands/`)
- Daemon/operator surfaces (`packages/layers/daemon/src/observation/`, `packages/layers/daemon/src/ui/`)
- Observation surfaces (`packages/layers/control-plane/src/observability/`)
- Control-plane APIs/types (`src/scheduler/`, `src/foreman/`, `src/coordinator/`, `src/outbound/`, `src/executors/`, `src/facts/`)
- Documented semantics (`SEMANTICS.md`, `00-kernel.md`, `AGENTS.md`)

---

## 1. Re-Derivation

### Existing Surfaces

| Surface | Location | Family Member |
|---------|----------|---------------|
| `SEMANTICS.md §2.8` | root | Canonical operator algebra with 6 members |
| `00-kernel.md §8` | `packages/layers/control-plane/docs/` | Kernel invariants for re-derivation |
| `narada derive-work` | `packages/layers/cli/src/commands/derive-work.ts` | Replay derivation (Task 201) |
| `rebuild_views` action | `packages/layers/daemon/src/observation/operator-actions.ts` | Projection rebuild |
| `DefaultForemanFacade.deriveWorkFromStoredFacts()` | `src/foreman/facade.ts` | Replay derivation implementation |
| `recoverStaleLeases` | `src/scheduler/scheduler.ts` | Mechanical recovery |
| `recoverStaleExecutions` | `src/executors/process-executor.ts` | Mechanical recovery |
| `ConfirmationResolver.resolve()` | `src/executors/confirmation.ts` | Confirmation replay (partial) |

### Gaps

- **Preview derivation** (Task 203): defined in docs, no implementation.
- **Recovery derivation** (Task 204): defined in docs, no implementation.
- **Confirmation replay** (Task 205): defined in docs, only mail-reconciler fragments exist.
- **Projection rebuild** (Task 206): `rebuild-views` CLI exists but not unified as a first-class family member.

### Classification

All gaps are already tracked by Tasks 201–206. No new re-derivation tasks needed.

---

## 2. Authority Execution

### Existing Surfaces

| Surface | Location | What It Provides |
|---------|----------|------------------|
| `SEMANTICS.md §2.7` | root | Seven authority classes (`derive`, `propose`, `claim`, `execute`, `resolve`, `confirm`, `admin`) |
| `00-kernel.md §6` | docs | Authority boundaries (foreman, scheduler, handoffs, workers) |
| `AGENTS.md` invariants 6–18 | root | Runtime enforcement of ownership boundaries |
| `CharterRunner.run()` | `src/charter/runner.ts` | Sandbox execution interface |
| `SendReplyWorker` | `src/outbound/send-reply-worker.ts` | Graph API draft/send authority |
| `NonSendWorker` | `src/outbound/non-send-worker.ts` | Graph API mutation authority |
| `ProcessExecutor` | `src/executors/process-executor.ts` | Subprocess spawn authority |
| `DefaultSyncRunner` | `src/runner/sync-once.ts` | Inbound sync authority |

### Gaps

- Not framed as an explicit **operator family** with members, algebra, or modes.
- However, authority *classes* and *boundaries* are comprehensively defined and enforced in code.

### Classification

`present but undernamed / undocumented` at the family level, but functionally complete. No concrete closure gap that would produce a new task.

---

## 3. Selection

### Existing Surfaces

| Surface | Location | Selection Mechanism |
|---------|----------|---------------------|
| `narada derive-work` | `derive-work.ts` | `--scope`, `--context-id`, `--since`, `--fact-ids` |
| `FactStore.getFactsByScope()` | `src/facts/types.ts` | `{ contextId, since, factIds, limit }` |
| `GET /work-items?status=` | observation routes | `active` / `failed` / `awaiting_retry` |
| `GET /*?limit=N` | observation routes | Result-set bound (default 50, max 1000) |
| `narada restore --select <id> --before <date>` | `restore.ts` | Backup restoration selector |
| `scanForRunnableWork(scopeId?, limit?)` | `src/scheduler/scheduler.ts` | Scheduler work selection |
| `fetchNextEligible(scopeId?)` | `src/outbound/store.ts` | Outbound command selection |

### Gaps

- **No canonical family definition** in `SEMANTICS.md` or `00-kernel.md`.
- **No unified selection algebra**: every consumer reinvents bounds (derive-work uses one shape, observation routes another, scheduler another).
- **No generic `select` surface**: operators cannot express a common query grammar across facts, contexts, work items, or executions.
- Selection bounds for preview, recovery, and confirmation replay (Tasks 203–205) are unspecified; each will likely invent its own.

### Classification

`missing and required for closure`. Selection is the lens through which all other families operate. Without a unified algebra, every new operator family will fragment its bounding vocabulary.

---

## 4. Inspection

### Existing Surfaces

| Surface | Location | What It Provides |
|---------|----------|------------------|
| `ops-kit inspect <operation>` | `packages/ops-kit/src/commands/inspect.ts` | Operation config scope summary |
| `ops-kit explain <operation>` | `packages/ops-kit/src/commands/explain.ts` | Readiness, blockers, consequences |
| `narada status` | `packages/layers/cli/src/commands/status.ts` | Sync health, control-plane snapshot |
| `narada integrity` | `packages/layers/cli/src/commands/integrity.ts` | Data integrity checks |
| `narada demo` | `packages/layers/cli/src/commands/demo.ts` | Zero-setup read-only preview |
| `ObservationPlane` (23 GET endpoints) | `packages/layers/daemon/src/observability/` | Full read-only derived views |
| `CoordinatorStoreView` | `src/coordinator/types.ts` | Read-only store interface |
| `FactStoreView` | `src/facts/types.ts` | Read-only fact interface |
| `OutboundStoreView` | `src/outbound/types.ts` | Read-only outbound interface |
| Source-trust classification | `src/observability/types.ts` | `authoritative` / `derived` / `decorative` |

### Gaps

- **Not framed as an operator family** in canonical docs.
- Boundary with **preview derivation** (Task 203, re-derivation family) is implicit: preview derivation is read-only inspection of charter output from facts, but it is classified under re-derivation because it derives from a durable boundary.
- No explicit **inspection algebra** (what can be inspected, by whom, with what authority).

### Classification

`present but undernamed / undocumented`. The surfaces are extensive and functional. The gap is canonical documentation and family taxonomy alignment.

---

## 5. Promotion

### Existing Surfaces

| Surface | Location | What It Provides |
|---------|----------|------------------|
| `narada activate <operation>` | `packages/ops-kit/src/commands/activate.ts` | Mark operation as live |
| `narada want-posture <target> <preset>` | `packages/ops-kit/src/commands/want-posture.ts` | Escalate/descalate safety posture |
| `retry_work_item` action | `operator-actions.ts` | Clear `next_retry_at` on failed item |
| `acknowledge_alert` action | `operator-actions.ts` | Force terminal + log operator override |
| `trigger_sync` action | `operator-actions.ts` | Request manual wake |
| `request_redispatch` action | `operator-actions.ts` | Trigger full dispatch pipeline |
| Config loader auto-promotion | `src/config/load.ts` | Legacy single-scope → `ScopeConfig` |

### Gaps

- **No canonical family definition** in `SEMANTICS.md` or `00-kernel.md`.
- **No explicit preview → governed-work path**: preview derivation (Task 203) produces an evaluation, but there is no surfaced operator action to promote that evaluation into a real `foreman_decision` / `work_item`.
- **No explicit manual draft → send path**: operators can observe outbound commands in `draft_ready`, but there is no promoted action to manually advance them to `submitted`.
- **No unified promotion algebra**: existing actions are implementation-shaped (one per ad-hoc need), not family-shaped.
- **No bulk promotion surfaces**: operators must act one work-item or one scope at a time.

### Classification

`missing and required for closure`. Promotion is the bridge between inspection/preview and actual system mutation. Without explicit promotion surfaces, operators lack disciplined lifecycle advancement.

---

## Summary Table

| Family | Docs | Task Decomposition | Code | Classification | Produces Task? |
|--------|------|-------------------|------|----------------|----------------|
| Re-derivation | ✅ Defined | ✅ Tasks 201–206 | ⚠️ Partial | Tracked | No |
| Authority execution | ⚠️ Classes defined | ❌ None | ✅ Enforced | Functionally complete | No |
| Selection | ❌ Not defined | ❌ None | ⚠️ Fragmented | Missing | **Yes** |
| Inspection | ❌ Not defined | ❌ None | ✅ Extensive | Under-documented | **Yes** |
| Promotion | ❌ Not defined | ❌ None | ⚠️ Ad-hoc | Missing | **Yes** |

---

## Recommended Follow-Up Task Set

| Task | Family | Gap |
|------|--------|-----|
| **208** | selection | No canonical definition, no unified algebra, fragmented bounds across CLI/observation/scheduler |
| **209** | promotion | No canonical definition, no preview→work path, no unified promotion algebra, ad-hoc actions only |
| **210** | inspection | Not framed as operator family in canonical docs; boundary with preview derivation implicit |
