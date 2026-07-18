# Operator Console / Site Registry

> Design for an operator-facing surface that discovers, inspects, and routes control requests across multiple Narada Sites without becoming hidden authority.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
> For the factorization of Site authority object, realization, projection, interface, and crossing, see [`site-factorization.md`](site-factorization.md).

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

The console is an **operator surface** that aggregates read-only observation and routes audited control requests to Site-owned APIs. Registry management is a separate User Site read-model operation defined in section 3.1.

For the normal local Workspace entry point, route-directory failure states, and
operator recovery, see [`operator-console-runbook.md`](operator-console-runbook.md).
The route authority, fallback, and retry target is defined in
[`operator-workspace-target.md`](../architecture/operator-workspace-target.md).

---

## 2. What the Site Registry Owns

The **Site Registry** is a projection and routing inventory of Sites known to the console. It owns:

| Concern | Ownership |
|---------|-----------|
| **Discovery paths** | Registry knows where to scan for Sites (`%LOCALAPPDATA%\Narada\`, `/var/lib/narada/`, `~/.local/share/narada/`, `~/narada/`, etc.) |
| **Site metadata** | `site_id`, `variant` (native / WSL / linux-user / linux-system / cloudflare), `site_root`, `substrate`, `aim` summary, `last_seen_at` |
| **Last-known health** | Cached health snapshot from the most recent observation query |
| **Control endpoint routing** | URL or path to each Site's operator control surface |
| **Audit log of routed requests** | Every control request routed through the console is logged here |
| **Registry management history** | Add, edit, retire, restore, and purge operations are recorded with actor, reason, and before/after projection |

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

If the console needs to mutate Site-owned state, it routes an audited control request to the Site's own control surface and lets the Site handle it. Registry read-model mutations follow the separate management contract in section 3.1.

---

## 3.1 Registry Management Target Shape

The operator needs to manage the registry itself, but registry management is a
User Site read-model operation. It must not create, edit, or delete Site-owned
files, coordinator state, configuration, or authority.

This is the canonical contract. The existing `narada sites discover` and
`remove` commands are transitional compatibility paths and delegate to this
namespace rather than maintain a second registry behavior. `narada sites list`
remains a read/health view, not a second registry mutation surface.

### Explicit command boundary

The target command namespace is:

```text
narada sites registry list
narada sites registry show <site-id-or-alias>
narada sites registry discover --dry-run [--source <source>] [--root <path>]
narada sites registry discover --apply [--source <source>] [--root <path>]
narada sites registry add --site-id <site-id> --root <path> [metadata options]
narada sites registry edit <site-id-or-alias> [patch options]
narada sites registry retire <site-id-or-alias> --reason <reason>
narada sites registry restore <site-id-or-alias> --reason <reason>
narada sites registry purge <site-id-or-alias> --confirm-site-id <site-id>
```

`sites create` and `sites init` remain Site materialization commands. `registry
add` records an already-existing Site in the User Site catalog; it does not
bootstrap the Site. `registry discover` is the bounded bulk reconciliation
operation. It must never mutate records in dry-run mode.

Every mutating command has an explicit `--dry-run` or `--apply` mode; apply is
never implicit. `add` must identify its source, and `edit`, `retire`,
`restore`, and `purge` require a reason. `purge` additionally requires the
canonical Site ID confirmation shown in its preview. A dry-run result is the operator's
preview; applying the same request must revalidate its revision and conflicts.

Adding a retired record is refused unless the operator explicitly uses
`--re-admit` with a reason. Discovery never uses that override; it reports the
retired source for operator action.

"Delete" is intentionally split into two operations:

- **Retire** removes a Site from the active catalog while preserving a
  tombstone, reason, provenance, and audit history. A later discovery must not
  silently resurrect a retired record; it reports the source as an advisory
  until the operator restores or explicitly re-admits it.
- **Purge** permanently removes registry metadata only. It requires explicit
  confirmation, is blocked when protected references exist, and never deletes
  the Site root.

The transitional `sites remove` command should converge on `retire`, not on
hard deletion.

### Registry record shape

The active read model must expose enough information for an operator to decide
what to do without opening the database:

| Field | Meaning |
| --- | --- |
| `site_id` | Canonical stable identity. |
| `site_root` or `control_endpoint` | Where the Site is reached. |
| `variant` / `substrate` | Declared realization and platform. |
| `sources` | One or more admitted source observations, each with a source kind and bounded reference. |
| `aliases` | Non-canonical launch or legacy identities. |
| `lifecycle_status` | `active` or `retired`; controls active catalog membership. |
| `observation_status` | `unverified`, `present`, `stale`, `missing`, or `conflicted`; describes evidence, not lifecycle. |
| `freshness` | Last discovery, validation, and health observation times. |
| `health` | Last-known health posture and diagnostics. |
| `revision` | Monotonic record revision for optimistic concurrency. |
| `created_at` / `updated_at` | Registry record history bounds. |
| `retired_at` / `retire_reason` | Tombstone data when retired. |

No registry record contains raw credentials, coordinator state, task lifecycle
rows, or private Site payloads.

### Mutation invariants

Every management operation must:

1. reject a canonical Site ID that points to a different root without an
   explicit conflict-resolution operation;
2. reject a root that is already owned by another canonical Site instead of
   silently creating a second identity;
3. preserve aliases as aliases rather than replacing canonical identity;
4. be idempotent when the requested state is already present;
5. use a single registry transaction for the record change and its audit event;
6. return the before/after projection, conflicts, and an audit reference; and
7. leave Site-owned state untouched.

`edit` is a patch operation. Changing `site_id` is not an ordinary edit; it is
an explicit identity migration with a conflict preview and a separate audit
record. Changing a root likewise requires an explicit preview because it can
change which Site the operator reaches.

### Operator interaction contract

The normal workflow is:

1. `list` gives a compact table of canonical ID, root, lifecycle status,
   observation status, provenance, last seen, and aliases.
2. `show` gives the complete record, provenance, freshness, conflicts, and
   permitted next actions.
3. `add`, `edit`, `retire`, `restore`, and `purge` first produce a bounded
   operation preview; mutation requires an explicit apply/confirmation step.
4. Every refusal states the violated invariant and the next admissible action.

Human output is one human rendering only. JSON output is one structured result
only, including errors. The common result envelope contains at least
`status`, `operation`, `mutation_performed`, `registry_path`,
`catalog_source`, `changes`, `conflicts`, and `audit_ref`.

`discover --dry-run` must summarize `added`, `updated`, `unchanged`,
`ignored`, `retired-source-present`, and `conflicted` entries before any apply
step. This makes bulk discovery inspectable rather than an implicit mutation.

### Browser relationship

The browser operator console is a presentation and confirmation client for the
same registry-management contract. Its loopback `/console/registry` page consumes
only the `/console/registry/api/*` read-model routes, which return the same
`narada.site_registry.management.v0` envelopes as the Site Lifecycle MCP command
adapter. It must not write SQLite directly or invent
browser-only CRUD semantics. A browser mutation must show the same preview,
impact, conflict, confirmation, and audit information as the CLI. The browser
may default to read-only views, but any future mutation control must use the
same plan/apply boundary.

## 4. How It Preserves Site Authority

The console preserves Site authority through two mechanisms:

### 4.1 Read-Only Aggregation

All observation paths are read-only. The console:
- Scans registry metadata to find Sites
- Calls each Site's observation API (e.g., `GET /status`, `GET /health`, `GET /scopes/:scope_id/stuck-work-items`)
- Aggregates results into a unified view
- Never writes to Site stores

### 4.2 Audited Control Request Routing

All mutations of Site-owned state route through the Site's own control surface:

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
| **Site-state mutation** | Direct writes to coordinator SQLite | Via audited routing to Site APIs; registry CRUD follows section 3.1 |
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

- **Native Windows user-locus** Site (`%USERPROFILE%\Narada`)
- **Native Windows PC-locus** Sites (`%ProgramData%\Narada\sites\pc\{site_id}`)
- Legacy **Native Windows** Sites (`%LOCALAPPDATA%\Narada\{site_id}`)
- **WSL** Sites (`/var/lib/narada/{site_id}` or `~/narada/{site_id}`)
- **Linux user-mode** Sites (`~/.local/share/narada/{site_id}` or `$XDG_DATA_HOME/narada/{site_id}`)
- **Linux system-mode** Sites (`/var/lib/narada/{site_id}`)

It reuses existing Windows Site surfaces (`narada status --site`, `narada doctor --site`, `narada ops`) and extends them with multi-Site discovery. Linux Sites use the same substrate-neutral adapter interface with local SQLite observation. Linux Sites use the same substrate-neutral adapter interface with local SQLite observation.

### 6.3 Cloudflare Deferral

Cloudflare Sites are not in the first implementation because:
- They are remote, not local filesystem-discoverable
- Their control surface is HTTP-based and requires auth tokens
- The console would need to know endpoint URLs and credentials

Cloudflare Sites were added in Task 483 via the substrate-neutral adapter interface. Linux Sites were added in Task 484.

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

Registry add, edit, retire, restore, and purge operations are not Site-state
control requests. They mutate only the User Site registry read model and must
follow the preview, confirmation, conflict, and audit rules in section 3.1.

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

## 10. Live Support Status

As of Task 482, the Operator Console has live binding for **Windows Sites**.
As of Task 483, it adds live binding for **Cloudflare Sites** via a substrate-neutral adapter interface.

### Substrate-Neutral Adapter Interface

The console uses a `ConsoleSiteAdapter` interface (defined in `@narada2/windows-site`) that each substrate package implements:

```typescript
interface ConsoleSiteAdapter {
  supports(site: RegisteredSite): boolean;
  createObservationApi(site: RegisteredSite): SiteObservationApi;
  createControlClient(site: RegisteredSite): SiteControlClient;
}
```

Adapters:
- **`windowsSiteAdapter`** (`@narada2/windows-site`) — opens local SQLite, calls `executeOperatorAction`.
- **`linuxSiteAdapter`** (`@narada2/linux-site`) — opens local SQLite for observation; control returns explicit unsupported errors (v0 Linux Sites do not yet implement operator actions).
- **`cloudflareSiteAdapter`** (`@narada2/cloudflare-site`) — calls remote Worker HTTP endpoints (`GET /status`, `POST /control/actions`) with Bearer token auth.

The CLI selects the first adapter whose `supports()` returns true for a registered site.

### Windows Sites

- **`narada console status`** aggregates real health across all registered Windows Sites.
- **`narada console attention`** derives pending/stuck items from real Site coordinator state:
  - stuck work items (`failed_retryable`, old `leased`, old `executing`);
  - pending outbound commands (`pending`, `draft_creating`, `sending`);
  - pending drafts (`draft_ready`);
  - credential requirements derived from `auth_failed` health status.
- **`narada console approve/reject/retry`** routes through a live `WindowsSiteControlClient` that opens the Site's coordinator SQLite and delegates to `executeOperatorAction`.

### WSL Bridge Semantics

WSL Sites are a distinct variant from native Windows Sites:

- **Console inside WSL**: WSL Sites are treated as POSIX-local. The Windows adapter uses POSIX paths (`/var/lib/narada/...`) and works normally.
- **Console on native Windows targeting a WSL Site**: If the Site root is not a Windows-accessible WSL path (e.g., `\\wsl$\...`), observation returns an `error` health status with a bridge-required message, and control returns an explicit `error` detail. Run the console inside the target WSL distro, or register the Site with a `\\wsl$\` path.
- The console does **not** silently use invalid POSIX paths on native Windows.

### Linux Sites

- **`narada console status`** aggregates real health across registered Linux Sites from `site_health` table.
- **`narada console attention`** returns credential requirements when health is `auth_failed`. Stuck work items, pending outbounds, and pending drafts return empty arrays because v0 Linux Sites do not yet have control-plane work tables.
- **`narada console approve/reject/retry`** routes through `LinuxSiteControlClient` which returns an explicit unsupported error. Linux v0 Sites do not yet implement operator actions.
- **System-mode authorization**: If the current user cannot read `/var/lib/narada/{site_id}`, the control client returns an explicit authorization error. Observation returns an `error` health status.

### Cloudflare Sites

- **`narada console status`** calls `GET {control_endpoint}/status?site_id=...` and maps the response into the console health shape.
- **`narada console attention`** returns health-based attention items. Stuck work items, pending outbounds, and pending drafts are not yet exposed by the Cloudflare Worker and return empty arrays.
- **`narada console approve/reject/retry`** routes through `CloudflareSiteControlClient` which calls `POST {control_endpoint}/control/actions`.
- **Credential resolution**: the admin token is read from `NARADA_CLOUDFLARE_TOKEN_{SITE_ID}` (uppercase, hyphens replaced with underscores). No raw tokens are stored in the registry.

### Unsupported Sites

Sites with an unsupported substrate return an informative `error` health status and empty observation arrays. Control requests return `No control client available`.

The console remains:
- **Not a fleet orchestrator** — it observes and routes; it does not schedule or trigger Cycles.
- **Advisory** — the Site Registry is inventory + routing only; deleting it does not affect any Site.
- **Mutation-routed** — all mutations go through Site-owned control surfaces and are audited in both the registry router audit log and the Site's `operator_action_requests`.

## 11. Registry Locations

The Site Registry database is stored at a platform-specific path:

| Platform | Path |
|----------|------|
| **Native Windows user-locus** | `%USERPROFILE%\Narada\registry.db` |
| **Native Windows PC-locus** | `%ProgramData%\Narada\registry.db` |
| **Native Windows legacy** | `%LOCALAPPDATA%\Narada\.registry\registry.db` |
| **WSL / Linux / POSIX** | `~/.narada/registry.db` |

The registry is separate from Site data. Site directories live at substrate-specific paths:

| Substrate | Site Root |
|-----------|-----------|
| **Windows native user-locus** | `%USERPROFILE%\Narada` |
| **Windows native PC-locus** | `%ProgramData%\Narada\sites\pc\{site_id}` |
| **Windows native legacy** | `%LOCALAPPDATA%\Narada\{site_id}` |
| **WSL** | `/var/lib/narada/{site_id}` or `~/narada/{site_id}` |
| **Linux user-mode** | `~/.local/share/narada/{site_id}` or `$XDG_DATA_HOME/narada/{site_id}` |
| **Linux system-mode** | `/var/lib/narada/{site_id}` |
| **Cloudflare** | Remote Worker — no local filesystem root |

Discovery should treat Windows user-locus and PC-locus roots as first-class roots, not as legacy `%LOCALAPPDATA%` children. A path that merely contains the string `narada` is not a Site unless it has Site identity, configuration, or registry evidence.

`narada sites doctor <site-id>` is the validation surface for a local Site root. For Windows User Sites it checks root policy, config identity, declared authority locus, sync posture, registry path/entry, and task lifecycle schema before the Site is trusted as a coherent operator surface. For `git_backed` User Sites, it additionally checks that the Site root is a Git work tree with an upstream branch, matching origin URL, active remote status, and private GitHub repo reachability when GitHub metadata is configured.

## 12. Operator Console HTTP API

Browser UI tools consume the same console capabilities through an HTTP API. The HTTP API is **not** a Site-local API and **not** a fleet orchestrator. It is a client of the same Site Registry, adapter selection, and `ControlRequestRouter` boundaries used by the CLI.

### 12.1 Launch

```bash
narada console serve --host 127.0.0.1 --port 0
```

The server prints its bound URL on startup. `--port 0` binds to an ephemeral port.

### 12.2 Route Contract

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/console/registry` | Read-only canonical Site Registry browser page |
| GET | `/console/assets/:asset` | Bounded static asset route for the shared Operator Console bundle |
| GET | `/console/registry/api/sites` | Canonical registry list envelope (`narada.site_registry.management.v0`) |
| GET | `/console/registry/api/sites/:reference` | Complete registry record and next actions envelope |
| GET | `/console/registry/api/discover-plan` | Bounded dry-run discovery envelope; accepts `source`, `root`, and `actor` |
| POST | `/console/registry/api/operations/plan` | Registry add/edit/retire/restore/purge preview using the canonical command envelope |
| POST | `/console/registry/api/operations/apply` | Explicitly confirmed registry apply; revalidates command invariants, revision, and purge identity |
| GET | `/console/launch` | Read-only Site Runtime page (Site collection plus per-Site and single-agent launch guidance) |
| GET | `/console/sites` | List all registered Sites |
| GET | `/console/sites/:site_id` | Site metadata + current health |
| GET | `/console/health` | Cross-Site health aggregation |
| GET | `/console/attention` | Attention queue derivation |
| GET | `/console/logs` | Registry router audit log (bounded, newest first) |
| GET | `/console/sites/:site_id/logs` | Site-specific audit log |
| GET | `/console/sites/:site_id/traces` | Site cycle traces (bounded, v0 returns `[]`) |
| GET | `/console/sites/:site_id/cycles` | Site cycle records (bounded, v0 returns `[]`) |
| GET | `/console/audit` | Cross-site router audit |
| POST | `/console/sites/:site_id/control` | Route control request via `ControlRequestRouter` |

Query parameters for bounded routes:
- `limit` — maximum items to return (default 50, max 1000)
- `since` — ISO timestamp filter

### 12.3 Authority and Safety

- **Read-only GET routes** never mutate registry or Site state.
- **POST control** delegates through `ControlRequestRouter`; no direct Site mutation.
- **CORS** is restricted to `localhost` and `127.0.0.1` origins in v0.
- **Default binding** is `127.0.0.1` (loopback only).
- Responses do not include raw credentials, tokens, private message bodies, or full evaluation payloads.
- Log and trace observability is **Trace/observation**, not authority. Removing it does not affect any durable state.

### 12.4 v0 Residuals

- Production auth hardening (Bearer token, OAuth, or mTLS) is deferred.
- WebSocket/SSE live streaming is deferred.
- Cross-site log aggregation from Site SQLite (not just registry audit) requires Site adapter enrichment.

### 12.5 UI Contract Factorization

The console does not introduce a second Site Registry domain.

- `@narada2/site-registry-contract` is the browser-safe home of the existing canonical registry type vocabulary and the runtime parser for the snake_case HTTP/CLI envelopes.
- `@narada2/windows-site` remains the durable registry implementation and authority owner; it re-exports the canonical types for existing callers.
- `@narada2/operator-console-ui` derives `SiteListProjection`, `SiteTileProjection`, and `SiteDetailProjection` from canonical records. Its composables own fetch, selection, and plan/apply client state; components and pages own presentation only.
- `@narada2/site-config` remains distinct. Its `SiteRegistryProjectionContract` and `SiteRegistryReadModel` describe awareness and event-derived read models, not durable User Site registry rows.

The browser boundary rejects malformed API data before projections run. UI projections are ephemeral view models: they are not persisted, do not grant authority, and do not replace the plan/apply gateway.

- The Vue mutation page serves `/console/registry/add` and `/console/registry/manage`; it owns draft state and typed request construction while plan/apply, revision checks, lifecycle guards, and purge confirmation remain server-enforced.
- Add, edit, retire, restore, and purge all use the same explicit preview-then-confirm workflow. A successful apply refreshes the canonical record and preserves the result for the operator.

## 13. Cross-References

| Document | Relationship |
|----------|-------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical Aim / Site / Cycle / Act / Trace definitions |
| [`docs/product/operator-loop.md`](operator-loop.md) | The five-step operator rhythm the console supports |
| [`docs/product/unattended-operation-layer.md`](unattended-operation-layer.md) | Health, notification, and stuck-cycle semantics |
| [`docs/deployment/windows-site-boundary-contract.md`](../deployment/windows-site-boundary-contract.md) | Windows Site authority boundaries the console must respect |
| [`docs/deployment/windows-site-materialization.md`](../deployment/windows-site-materialization.md) | Windows Site directory and substrate conventions |
| [`user-site-awareness-registry.md`](user-site-awareness-registry.md) | User Site awareness and authority separation |
| [`site-registry-read-model.v0.md`](site-registry-read-model.v0.md) | Bounded read-model schema and future authority criteria |
| [`site-registry-purge-posture.v0.md`](site-registry-purge-posture.v0.md) | Permanent registry deletion and retention posture |
| [`AGENTS.md`](../../AGENTS.md) | Observation read-only and control surface separation invariants |
