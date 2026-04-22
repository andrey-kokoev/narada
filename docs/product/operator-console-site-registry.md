# Operator Console / Site Registry

> Design for an operator-facing surface that discovers, inspects, and routes control requests across multiple Narada Sites without becoming hidden authority.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. What the Operator Console Is

The **Operator Console** is the human-facing surface an operator uses to interact with one or more Narada Sites. It answers the five questions of the operator live loop (see [`operator-loop.md`](operator-loop.md)) across all discovered Sites:

1. Is it healthy? (cross-Site health aggregation)
2. What happened? (cross-Site recent activity)
3. What needs attention? (attention queue)
4. What draft or proposal exists? (pending outbound commands)
5. What should I do next? (suggested actions)

The console is **not**:
- An Aim — it does not pursue a telos; it observes Sites that do.
- A Site — it has no substrate bindings, no Cycle runner, no state store.
- A Vertical — it does not produce facts or consume source deltas.
- A Cycle — it does not advance an Aim.
- The kernel control plane — it does not open work items, create decisions, or execute effects.
- A distributed fleet manager — it does not orchestrate Cycles across Sites.

The console is an **operator surface** that aggregates read-only observation and routes audited control requests to Site-owned APIs.

---

## 2. What the Site Registry Owns

The **Site Registry** is the durable inventory of Sites known to the console. It owns:

| Concern | Ownership |
|---------|-----------|
| **Discovery paths** | Registry knows where to scan for Sites (`%LOCALAPPDATA%\Narada\`, `/var/lib/narada/`, `~/narada/`, etc.) |
| **Site metadata** | `site_id`, `variant` (native / WSL / cloudflare), `site_root`, `substrate`, `aim` summary, `last_seen_at` |
| **Last-known health** | Cached health snapshot from the most recent observation query |
| **Control endpoint routing** | URL or path to each Site's operator control surface |
| **Audit log of routed requests** | Every control request routed through the console is logged here |

The registry is **advisory and caching**. It does not hold authoritative Site state. If the registry is deleted, all Sites remain intact and can be rediscovered.

---

## 3. What the Site Registry Must Not Own

The registry must **never**:

- Read or write a Site's coordinator SQLite directly (no bypass of Site APIs)
- Create, approve, or execute outbound commands
- Open work items or create foreman decisions
- Claim or release scheduler leases
- Mutate Site config, cursor, apply-log, or health records directly
- Run Cycles or invoke effect workers
- Become the source of truth for any Site's durable state

If the console needs to mutate something, it routes an audited control request to the Site's own control surface and lets the Site handle it.

---

## 4. How It Preserves Site Authority

The console preserves Site authority through two mechanisms:

### 4.1 Read-Only Aggregation

All observation paths are read-only. The console:
- Scans registry metadata to find Sites
- Calls each Site's observation API (e.g., `GET /status`, `GET /health`, `GET /scopes/:scope_id/stuck-work-items`)
- Aggregates results into a unified view
- Never writes to Site stores

### 4.2 Audited Control Request Routing

All mutation paths route through the Site's own control surface:

```
Operator → Console CLI/UI → Control Request Router → Site Control API → Site Coordinator
                                              ↓
                                       Audit log (registry)
```

The router:
1. Receives the operator's control request (e.g., "approve outbound ob-001")
2. Looks up the target Site's control endpoint from the registry
3. Forwards the request to the Site's control API
4. Logs the request to the registry audit log
5. Returns the Site's response to the operator

The console does NOT decide whether the action is valid. The Site's control API enforces all governance.

---

## 5. How It Differs from the Kernel Control Plane

| Concern | Kernel Control Plane | Operator Console / Site Registry |
|---------|---------------------|----------------------------------|
| **Location** | Runs inside a Site | Runs outside all Sites |
| **Scope** | One Site | Multiple Sites |
| **Authority** | Creates work, decisions, outbounds | Observes and routes; does not create |
| **Mutation** | Direct writes to coordinator SQLite | Only via audited routing to Site APIs |
| **Lifecycle** | Participates in Cycle advancement | No Cycle involvement |
| **Required?** | Essential for Site function | Advisory; Sites work without it |

---

## 6. Substrate-Neutral Concept, Windows-First Implementation

### 6.1 Substrate-Neutral Concepts

The following are independent of substrate:

- **Site Registry schema** (metadata, health cache, audit log)
- **Discovery abstraction** ("scan these paths for Site markers")
- **Observation API contract** (health, status, stuck items)
- **Control request envelope** (action type, target ID, payload)
- **Attention queue derivation** (aggregate `failed_retryable`, `critical`, `pending` items)

### 6.2 Windows-First Implementation

The first implementation targets:

- **Native Windows** Sites (`%LOCALAPPDATA%\Narada\{site_id}`)
- **WSL** Sites (`/var/lib/narada/{site_id}` or `~/narada/{site_id}`)

It reuses existing Windows Site surfaces (`narada status --site`, `narada doctor --site`, `narada ops`) and extends them with multi-Site discovery.

### 6.3 Cloudflare Deferral

Cloudflare Sites are not in the first implementation because:
- They are remote, not local filesystem-discoverable
- Their control surface is HTTP-based and requires auth tokens
- The console would need to know endpoint URLs and credentials

A future extension could add Cloudflare Sites by:
- Registering endpoint URLs in the registry
- Binding Cloudflare admin tokens for control routing
- Using the same observation API contract over HTTPS

---

## 7. Attention Queue Semantics

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

## 8. Control Request Router Semantics

The **Control Request Router** is the mutation boundary of the console. It:

1. Receives a canonical control request:
   ```typescript
   interface ConsoleControlRequest {
     requestId: string;
     siteId: string;
     scopeId?: string;
     actionType: "approve" | "reject" | "retry" | "cancel";
     targetId: string;
     targetKind: "work_item" | "outbound_command";
     payload?: Record<string, unknown>;
     requestedAt: string;
   }
   ```

2. Looks up the Site's control endpoint from the registry
3. Transforms the request into the Site's native control format
4. Forwards to the Site's control API
5. Logs the routing event:
   ```typescript
   interface RouterAuditRecord {
     requestId: string;
     siteId: string;
     actionType: string;
     targetId: string;
     routedAt: string;
     siteResponseStatus: "accepted" | "rejected" | "error";
     siteResponseDetail?: string;
   }
   ```

The router does NOT:
- Validate the action (the Site does)
- Mutate Site state directly
- Retry failed requests automatically
- Cache or assume success

---

## 9. Vocabulary Alignment

| Console/Registry Term | SEMANTICS.md §2.14 Reading |
|-----------------------|---------------------------|
| Site Registry | Durable inventory / Trace of discovered Sites |
| Attention Queue | Derived observation / advisory signal |
| Control Request Router | Audited routing layer; each routed request is a Trace |
| Operator Console | Human-facing surface; not an Aim, Site, or Cycle |
| Health aggregation | Read-only projection of per-Site advisory signals |

---

## 10. Cross-References

| Document | Relationship |
|----------|-------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical Aim / Site / Cycle / Act / Trace definitions |
| [`docs/product/operator-loop.md`](operator-loop.md) | The five-step operator rhythm the console supports |
| [`docs/product/unattended-operation-layer.md`](unattended-operation-layer.md) | Health, notification, and stuck-cycle semantics |
| [`docs/deployment/windows-site-boundary-contract.md`](../deployment/windows-site-boundary-contract.md) | Windows Site authority boundaries the console must respect |
| [`docs/deployment/windows-site-materialization.md`](../deployment/windows-site-materialization.md) | Windows Site directory and substrate conventions |
| [`AGENTS.md`](../../AGENTS.md) | Observation read-only and control surface separation invariants |
