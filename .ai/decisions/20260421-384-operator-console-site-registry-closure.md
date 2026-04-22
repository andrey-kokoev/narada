# Decision: Operator Console / Site Registry Chapter Closure

**Date:** 2026-04-20  
**Chapter:** Tasks 378–384  
**Verdict:** **Closed — accepted.**

---

## Summary

The Operator Console / Site Registry chapter created a disciplined operator-facing surface that discovers, inspects, and routes control requests across multiple Narada Sites without becoming hidden authority.

**What was built:**
- A boundary contract (Task 379) that explicitly forbids the console from becoming hidden authority over Site state.
- A SQLite-backed Site Registry (Task 380) that discovers Windows native and WSL Sites by filesystem scan, persists metadata, and remains advisory (safe to delete and rebuild).
- Cross-Site health aggregation and attention queue derivation (Task 381) that produces read-only, derived views across all registered Sites.
- An audited Control Request Router (Task 382) that forwards operator actions to Site-owned control APIs and logs every routing event to an append-only audit trail.
- CLI commands (Task 383) — `narada sites` and `narada console` — that expose discovery, health inspection, attention queue review, and control request issuance to the operator.

**Honest scope:** This is a Windows-first implementation of a substrate-neutral concept. Cloudflare Sites are deferred. The console does not implement a GUI or web UI. Fleet-wide orchestration is not built. The control router routes to Site APIs but does not yet bind a live Windows Site control client (the `WindowsSiteControlClient` exists as a typed bridge but is not wired in the CLI console commands, which return `error: No control client available` until a future task binds it).

---

## Task-by-Task Assessment

### Task 379 — Operator Console / Site Registry Boundary Contract

**Delivered:**
- `docs/deployment/operator-console-site-registry-boundary-contract.md` — comprehensive contract document (13 sections).
- Explicit "registry is inventory + routing only; no direct Site-state mutation" statement.
- Observation/control separation with endpoint namespace rules (`/scopes/` = GET, `/control/` = POST).
- Control request envelope (`ConsoleControlRequest`) and audit log schema (`RouterAuditRecord`).
- Mapping to AGENTS.md invariants 19–27 and 36–40.
- Reuse inventory: 10 existing surfaces reused, 8 new surfaces created, 4 deferrals.

**Tests/checks:** Document-only task. `pnpm verify` passes.

**Residuals:** Contract may need amendment when Cloudflare Sites are added or when the control client binding changes.

**Boundary concerns:** None. Contract correctly states that the console may only observe and route; all mutation is delegated to Site-owned APIs.

---

### Task 380 — Site Registry Storage & Discovery

**Delivered:**
- `packages/sites/windows/src/registry.ts` — `SiteRegistry` class with SQLite schema for `site_registry` and `registry_audit_log`.
- `resolveRegistryDbPath()` — well-known registry location (`%LOCALAPPDATA%\Narada\.registry\registry.db` on Windows, `~/.narada/registry.db` on POSIX).
- `resolveSitesBaseDir()` — canonical Sites base directory for native and WSL variants.
- `discoverSites(variant)` — filesystem scan for directories containing `config.json`.
- `registerSite()`, `getSite()`, `listSites()`, `removeSite()`, `refreshSite()` — full CRUD.
- `test/unit/registry.test.ts` — 27 tests covering path resolution, discovery, CRUD, audit log, and persistence across reopen.

**Tests:** 27 tests. All pass.

**Corrections applied during review:**
- All `this.db.exec(sql, ...params)` calls were replaced with `this.db.prepare(sql).run(...params)` because `better-sqlite3`'s `exec()` does not bind parameters (it was silently inserting NULLs).
- `refreshSite()` was fixed to use `getPathLib(existing.variant)` instead of hardcoded `posix.join()`, which would produce incorrect paths for native Windows sites.

**Residuals:** Cloudflare Site discovery is deferred. WSL discovery may miss Sites in `~/narada` when `/var/lib/narada` exists and is writable (by design — prefers system path).

**Boundary concerns:** None. Registry does not read/write Site coordinator state directly.

---

### Task 381 — Cross-Site Health & Attention Queue

**Delivered:**
- `packages/sites/windows/src/aggregation.ts` — `aggregateHealth()` and `deriveAttentionQueue()`.
- `packages/sites/windows/src/cross-site-notifier.ts` — `CrossSiteNotificationRouter` with per-channel cooldown (default 15 minutes).
- `packages/sites/windows/src/notification.ts` — `LogNotificationAdapter`, `DefaultNotificationEmitter`, `NullNotificationEmitter`, `notifyOperator()`.
- `packages/sites/windows/src/site-observation.ts` — `SiteObservationApi` interface (`getHealth`, `getStuckWorkItems`, `getPendingOutboundCommands`, `getPendingDrafts`, `getCredentialRequirements`).
- `test/unit/aggregation.test.ts` — 18 tests.
- `test/unit/cross-site-notifier.test.ts` — 22 tests.
- `test/unit/notification.test.ts` — 11 tests.

**Tests:** 51 tests across aggregation, notifier, and notification. All pass.

**Corrections applied during review:**
- `aggregation.ts` and `cross-site-notifier.ts` were fixed to use `site.siteId` (camelCase) instead of `site.site_id`, matching the `RegisteredSite` interface.
- `notification.ts` had duplicate `notifyOperator` implementations; the simpler one was kept.

**Residuals:**
- `getStuckWorkItems()`, `getPendingOutboundCommands()`, `getPendingDrafts()`, and `getCredentialRequirements()` in the CLI observation factory return empty arrays. Real observation queries against Site coordinator databases are deferred.
- Webhook notification adapter exists but is not wired in the CLI.

**Boundary concerns:** None. All observation paths are read-only. Attention queue is derived and advisory.

---

### Task 382 — Control Request Router & Audit

**Delivered:**
- `packages/sites/windows/src/router.ts` — `ControlRequestRouter` with `ConsoleControlRequest`, `SiteControlClient`, `ControlRequestResult`.
- Safety rules enforced: unknown Sites rejected, no automatic retry, no caching, all requests audited.
- `packages/sites/windows/src/site-control.ts` — `WindowsSiteControlClient` that maps console action types to `OperatorActionType` and calls `executeOperatorAction`.
- `test/unit/router.test.ts` — 11 tests covering forward, reject, unknown Site, no client, exception handling, and audit logging.

**Tests:** 11 router tests. All pass.

**Residuals:** The CLI console commands do not yet bind a real `WindowsSiteControlClient`. They create a router with `clientFactory: () => undefined`, which causes routed requests to return `error: No control client available`. Binding the control client requires opening the target Site's coordinator SQLite and constructing `OperatorActionContext`, which is deferred to a live-integration task.

**Boundary concerns:** None. Router only transforms and delegates. Site API enforces governance. Audit log is append-only.

---

### Task 383 — Operator Console CLI Surface

**Delivered:**
- `packages/layers/cli/src/commands/sites.ts` — `sitesListCommand`, `sitesDiscoverCommand`, `sitesShowCommand`, `sitesRemoveCommand`.
- `packages/layers/cli/src/commands/console.ts` — `consoleStatusCommand`, `consoleAttentionCommand`, `consoleControlCommand`.
- `packages/layers/cli/src/main.ts` — wired `narada sites` and `narada console` subcommands into Commander.
- `test/commands/sites.test.ts` — 8 tests.
- `test/commands/console.test.ts` — 9 tests.

**Tests:** 17 new CLI tests. 214/214 total CLI tests pass.

**Corrections applied during review:**
- `console.ts` observation factory was fixed to return synchronous objects with async methods (not async factory) to match `SiteObservationApi` signature.
- Missing `getCredentialRequirements()` method added to observation factory.

**Residuals:**
- `narada console approve/reject/retry` returns `error` because no control client is bound. A future task must wire `WindowsSiteControlClient` with a real `WindowsSiteControlContextFactory`.
- `narada ops` multi-Site aggregation still uses direct `discoverWindowsSites()` rather than the registry. Unifying `ops` to use the registry is a polish task.

**Boundary concerns:** None. All control commands route through `ControlRequestRouter`. Audit is logged before any Site mutation.

---

## Semantic Drift Check

| Check | Result |
|-------|--------|
| **Console conflated with Site?** | ❌ No. Console is explicitly "outside all Sites" in the boundary contract. |
| **Console conflated with control plane?** | ❌ No. Contract states console "does not open work items or create decisions." |
| **Console conflated with Aim?** | ❌ No. Contract: "The console is an operator surface, not an Aim, Site, Vertical, Cycle, or control plane." |
| **`operation` smeared into Aim/Site/Cycle?** | ❌ No. All types use `siteId`, `scopeId`, `variant`. No `operation` overload. |
| **Registry conflated with Site state?** | ❌ No. Registry is "advisory and caching. Deleting it does not affect any Site." |
| **Observation path mutated Site state?** | ❌ No. All observation is GET-only. All mutation routes through `/control/`. |
| **Audit log conflated with Site audit?** | ❌ No. Registry audit (`registry_audit_log`) is separate from Site audit (`operator_action_requests`). |

**Verdict:** No semantic drift detected. The chapter maintained strict separation between console/registry and Site/control-plane semantics.

---

## Gap Table

| Gap | Justification for Deferral | Impact on v0 |
|-----|---------------------------|--------------|
| **Cloudflare Site console integration** | Cloudflare Sites are remote, not filesystem-discoverable. Requires endpoint URLs and credentials. | Acceptable. Console is Windows-first. |
| **Live Windows Site control client binding** | `WindowsSiteControlClient` exists but CLI returns `No control client available`. Requires opening Site SQLite + `executeOperatorAction` context. | Moderate. Operator can still use existing `narada ops` / `narada approve-draft-for-send` for single-Site control. |
| **GUI / web UI surface** | Explicit non-goal. CLI is the v0 operator surface. | Acceptable. |
| **Fleet-wide orchestration** | Console observes and routes; it does not orchestrate Cycles across Sites. | Acceptable. Task Scheduler / systemd handles per-Site scheduling. |
| **Automatic remediation** | Console is read-only + audited routing. No auto-heal logic. | Acceptable. Operator must manually issue control requests. |
| **Real observation queries (stuck work, pending drafts)** | `SiteObservationApi` factory returns empty arrays. Real queries against Site coordinator DB are deferred. | Low. `narada status --site` and `narada ops --site` still work for single-Site inspection. |
| **Cross-site notification persistence** | `SqliteNotificationRateLimiter` exists but is not wired in the CLI. | Low. Notifications are advisory. |

---

## CCC Posture Assessment

| Coordinate | Before | After |
|------------|--------|-------|
| **semantic_resolution** | `0` | `0` (no new semantics; vocabulary from SEMANTICS.md §2.14 used consistently) |
| **invariant_preservation** | `0` | `0` (console/registry never became hidden authority; observation/control separation held) |
| **constructive_executability** | `0` | **`+1`** (registry, aggregation, router, and CLI commands are real and tested) |
| **grounded_universalization** | `0` | **`0`** (substrate-neutral concept proven for Windows; Cloudflare deferred) |
| **authority_reviewability** | `0` | **`+1`** (every control request is routed through audited router; registry audit log is append-only) |
| **teleological_pressure** | `0` | **`+1 bounded`** (operator can discover Sites, inspect health, view attention queue, and issue control requests) |

**Verdict:** `constructive_executability`, `authority_reviewability`, and `teleological_pressure` each moved by `+1`. The chapter is scoped and honest — it delivers real operator-facing mechanics without overclaiming Cloudflare parity or autonomous remediation.

---

## Residuals

1. **Cloudflare Site console integration** — Registry schema supports `variant: "cloudflare"`, but discovery and control routing for remote Sites require endpoint URLs, auth tokens, and HTTP client binding.
2. **Live Windows Site control client binding** — `WindowsSiteControlClient` is typed but not wired in CLI console commands. Operator must use single-Site commands (`narada approve-draft-for-send`) for now.
3. **GUI / web UI surface** — Explicitly deferred. CLI is the v0 operator surface.
4. **Fleet-wide orchestration** — Console does not trigger Cycles across Sites. Per-Site scheduling remains the responsibility of Task Scheduler / systemd / Cron.
5. **Automatic remediation** — Console does not auto-retry, auto-heal, or auto-approve. All actions require explicit operator issuance.
6. **Real observation queries** — `SiteObservationApi.getStuckWorkItems()`, `getPendingOutboundCommands()`, `getPendingDrafts()` return empty arrays in the CLI observation factory. Real SQL queries against Site coordinator databases are deferred.
7. **Cross-site notification persistence** — `SqliteNotificationRateLimiter` is implemented but not wired in the CLI path.
8. **`narada ops` registry integration** — `ops` still uses `discoverWindowsSites()` directly rather than querying the registry. Unifying this is a polish task.

---

## Recommended Next Work

1. **Windows Site — Live Control Client Binding** (highest pressure)
   - Wire `WindowsSiteControlClient` into `narada console approve/reject/retry`
   - Open target Site's coordinator SQLite, construct `OperatorActionContext`, and call `executeOperatorAction`
   - Prove end-to-end: `narada console approve <site> <outbound>` → Site mutation → audit record

2. **Windows Site — Real Observation Queries**
   - Implement `SiteObservationApi` methods that query Site coordinator SQLite for stuck work items, pending outbounds, and pending drafts
   - Wire into `narada console attention` so the attention queue is populated from real Site state

3. **Operator Console — Cloudflare Site Support**
   - Add Cloudflare Site registration to registry (endpoint URL, auth token)
   - Implement HTTP-based `SiteControlClient` for Cloudflare
   - Extend `discoverSites` to support Cloudflare endpoint registration

4. **Operator Console — GUI / Web UI Surface**
   - Local HTTP server with HTML dashboard
   - Real-time health polling and attention queue display
   - Web-based control request issuance with the same audited router

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 379–383 are assessed.
- [x] Semantic drift check is honest (no drift found).
- [x] Gap table lists deferred work with justification.
- [x] CCC posture is recorded.
- [x] Residuals are concrete and prioritized.
- [x] Next-work recommendations are explicit.
- [x] No derivative task-status files created.
