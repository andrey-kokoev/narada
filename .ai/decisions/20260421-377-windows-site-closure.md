# Decision: Windows Site Materialization Chapter Closure

**Date:** 2026-04-21
**Chapter:** Tasks 371–377 (plus Tasks 380–381)
**Verdict:** **Closed — accepted.**

---

## Summary

The Windows Site Materialization chapter made Windows an explicit, self-standing Site substrate sibling to Cloudflare. It implemented bounded Cycle runners for both native Windows and WSL variants, credential and path binding contracts, health/trace/operator-loop integration, and cross-site health aggregation. All kernel invariants are respected. The generic Site abstraction remains deferred — the evidence does not yet justify extraction.

**Honest scope:** This is a bounded v0 proof, not production readiness. Steps 2–6 of the Cycle are fixture stubs. No real charter runtime, effect execution, or Windows Service exists. Production readiness would require live effect workers, real-time sync, credential rotation, and operational monitoring.

---

## Task-by-Task Assessment

### Task 372 — Windows Site Boundary / Design Contract

**Delivered:**
- `docs/deployment/windows-site-boundary-contract.md` — comprehensive boundary contract (367 lines).
- In-scope/out-of-scope table with 14 in-scope and 9 out-of-scope boundaries.
- Authority boundary table mapping kernel owners to Windows runner permissions.
- Reuse inventory identifying existing control-plane modules vs new code.
- Substrate comparison table (Cloudflare vs Native Windows vs WSL).
- Design corrections applied to Task 371 document (lock mechanism, health transition, CLI reuse, package location).

**Tests/checks:** Document-only task. `pnpm verify` passes at root level.

**Residuals:** Contract correctly anticipated most boundaries. Post-implementation notes (§10) document the few modules that emerged during implementation but were not in the contract.

**Boundary concerns:** None. Contract correctly preserves all IAS boundaries and explicitly forbids every shortcut.

---

### Task 373 — Native Windows Runner / Supervision Spike

**Delivered:**
- `packages/sites/windows/src/runner.ts` — `DefaultWindowsSiteRunner` with `runCycle()` and `recoverStuckLock()`.
- `packages/sites/windows/src/supervisor.ts` — Task Scheduler PowerShell script generators (`generateRegisterTaskScript`, `generateUnregisterTaskScript`, `generateTaskStatusScript`).
- `packages/sites/windows/src/path-utils.ts` — `resolveSiteRoot`, `sitePath`, `ensureSiteDir` with variant-aware path separators.
- `packages/sites/windows/src/types.ts` — `WindowsSiteConfig`, `WindowsSiteVariant`, `WindowsCycleResult`.
- `test/unit/runner.test.ts` — 8 tests covering complete cycle, partial cycle, failure path, stuck-lock recovery, health transitions, and notification emission.
- `test/unit/supervisor.test.ts` — 8 tests covering systemd unit generation, cron entry, shell script, Task Scheduler scripts, and `buildTaskInfo`.
- `test/unit/path-utils.test.ts` — 15 tests covering native/WSL root resolution, separator correctness, env override, directory creation, and idempotency.

**Tests:** 31 tests across 3 files. All pass.

**Corrections applied during review:**
- `FileLock` from `@narada2/control-plane` confirmed as the lock primitive (no new lock implementation).
- Health transitions use `computeHealthTransition()` from control-plane (no reimplementation).
- Single `packages/sites/windows/` package covers both variants (not `windows-native` + `windows-wsl`).

**Residuals:**
- Task Scheduler scripts are generators only — they output PowerShell text; they do not invoke `Register-ScheduledTask` directly.
- No Windows Service wrapper attempted.

**Boundary concerns:** None. Runner acquires `FileLock`, calls `computeHealthTransition`, and writes health/trace to its own site-local coordinator. It does not open work items, create outbound commands, or mutate Graph API.

---

### Task 374 — WSL Site Runner / Supervision Spike

**Delivered:**
- Same `DefaultWindowsSiteRunner` and `supervisor.ts` functions cover WSL via runtime variant selection (`detectVariant()`).
- `generateSystemdUnits`, `writeSystemdUnits`, `generateCronEntry`, `generateShellScript`, `writeShellScript` for WSL supervision.
- WSL path resolution uses `posix` path library; native uses `win32`.
- WSL fallback from `/var/lib/narada` to `~/narada` when `/var/lib/narada` is not writable.

**Tests:** Covered by same test files as Task 373. All pass.

**Residuals:** systemd unit files are generated but not installed. Installation requires root privileges and is documented as a manual operator step.

**Boundary concerns:** None. WSL runner is identical to native runner in authority boundaries.

---

### Task 375 — Credential and Path Binding Contract

**Delivered:**
- `packages/sites/windows/src/credentials.ts` — `resolveSecret`, `resolveSecretRequired`, `envVarName`, `credentialManagerTarget`.
- Variant-specific precedence: native (Credential Manager → env → `.env` → config); WSL (env → `.env` → config).
- Platform guard: throws on non-Windows for `variant === "native"`.
- Graceful fallback when `keytar` is not installed.
- `docs/deployment/windows-credential-path-contract.md` — canonical contract document (190 lines).
- `test/unit/credentials.test.ts` — 16 tests covering precedence chain, platform guard, missing credential errors, empty string handling, and `keytar` fallback.

**Tests:** 16 tests. All pass.

**Boundary concerns:** None. Credential resolver is read-only. No secrets are written; only resolution is performed.

---

### Task 376 — Health, Trace, and Operator-Loop Integration

**Delivered:**
- `packages/sites/windows/src/coordinator.ts` — `SqliteSiteCoordinator` with `site_health`, `cycle_traces`, and `notification_log` tables.
- `packages/sites/windows/src/observability.ts` — `getWindowsSiteStatus`, `getSiteHealth`, `getLastCycleTrace`, `discoverWindowsSites`, `resolveSiteVariant`.
- `packages/sites/windows/src/notification.ts` — `OperatorNotification` envelope, `LogNotificationAdapter`, `WebhookNotificationAdapter`, `DefaultNotificationEmitter`, `SqliteNotificationRateLimiter`, `notifyOperator`.
- `packages/sites/windows/src/runner.ts` — integrates `computeHealthTransition` and `notifyOperator` into the Cycle completion path.
- `test/unit/coordinator.test.ts` — 6 tests covering health CRUD, trace CRUD, and notification log.
- `test/unit/observability.test.ts` — 9 tests covering status query, discovery, and variant resolution.
- `test/unit/notification.test.ts` — 11 tests covering emission, rate limiting, cooldown suppression, adapter failure handling, and multi-channel coordination.

**Tests:** 26 tests across 3 files. All pass.

**Corrections applied during review:**
- Site-local coordinator (`SqliteSiteCoordinator`) introduced instead of writing directly to control-plane coordinator. This decouples Windows Sites from control-plane schema internals.
- Notification contract aligned with Cloudflare-site notification envelope exactly.

**Boundary concerns:** None. Health and trace are advisory. Removing them leaves durable boundaries intact. Observation functions are SELECT-only.

---

### Tasks 380–381 — Site Registry and Cross-Site Aggregation (Post-Chapter Additions)

**Delivered:**
- `packages/sites/windows/src/registry.ts` — `SiteRegistry` with filesystem discovery, CRUD, and audit logging.
- `packages/sites/windows/src/aggregation.ts` — `aggregateHealth` and `deriveAttentionQueue`.
- `packages/sites/windows/src/cross-site-notifier.ts` — `CrossSiteNotificationRouter` with `SiteHealthTracker`, `shouldNotify`, and `buildNotification`.
- `packages/sites/windows/src/site-observation.ts` — `SiteObservationApi` interface and related types.
- `test/unit/registry.test.ts` — 27 tests covering discovery, CRUD, audit logging, and path mapping.
- `test/unit/aggregation.test.ts` — 18 tests covering health aggregation, attention queue derivation, severity sorting, and credential-required items.
- `test/unit/cross-site-notifier.test.ts` — 22 tests covering transition detection, cooldown suppression, notification building, and reset behavior.

**Tests:** 67 tests across 3 files. All pass.

**Boundary concerns:** None. Registry and aggregation are read-only with respect to Site state. The registry is advisory — deleting it does not affect any Site. `deriveAttentionQueue` never mutates Site state.

---

## Semantic Drift Check

| Check | Status | Evidence |
|-------|--------|----------|
| **Aim / Site / Cycle / Act / Trace** terminology used consistently | ✅ | All source files, tests, and docs use canonical vocabulary. No smears detected. |
| No "Windows operation" or "deployment operation" smears | ✅ | `grep -ri "operation\|deployment operation\|daemon operation" packages/sites/windows/src` — 0 matches. |
| No mailbox vertical conflation | ✅ | `grep -ri "mailbox\|mail\.\|conversation_id\|thread_id" packages/sites/windows/src` — 0 matches. |
| `site_id` vs `siteId` naming consistent | ✅ | DB columns use `site_id` (snake_case); TypeScript interfaces use `siteId` (camelCase). Mapping is explicit in registry and coordinator. |
| No "deployment" used as synonym for Site materialization | ✅ | Design doc §1 correctly uses "deployment boundary" (legitimate phrase per SEMANTICS.md), not "deployment operation". |

**Verdict:** Semantic drift check passes. No corrections required.

---

## Authority Boundary Check

| Boundary | Owner | Windows Runner Behavior | Status |
|----------|-------|------------------------|--------|
| **Lock** | `FileLock` (kernel) | Calls `acquire()` before Cycle; releases after. Uses TTL-based stuck-lock recovery. | ✅ |
| **Health transitions** | `computeHealthTransition` (kernel) | Calls with cycle outcome; writes result to site-local SQLite. Does not invent new states. | ✅ |
| **Work opening** | `DefaultForemanFacade` (kernel) | **Not called in v0.** Steps 2–6 are fixture stubs. Runner does not open work items. | ✅ |
| **Leases** | `SqliteScheduler` (kernel) | **Not used in v0.** Runner does not claim or release leases. | ✅ |
| **Decisions** | `DefaultForemanFacade` (kernel) | **Not called in v0.** Runner does not create `foreman_decision` rows. | ✅ |
| **Outbound commands** | `OutboundHandoff` (kernel) | **Not called in v0.** Runner does not insert `outbound_handoff` rows. | ✅ |
| **Effect execution** | Outbound workers (kernel) | **Not performed in v0.** Steps 5–6 are fixture stubs. Runner does not send email or mutate Graph API. | ✅ |
| **Operator actions** | `executeOperatorAction` (kernel) | `WindowsSiteControlClient` maps console requests and delegates to `executeOperatorAction`. No direct SQL mutation. | ✅ |
| **Observation** | Read-only projection | `observability.ts`, `aggregation.ts`, `site-observation.ts` contain no `.run(` or `.exec(` calls. Only `.get()`, `.all()`, and `.pluck()` via `SiteObservationApi`. | ✅ |
| **Trace/health** | Advisory | Removing `site_health` and `cycle_traces` tables leaves all durable boundaries intact. | ✅ |

**Verdict:** Authority boundary check passes. All kernel invariants respected.

---

## Gap Table

| # | Gap | Severity | Owner Task | Resolution |
|---|-----|----------|------------|------------|
| 1 | **Cycle steps 2–6 are fixture stubs** | High | v1 | `runCycle()` pushes steps 2–6 as no-ops. Real sync (`DefaultSyncRunner`), work derivation (`DefaultForemanFacade`), charter evaluation, handoff, and reconciliation must be wired in v1. |
| 2 | **No real effect execution** | High | v1 | No `SendReplyWorker`, `NonSendWorker`, or Graph adapter calls from Windows Sites. Effect execution is deferred to v1. |
| 3 | **No Windows Service wrapper** | Medium | v1 | Task Scheduler is the v0 scheduler. True Windows Service requires session 0 isolation research, service lifecycle hooks, and recovery action design. |
| 4 | **No multi-Site shared scheduler** | Medium | v1 | One Task Scheduler task / systemd timer per Site. A single scheduler managing multiple Sites (like a daemon) is v1. |
| 5 | **No WSL↔Windows host interop** | Medium | v1 | Credential sharing, file sharing, or process signaling across the WSL boundary is explicitly deferred. Each variant is self-contained in v0. |
| 6 | **No real-time sync (webhook push)** | Medium | v1 | Cron/Task Scheduler polling only. Webhook push replaces polling in v1. |
| 7 | **`keytar` is optional dependency** | Low | v1 | Credential Manager access requires `keytar` to be installed. Packaging and dependency management must ensure it is available in native Windows deployments. |
| 8 | **No CLI integration yet** | Medium | 382–383 | `narada cycle --site`, `narada status --site`, `narada doctor --site` are not yet implemented in `packages/layers/cli/`. These are Tasks 382–383. |
| 9 | **Site registry is not auto-refreshed** | Low | v1 | `SiteRegistry.discoverSites()` is a manual scan. Auto-discovery on every cycle or via filesystem watcher is v1. |
| 10 | **No notification adapters beyond log/webhook** | Low | v1 | `LogNotificationAdapter` and `WebhookNotificationAdapter` exist. Email, Teams, Slack adapters are v1. |

---

## Generic Site Abstraction Decision

**Verdict: DEFERRED.**

### Evidence For Commonality

| Concern | Cloudflare | Native Windows | WSL | Commonality Strength |
|---------|-----------|----------------|-----|---------------------|
| **Health schema** | `site_health` (DO SQLite) | `site_health` (local SQLite) | `site_health` (local SQLite) | **Strong** — identical columns |
| **Trace schema** | `cycle_traces` (DO SQLite + R2) | `cycle_traces` (local SQLite + NTFS) | `cycle_traces` (local SQLite + ext4) | **Strong** — identical columns |
| **Notification envelope** | `OperatorNotification` | `OperatorNotification` | `OperatorNotification` | **Strong** — exact same interface |
| **Cycle concept** | Bounded 9-step pipeline | Bounded 8-step pipeline | Bounded 8-step pipeline | **Moderate** — concept shared, implementation differs |
| **Lock concept** | DO SQLite row-level lock | `FileLock` (mkdir-based) | `FileLock` (mkdir-based) | **Weak** — different mechanisms, different failure modes |
| **Secret binding** | Worker Secrets | Credential Manager / env | env / `.env` | **Weak** — different stores, different precedence |
| **Process model** | Event-driven Worker | PowerShell/Node process | shell/Node process | **Weak** — different lifecycles, different signal handling |
| **Site registry** | `env.SITE_ID` | `SiteRegistry` (SQLite + filesystem scan) | `SiteRegistry` | **Weak** — Cloudflare has no registry; Windows has one |
| **Control surface** | HTTP RPC (DO `fetch()`) | Local function call (`executeOperatorAction`) | Local function call | **Weak** — different transport, same governance |
| **Cycle runner architecture** | Explicit step handlers (`CycleStepHandler`) | Sequential runner with fixture stubs | Sequential runner | **Weak** — different architectures |

### Why Deferral Is Correct

1. **Only two substrates exist.** A generic abstraction needs at least three data points to justify extraction. With only Cloudflare and Windows, the abstraction would be underconstrained.

2. **Storage substrate differs fundamentally.** Cloudflare uses Durable Objects SQLite + R2. Windows uses local SQLite + NTFS/ext4. A generic `SiteStorage` interface would need to abstract over DO RPC, filesystem paths, and object storage — a large, speculative design.

3. **Lock mechanisms are incompatible.** DO SQLite row-level locking and `FileLock` mkdir-based locking have different consistency models, failure modes, and stuck-detection semantics. Abstracting them would hide real substrate constraints.

4. **Process lifecycle is substrate-specific.** Cloudflare Workers are event-driven and stateless. Windows native is a scheduled process with Task Scheduler. WSL is a scheduled process with systemd/cron. These are not interchangeable.

5. **The `SiteObservationApi` interface is promising but unproven.** Windows has an explicit `SiteObservationApi` interface. Cloudflare's equivalent is HTTP endpoints (`GET /status`). Until a third substrate implements `SiteObservationApi`, we cannot know if the interface is general enough.

### What Would Justify Extraction

A `@narada2/site-core` package would be justified when:

- A **third substrate** (e.g., Docker, AWS Lambda, Kubernetes) is implemented and shares the same patterns.
- **Cloudflare and Windows both implement `SiteObservationApi`** with real data, proving the interface is substrate-agnostic.
- **Real effect execution exists on Windows** that mirrors Cloudflare's effect worker, proving the execution boundary is generalizable.
- **A shared `SiteRegistry` abstraction** works across substrates (e.g., Cloudflare gains a registry, or Windows drops its filesystem-based one).

Until then, each substrate keeps its own package. The Windows package (`packages/sites/windows/`) covers both native and WSL variants because they share 95% of their code (same runner, same coordinator, same path utilities, different scheduler templates and credential precedence).

---

## v1 Scope Definition

To move Windows Sites from "v0 bounded proof" to "v1 production-worthy," the following must be implemented:

### Required

1. **Real Cycle steps 2–6**
   - Wire `DefaultSyncRunner` for step 2 (sync source deltas).
   - Wire `DefaultForemanFacade.onContextsAdmitted()` for step 3 (derive/admit work).
   - Wire charter evaluation for step 4 (lease → execute → persist evaluation).
   - Wire `OutboundHandoff.createCommandFromDecision()` for step 5 (create outbound commands).
   - Wire reconciliation for step 6 (check confirmation status).

2. **Real effect execution**
   - Implement `SendReplyWorker` and `NonSendWorker` for Windows.
   - Bind Graph API client with token refresh.
   - Implement draft creation, send, and confirmation reconciliation.

3. **CLI integration**
   - `narada cycle --site {site_id}` — trigger one bounded Cycle.
   - `narada status --site {site_id}` — read health and last trace.
   - `narada doctor --site {site_id}` — check directory, DB, lock, health.
   - `narada ops` — discover all Sites and summarize.

4. **Credential rotation and packaging**
   - Ensure `keytar` is bundled in native Windows distributions.
   - Document Credential Manager setup for operators.
   - Implement token refresh for Graph API credentials.

### Recommended

5. **Windows Service wrapper**
   - Research session 0 isolation and service lifecycle.
   - Implement a Windows Service that invokes the Cycle runner.
   - Provide service install/uninstall PowerShell scripts.

6. **Multi-Site shared scheduler**
   - A single process that manages multiple Sites (e.g., a lightweight daemon).
   - Shared notification router with per-Site cooldown.
   - Site registry auto-refresh.

7. **Real-time sync (webhook push)**
   - Generic webhook HTTP server (`packages/layers/daemon/src/generic-webhook-server.ts`) adapted for Windows.
   - Push-based delta delivery instead of polling.

8. **WSL↔Windows host interop**
   - Credential sharing across the WSL boundary.
   - Filesystem path translation for shared state.

### Deferred Beyond v1

9. **GUI or tray application** — CLI and HTTP only.
10. **Remote management** — Operator surfaces remain local-only.
11. **Autonomous send without approval** — Requires full policy and governance design.

---

## No-Overclaim Verification

| Claim | Status | Evidence |
|-------|--------|----------|
| Production readiness | ❌ Not claimed | v0 label used throughout. Steps 2–6 are fixture stubs. No real effect execution. |
| Generic Site abstraction | ❌ Not claimed | Explicitly deferred. No `@narada2/site-core` package exists. |
| Windows Service production runtime | ❌ Not claimed | Task Scheduler is the v0 scheduler. Windows Service is deferred to v1. |
| Real-time sync | ❌ Not claimed | Polling only. Webhook push is deferred. |
| Mailbox vertical conflation | ❌ Not claimed | No mailbox-specific code in Windows package. Kernel invariants respected. |
| Multi-Site scheduling | ❌ Not claimed | One scheduler per Site for v0. Shared scheduler is v1. |
| WSL↔Windows interop | ❌ Not claimed | Each variant is self-contained in v0. |
| Bounded Cycle proof | ✅ Claimed and evidenced | `DefaultWindowsSiteRunner` acquires lock, runs steps 1–8, updates health, releases lock. 8 tests. |
| Credential and path binding | ✅ Claimed and evidenced | `resolveSecret`, `resolveSiteRoot`, `sitePath` with variant-specific precedence. 31 tests. |
| Health/trace integration | ✅ Claimed and evidenced | `computeHealthTransition` + `SqliteSiteCoordinator` + `notifyOperator`. 26 tests. |
| Cross-site aggregation | ✅ Claimed and evidenced | `aggregateHealth`, `deriveAttentionQueue`, `CrossSiteNotificationRouter`. 67 tests. |
| Operator control surface | ✅ Claimed and evidenced | `ControlRequestRouter` + `WindowsSiteControlClient` → `executeOperatorAction`. 11 tests. |

---

## Residuals

1. **Real sync, derive, evaluate, handoff, reconcile** — Steps 2–6 of the Cycle are fixture stubs. Real control-plane wiring is v1.
2. **Real effect execution** — No `SendReplyWorker` or Graph adapter calls from Windows Sites.
3. **CLI integration** — `narada cycle`, `narada status --site`, `narada doctor --site` are not yet implemented.
4. **Windows Service** — Task Scheduler remains the v0 scheduler.
5. **Multi-Site shared scheduler** — One Task Scheduler task / systemd timer per Site.
6. **Real-time sync** — Polling only; webhook push deferred.
7. **Credential rotation** — Manual rotation only; no automatic token refresh.
8. **`keytar` packaging** — Optional dependency must be explicitly bundled for native Windows.
9. **Live Graph API validation** — No real email sent; no live Graph credentials exercised.
10. **Site registry auto-refresh** — Manual `discoverSites()` scan; no filesystem watcher.

---

## Recommended Next Work

1. **Windows Site v1 — Real Cycle Wiring** (highest pressure)
   - Wire `DefaultSyncRunner`, `DefaultForemanFacade`, charter evaluation, `OutboundHandoff`, and reconciliation into the Windows Cycle runner.
   - This is the longest path to production-worthiness.

2. **Windows Site v1 — Effect Execution**
   - Implement `SendReplyWorker` and `NonSendWorker` for Windows.
   - Bind Graph API client with token refresh.
   - Prove draft → send → confirm pipeline with mocked Graph client.

3. **Windows Site v0.5 — CLI Integration** (Tasks 382–383)
   - Implement `narada cycle --site`, `narada status --site`, `narada doctor --site` in `packages/layers/cli/`.
   - Integrate `discoverWindowsSites` into `narada ops`.

4. **Windows Site v1 — Windows Service Research**
   - Investigate session 0 isolation, service lifecycle, and recovery actions.
   - Produce a spike document before implementation.

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 371–376 (plus 380–381) are assessed.
- [x] Semantic drift check passes — no terminology smears found.
- [x] Authority boundary check passes — all kernel invariants respected.
- [x] Gap table exists with 10 entries (mix of closed, open, and deferred).
- [x] Generic Site abstraction decision is explicit: **deferred with evidence-based rationale**.
- [x] v1 scope definition exists.
- [x] `docs/deployment/windows-site-materialization.md` updated with post-implementation notes.
- [x] No derivative task-status files created.
