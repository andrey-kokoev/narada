# Operator Console / Site Registry Boundary Contract

> Defines what the Operator Console and Site Registry may do, must not do, and which boundaries downstream tasks (380–383) must preserve when implementing registry storage, health aggregation, control request routing, and CLI surfaces.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
>
> This contract governs Tasks 379–383. No console or registry implementation work may proceed before this contract is referenced.

---

## 1. Boundary Contract Meaning

**Boundary contract** means explicit authority rules, invariants, and in-scope/out-of-scope boundaries that prevent the console/registry from becoming hidden authority over Site state.

The distinction:

| Console/Registry is | Console/Registry is not |
|---------------------|------------------------|
| An operator-facing surface that aggregates observation | An Aim — it does not pursue a telos |
| A registry that routes audited control requests | A Site — it has no substrate, runner, or state store |
| Advisory and caching — safe to delete and rebuild | A control plane — it does not open work items or create decisions |
| Read-only aggregation + audited routing | A fleet manager — it does not orchestrate Cycles |

**This chapter targets the console/registry boundary, not a generic Site abstraction.**

---

## 2. Scope

### In Scope (Tasks 380–383)

| # | Task | Scope |
|---|------|-------|
| 379 | Boundary contract | This document |
| 380 | Site Registry Storage & Discovery | Filesystem scanning, registry schema, metadata persistence |
| 381 | Cross-Site Health & Attention Queue | Aggregate health, attention queue derivation, notification routing |
| 382 | Control Request Router & Audit | Router implementation, audit logging, Site-owned endpoint delegation |
| 383 | CLI Surface | `narada sites`, `narada console` commands; optional local UI scope |
| 384 | Chapter closure | Review, residuals, CCC posture, next-work recommendations |

### Out of Scope

- **Direct Site-state mutation** — The registry never reads/writes Site coordinator SQLite, config, cursor, apply-log, or health directly.
- **Work item lifecycle** — The registry never opens work items, creates decisions, claims or releases leases.
- **Outbound command authority** — The registry never creates, approves, or executes outbound commands.
- **Cycle execution** — The registry never runs Cycles or invokes effect workers.
- **Generic Site abstraction** — All types and discovery paths remain Windows-first (native + WSL). Cloudflare deferral is explicit.
- **Production deployment claim** — Deployment, credential rotation, and operational monitoring remain deferred.

---

## 3. No-Hidden-Authority Constraints

Downstream tasks must preserve the following constraints. No implementation task (380–383) may violate them.

### 3.1 Registry Is Inventory + Routing Only

The Site Registry is a durable inventory of discovered Sites plus a routing table for control requests. It is **not** a source of truth for any Site's durable state.

| Registry may hold | Registry must not hold |
|-------------------|------------------------|
| Site metadata (`site_id`, `variant`, `site_root`, `substrate`) | Site coordinator SQLite contents |
| Last-known health snapshot (cached, advisory) | Authoritative health state |
| Control endpoint routing URL/path | Site config, cursor, apply-log |
| Audit log of routed requests | Work items, decisions, outbound commands |
| Discovery path configuration | Scheduler leases or execution attempts |

If the registry is deleted, all Sites remain intact and can be rediscovered.

### 3.2 No Direct Site-State Mutation

The registry/console must never:

- Read or write a Site's coordinator SQLite directly
- Create, approve, or execute outbound commands
- Open work items or create foreman decisions
- Claim or release scheduler leases
- Mutate Site config, cursor, apply-log, or health records directly
- Run Cycles or invoke effect workers
- Bypass Site-owned operator action endpoints

If the console needs to mutate something, it routes an audited control request to the Site's own control surface and lets the Site handle it.

### 3.3 Observation Is Read-Only

All observation paths are GET-only. The console:

- Scans registry metadata to find Sites
- Calls each Site's observation API (e.g., `GET /status`, `GET /health`)
- Aggregates results into a unified view
- Never writes to Site stores

No observation endpoint may mutate. No control endpoint may be called from observation code.

### 3.4 Control Requests Are Audited and Routed

All mutation paths route through the Site's own control surface:

```
Operator → Console CLI/UI → Control Request Router → Site Control API → Site Coordinator
                                              ↓
                                       Audit log (registry)
```

The router:
1. Receives the operator's control request
2. Looks up the target Site's control endpoint from the registry
3. Forwards the request to the Site's control API
4. Logs the request to the registry audit log
5. Returns the Site's response to the operator

The console does NOT decide whether the action is valid. The Site's control API enforces all governance.

---

## 4. Observation / Control Separation

### 4.1 Endpoint Namespace Rules

| Namespace | Methods | Purpose | Authority |
|-----------|---------|---------|-----------|
| `/scopes/...` | `GET` only | Observation — health, status, facts, contexts, snapshots | None required (read-only) |
| `/control/scopes/.../actions` | `POST` only | Control — approved operator mutations | `execute` or `admin` |

**Rules:**
- No `POST`, `PUT`, `PATCH`, or `DELETE` may be registered under `/scopes/...`
- No `GET` may be registered under `/control/...`
- The action route must remain under `/control/scopes/:scope_id/actions`
- UI shell stays vertical-neutral: top-level nav must not contain mail-specific labels

### 4.2 Observation API Contract

The console calls Site observation APIs using these canonical endpoints:

| Endpoint | Method | Returns |
|----------|--------|---------|
| `GET /status` | `GET` | `getHealth()` + `getLastCycleTrace()` JSON |
| `GET /health` | `GET` | Site health record |
| `GET /scopes/:scope_id/overview` | `GET` | Control plane status snapshot |
| `GET /scopes/:scope_id/stuck-work-items` | `GET` | Work items needing attention |

All observation endpoints are read-only. The console aggregates these per-Site responses into a cross-Site view.

### 4.3 Control API Contract

The console routes control requests to Site control APIs using this canonical endpoint:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /control/scopes/:scope_id/actions` | `POST` | Execute approved operator action |

The Site's control API validates the action, applies governance, writes to `operator_action_requests`, and returns the result. The console only routes; it does not validate.

---

## 5. Control Request Envelope and Audit Log Schema

### 5.1 Control Request Envelope

```typescript
interface ConsoleControlRequest {
  /** Unique request ID for tracing */
  requestId: string;
  /** Target Site ID */
  siteId: string;
  /** Target scope within the Site (optional for site-level actions) */
  scopeId?: string;
  /** Action type — must match a Site-supported action */
  actionType: "approve" | "reject" | "retry" | "cancel" | "mark_reviewed" | "handled_externally";
  /** Target entity ID within the Site */
  targetId: string;
  /** Kind of target entity */
  targetKind: "work_item" | "outbound_command";
  /** Optional payload for action-specific parameters */
  payload?: Record<string, unknown>;
  /** ISO timestamp of request creation */
  requestedAt: string;
}
```

### 5.2 Router Audit Log Schema

```typescript
interface RouterAuditRecord {
  /** Matches ConsoleControlRequest.requestId */
  requestId: string;
  /** Target Site ID */
  siteId: string;
  /** Action type from the request */
  actionType: string;
  /** Target entity ID */
  targetId: string;
  /** ISO timestamp of routing */
  routedAt: string;
  /** Response from the Site's control API */
  siteResponseStatus: "accepted" | "rejected" | "error";
  /** Optional detail from Site response */
  siteResponseDetail?: string;
  /** Console operator identity (if authenticated) */
  requestedBy?: string;
}
```

The registry persists `RouterAuditRecord` rows in its own SQLite store. This is the console's audit trail, separate from each Site's `operator_action_requests` table.

### 5.3 Router Must Not

- Validate the action (the Site does)
- Mutate Site state directly
- Retry failed requests automatically
- Cache or assume success
- Fabricate responses

---

## 6. Mapping to AGENTS.md Invariants

| AGENTS.md Invariant | Console/Registry Preservation |
|---------------------|------------------------------|
| 19. Observation is read-only projection | Console observation is GET-only aggregation of Site APIs |
| 20. Control surface is explicitly separated | Console uses `/control/` namespace for POST, `/scopes/` for GET |
| 21. UI cannot become hidden authority | Console only mutates via audited routing to Site control APIs |
| 22. Observation API uses view types | Console consumes Site `*View` / `*OperatorView` interfaces |
| 23. All UI data sources are classified | Console marks aggregated data as `derived` or `advisory` |
| 24. No mailbox leakage into generic observation | Console generic types use `context_id`/`scope_id`, not `conversation_id` |
| 25. Observation queries are SELECT-only | Console registry queries use `.all()`, `.get()`, `.pluck()` only |
| 26. Control endpoints stay in `/control/` | Console routes all mutations through Site `/control/scopes/:id/actions` |
| 27. UI shell stays vertical-neutral | Console top-level nav uses generic labels ("Sites", "Health", "Attention") |
| 36–40. Advisory signals | Health cache, attention queue, and discovery metadata are all advisory |

---

## 7. Reuse Inventory

### 7.1 Existing Surfaces Reused

| Surface | Location | Reuse in Console/Registry |
|---------|----------|--------------------------|
| `ControlPlaneStatusSnapshot` | `packages/layers/control-plane/src/observability/` | Health aggregation per Site |
| `getHealth()` / `getLastCycleTrace()` | Site coordinator (Cloudflare DO, Windows SQLite) | Per-Site status query |
| `executeOperatorAction()` | `packages/layers/control-plane/src/operator-actions/executor.ts` | Delegated to by Site control API |
| `operator_action_requests` table | Site coordinator schema | Site-side audit; console has separate router audit |
| `narada status --site` | `packages/layers/cli/src/commands/status.ts` | Single-Site observation pattern |
| `narada doctor --site` | `packages/layers/cli/src/commands/doctor.ts` | Single-Site diagnostic pattern |
| `narada ops` | `packages/layers/cli/src/commands/ops.ts` | Operator action CLI pattern |
| `narada cycle --site` | `packages/layers/cli/src/commands/cycle.ts` | Single-Site cycle invocation |
| Observation routes (`/scopes/...`) | `packages/layers/daemon/src/observation/observation-routes.ts` | Route pattern and GET-only enforcement |
| Control routes (`/control/...`) | `packages/layers/daemon/src/observation/operator-action-routes.ts` | Route pattern and POST-only enforcement |

### 7.2 New Surfaces Created

| Surface | Purpose |
|---------|---------|
| `SiteRegistry` class | Durable inventory of discovered Sites |
| `SiteDiscovery` class | Filesystem scanning for Site markers |
| `ControlRequestRouter` class | Audited routing of control requests to Sites |
| `aggregateHealth` | Cross-Site health snapshot aggregation |
| `AttentionQueue` | Derived, read-only cross-Site attention view |
| `narada sites` command | List discovered Sites with health |
| `narada console` command | Launch operator console (CLI or local UI) |
| Registry SQLite schema | `site_registry`, `registry_audit_log` tables |

### 7.3 Deferrals

| Surface | Deferred To | Reason |
|---------|-------------|--------|
| Cloudflare Site discovery | Future chapter | Remote, not filesystem-discoverable; requires endpoint URLs and auth tokens |
| Generic `AbstractSite` interface | Future chapter | Would add abstraction before two substrates are proven |
| Web-based multi-Site UI | Future chapter | Requires HTTP server, auth, and session management beyond local CLI |
| Real-time notification push | Future chapter | Requires WebSocket or SSE infrastructure |

---

## 8. Console / Registry vs Kernel Control Plane

| Concern | Kernel Control Plane | Operator Console / Site Registry |
|---------|---------------------|----------------------------------|
| **Location** | Runs inside a Site | Runs outside all Sites |
| **Scope** | One Site | Multiple Sites |
| **Authority** | Creates work, decisions, outbounds | Observes and routes; does not create |
| **Mutation** | Direct writes to coordinator SQLite | Only via audited routing to Site APIs |
| **Lifecycle** | Participates in Cycle advancement | No Cycle involvement |
| **Required?** | Essential for Site function | Advisory; Sites work without it |
| **Storage** | Site-owned SQLite / DO | Registry-owned SQLite (separate file) |

---

## 9. Attention Queue Semantics

The **Attention Queue** is a derived, read-only view. It is computed by:

1. Querying each Site's observation API for items needing attention:
   - `failed_retryable` work items or outbound commands
   - `critical` or `auth_failed` health status
   - Stuck Cycles (recovered locks with high stuck duration)
2. Aggregating results into a cross-Site list
3. Sorting by severity and recency

Properties:
- **Derived**: Removing the attention queue does not affect any Site state
- **Read-only**: The queue is computed on demand, not stored as authoritative state
- **Advisory**: It guides operator attention, not runtime decisions

---

## 10. Mocked vs Live Evidence Rules

| Boundary | Test Evidence | Live Evidence |
|----------|--------------|---------------|
| Site discovery | Mock filesystem scan | Requires actual Windows filesystem |
| Health aggregation | Mock Site API responses | Requires running Site with health records |
| Control request routing | Mock Site control API | Requires running Site with control endpoint |
| Audit log persistence | In-memory SQLite | Requires registry SQLite file |
| Attention queue | Fixture data | Requires real Site state |

**Rule:** No test in Tasks 380–383 may require live Graph API calls, live email sends, or deployed infrastructure. All tests must pass in `vitest` with mocked boundaries.

---

## 11. Authority Boundaries Preserved from Prior Chapters

| Boundary | Preserved By |
|----------|-------------|
| Facts are durable boundary | Unchanged — console never touches facts |
| Context/work is separate from facts | Unchanged — console never touches work items |
| Evaluation is separate from decision | Unchanged — console never evaluates |
| Decision is separate from intent/handoff | Unchanged — console never creates decisions |
| Execution requires prior approval | Unchanged — console routes to Site which enforces |
| Execution success ≠ confirmation | Unchanged — console does not execute |
| Confirmation requires observation | Unchanged — console only observes |
| Operator mutation is audited | Console adds router audit; Site still has `operator_action_requests` |
| Observation is read-only | Console observation is GET-only aggregation |
| UI cannot become hidden authority | Console only mutates via audited routing |

---

## 12. Cross-References

| Document | Relationship |
|----------|-------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/product/operator-console-site-registry.md`](../product/operator-console-site-registry.md) | Design document — what the console is and how it works |
| [`docs/product/operator-loop.md`](../product/operator-loop.md) | The five-step operator rhythm the console supports |
| [`docs/deployment/windows-site-boundary-contract.md`](windows-site-boundary-contract.md) | Windows Site authority boundaries the console must respect |
| [`docs/deployment/windows-site-materialization.md`](windows-site-materialization.md) | Windows Site directory and substrate conventions |
| [`AGENTS.md`](../../AGENTS.md) | Observation read-only, control surface separation, and advisory signal invariants |

---

## 13. Task Reference

| Task | Contract Reference |
|------|-------------------|
| 379 | This document |
| 380 | §2 (scope), §3.1 (registry is inventory only), §7.2 (new surfaces) |
| 381 | §4.2 (observation API contract), §9 (attention queue semantics), §7.2 (health aggregator) |
| 382 | §4.3 (control API contract), §5 (envelope and audit schema), §3.4 (audited routing) |
| 383 | §7 (reuse inventory), §4.1 (endpoint namespace rules) |
| 384 | §3 (no-hidden-authority constraints), §10 (mocked vs live evidence) |
