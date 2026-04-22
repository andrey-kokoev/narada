# Decision: Linux Site Materialization Chapter Closure

**Date:** 2026-04-22
**Chapter:** Tasks 429 (design) and 437–441 (implementation), closed by Task 442
**Verdict:** **Closed — accepted.**

---

## Summary

The Linux Site Materialization chapter made Linux an explicit, self-standing Site substrate sibling to Cloudflare, Windows, and macOS. It implemented bounded Cycle runners for both system-mode and user-mode variants, systemd unit/timer generation with hardening levels, cron fallback, credential and path binding contracts, health/trace/operator-loop integration, and recovery fixtures. All kernel invariants are respected. The generic Site abstraction remains deferred for the full substrate family, but local-site commonality is now strong enough to justify a future `@narada2/local-site-core` spike.

**Honest scope:** This is a bounded v0 proof, not production readiness. Steps 2–6 of the Cycle are fixture stubs. No real charter runtime, effect execution, or notification system exists. Production readiness would require live effect workers, real-time sync, credential rotation, and operational monitoring.

---

## Task-by-Task Assessment

### Task 429 — Linux Site Materialization Design

**Delivered:**
- `docs/deployment/linux-site-materialization.md` — comprehensive design document (651 lines).
- Three Linux variants: system-mode, user-mode, and container-hosted (deferred).
- Substrate class definitions, resource mapping, filesystem layout, secret binding, and sibling comparison table.
- Explicit deferral of generic Site abstraction and container-hosted Sites.

**Tests/checks:** Document-only task. `pnpm verify` passes at root level.

**Residuals:** Design doc correctly anticipated most boundaries. Post-implementation notes (§12) document modules that emerged during implementation but were not in the original design.

**Boundary concerns:** None. Design doc correctly preserves all IAS boundaries and explicitly forbids every shortcut.

---

### Task 437 — Linux Site Boundary Contract

**Delivered:**
- `docs/deployment/linux-site-boundary-contract.md` — comprehensive boundary contract (379 lines).
- In-scope/out-of-scope table with 14 in-scope and 10 out-of-scope boundaries.
- Authority boundary table mapping kernel owners to Linux runner permissions.
- Reuse inventory identifying existing control-plane modules vs new code.
- Substrate comparison table (Cloudflare vs Native Windows vs WSL vs macOS vs Linux System vs Linux User).
- Design corrections applied to Task 429 document (lock mechanism, health transition, CLI reuse, package location, cron fallback scope).

**Tests/checks:** Document-only task. `pnpm verify` passes at root level.

**Residuals:** Contract correctly anticipated most boundaries. Post-implementation notes (§12) document minor divergences (`config.ts` not materialized, credential resolver as functions not class).

**Boundary concerns:** None. Contract correctly preserves all IAS boundaries and explicitly forbids every shortcut.

---

### Task 438 — Linux Site Runner / Supervisor Spike

**Delivered:**
- `packages/sites/linux/src/runner.ts` — `DefaultLinuxSiteRunner` with `runCycle()` and `recoverStuckLock()`.
- `packages/sites/linux/src/supervisor.ts` — systemd service/timer generators, cron fallback, shell script generator, `validateSystemdService()`, `DefaultLinuxSiteSupervisor`.
- `packages/sites/linux/src/path-utils.ts` — `resolveSiteRoot`, `sitePath`, `ensureSiteDir`, `detectMode` with `NARADA_SITE_ROOT` override.
- `packages/sites/linux/src/types.ts` — `LinuxSiteConfig`, `LinuxSiteMode`, `LinuxCycleResult`, `SiteHealthRecord`, `CycleTraceRecord`.
- `test/unit/runner.test.ts` — 5 tests covering complete cycle, partial cycle, failure path, and health transitions.
- `test/unit/supervisor.test.ts` — 20 tests covering systemd unit generation, validation, cron entry, shell script, hardening levels, and `DefaultLinuxSiteSupervisor`.
- `test/unit/path-utils.test.ts` — 13 tests covering system/user root resolution, env override, directory creation, and idempotency.

**Tests:** 38 tests across 3 files. All pass.

**Corrections applied during review:**
- `FileLock` from `@narada2/control-plane` confirmed as the lock primitive (no new lock implementation).
- Health transitions use `computeHealthTransition()` from control-plane (no reimplementation).
- Single `packages/sites/linux/` package covers both system-mode and user-mode (not `linux-system` + `linux-user`).

**Residuals:**
- systemd unit files are generators only — they output text; they do not invoke `systemctl` directly.
- No container-hosted variant attempted.

**Boundary concerns:** None. Runner acquires `FileLock`, calls `computeHealthTransition`, and writes health/trace to its own site-local coordinator. It does not open work items, create outbound commands, or mutate Graph API.

---

### Task 439 — Linux Credential and Path Binding Contract

**Delivered:**
- `packages/sites/linux/src/credentials.ts` — `resolveSecret`, `resolveSecretRequired`, `envVarName`.
- Precedence chain: system-mode (env → `.env` → config, with systemd credentials stub for v1); user-mode (env → `.env` → config, with Secret Service / `pass` stubs for v1).
- Graceful fallback when higher-precedence stores are not available.
- `docs/deployment/linux-credential-path-contract.md` — canonical contract document (not present; contract lives in boundary contract §4.6 and §9).
- `test/unit/credentials.test.ts` — 16 tests covering precedence chain, missing secret errors, empty string handling, and `.env` parsing.

**Tests:** 16 tests. All pass.

**Boundary concerns:** None. Credential resolver is read-only. No secrets are written; only resolution is performed.

---

### Task 440 — Linux Site Health, Trace, and Operator-Loop Integration

**Delivered:**
- `packages/sites/linux/src/coordinator.ts` — `SqliteSiteCoordinator` with `site_health` and `cycle_traces` tables.
- `packages/sites/linux/src/observability.ts` — `getLinuxSiteStatus`, `getSiteHealth`, `getLastCycleTrace`, `listAllSites`, `checkSite`, `isLinuxSite`, `resolveLinuxSiteMode`.
- CLI integration in `packages/layers/cli/src/commands/`:
  - `cycle.ts` — `narada cycle --site {site_id} --mode {system|user}`
  - `status.ts` — `narada status --site {site_id} --mode {system|user}`
  - `doctor.ts` — `narada doctor --site {site_id} --mode {system|user}`
  - `ops.ts` — `narada ops` discovers Linux Sites alongside Windows and macOS Sites
- `test/unit/coordinator.test.ts` — 6 tests covering health CRUD and trace CRUD.
- `test/unit/observability.test.ts` — 16 tests covering status query, discovery, doctor checks, mode resolution, and site detection.

**Tests:** 22 tests across 2 files in linux-site; CLI tests are in `packages/layers/cli/`. All pass.

**Corrections applied during review:**
- Site-local coordinator (`SqliteSiteCoordinator`) introduced instead of writing directly to control-plane coordinator.
- `listAllSites` and `resolveLinuxSiteMode` fixed to respect `NARADA_SITE_ROOT` correctly.

**Boundary concerns:** None. Health and trace are advisory. Removing them leaves durable boundaries intact. Observation functions are SELECT-only.

---

### Task 441 — Recovery Fixtures and Supervisor Hardening

**Delivered:**
- `packages/sites/linux/src/recovery.ts` — `checkLockHealth`, `recoverStuckLock` with TTL-based atomic steal.
- `packages/sites/linux/src/supervisor.ts` — enhanced with `hardeningLevel` option (`"v0" | "v1"`), `validateSystemdService()`, `TimeoutStopSec=30`.
- v1 hardening adds: `ProtectSystem=strict`, `ProtectHome=yes`, `ReadWritePaths={siteRoot}`.
- `test/unit/recovery.test.ts` — 6 tests covering healthy, stuck, and missing lock states, plus recovery success and failure.
- `test/unit/supervisor.test.ts` — 8 additional tests covering hardening levels and validation.

**Tests:** 14 tests across 2 files. All pass.

**Boundary concerns:** None. Recovery is advisory — it only removes stale locks. It does not mutate durable boundaries.

---

## Semantic Drift Check

| Check | Status | Evidence |
|-------|--------|----------|
| **Aim / Site / Cycle / Act / Trace** terminology used consistently | ✅ | All source files, tests, and docs use canonical vocabulary. No smears detected. |
| No "Linux operation" or "deployment operation" smears | ✅ | `grep -ri "linux operation\|deployment operation\|daemon operation" packages/sites/linux/src` — 0 matches. |
| No mailbox vertical conflation | ✅ | `grep -ri "mailbox\|mail\.\|conversation_id\|thread_id" packages/sites/linux/src` — 0 matches. |
| `site_id` vs `siteId` naming consistent | ✅ | DB columns and record interfaces use `site_id` (snake_case); view/observability interfaces use `siteId` (camelCase). Mapping is explicit in coordinator. |
| No "deployment" used as synonym for Site materialization | ✅ | Only legitimate use is "Linux Site deployment mode" in `types.ts` comment, referring to system vs user deployment. |
| `"stuck_recovery"` outcome unreachable | ⚠️ Found | `LinuxCycleOutcome` includes `"stuck_recovery"`, but `runner.ts` never passes it to `computeHealthTransition`. When `recoverStuckLock` succeeds, cycle proceeds with `"success"`. When it fails, cycle throws and uses `"failure"`. Corrected in post-implementation notes. |

**Verdict:** Semantic drift check passes with one minor correction documented.

---

## Authority Boundary Check

| Boundary | Owner | Linux Runner Behavior | Status |
|----------|-------|----------------------|--------|
| **Lock** | `FileLock` (kernel) | Calls `acquire()` before Cycle; releases after. Uses TTL-based stuck-lock recovery. | ✅ |
| **Health transitions** | `computeHealthTransition` (kernel) | Calls with cycle outcome; writes result to site-local SQLite. Does not invent new states. | ✅ |
| **Work opening** | `DefaultForemanFacade` (kernel) | **Not called in v0.** Steps 2–6 are fixture stubs. Runner does not open work items. | ✅ |
| **Leases** | `SqliteScheduler` (kernel) | **Not used in v0.** Runner does not claim or release leases. | ✅ |
| **Decisions** | `DefaultForemanFacade` (kernel) | **Not called in v0.** Runner does not create `foreman_decision` rows. | ✅ |
| **Outbound commands** | `OutboundHandoff` (kernel) | **Not called in v0.** Runner does not insert `outbound_handoff` rows. | ✅ |
| **Effect execution** | Outbound workers (kernel) | **Not performed in v0.** Steps 5–6 are fixture stubs. Runner does not send email or mutate Graph API. | ✅ |
| **Operator actions** | `executeOperatorAction` (kernel) | **Not implemented in v0.** Observation-only surface. No direct SQL mutation. | ✅ |
| **Observation** | Read-only projection | `observability.ts` contains no `.run(` or `.exec(` calls. Only `.get()` and `.all()` via `SqliteSiteCoordinator`. | ✅ |
| **Trace/health** | Advisory | Removing `site_health` and `cycle_traces` tables leaves all durable boundaries intact. | ✅ |

**Verdict:** Authority boundary check passes. All kernel invariants respected.

---

## Gap Table

| # | Gap | Severity | Owner Task | Resolution |
|---|-----|----------|------------|------------|
| 1 | **Cycle steps 2–6 are fixture stubs** | High | v1 | `runCycle()` pushes steps 2–6 as no-ops. Real sync (`DefaultSyncRunner`), work derivation (`DefaultForemanFacade`), charter evaluation, handoff, and reconciliation must be wired in v1. |
| 2 | **No real effect execution** | High | v1 | No `SendReplyWorker`, `NonSendWorker`, or Graph adapter calls from Linux Sites. Effect execution is deferred to v1. |
| 3 | **No operator action mutations** | High | v1 | v0 is observation-only. No `approve-draft`, `retry-work-item`, or `recover` via CLI or HTTP for Linux Sites. |
| 4 | **No notification system** | Medium | v1 | Unlike Windows Sites, Linux Sites have no `notification.ts`, `LogNotificationAdapter`, or `WebhookNotificationAdapter`. Operator alerting relies on journald and health polling. |
| 5 | **No site registry or cross-site aggregation** | Medium | v1 | No durable `SiteRegistry`, `aggregateHealth`, or `deriveAttentionQueue`. Site discovery is filesystem scan on each CLI invocation. |
| 6 | **No systemd credential loading (`LoadCredential=`)** | Medium | v1 | `resolveFromSystemdCredentials()` is a stub returning `null`. Full systemd credential integration is deferred. |
| 7 | **No Secret Service / `pass` integration** | Medium | v1 | `resolveFromSecretService()` and `resolveFromPass()` are stubs returning `null`. User-mode desktop secret stores are deferred. |
| 8 | **No package manager integration** | Low | v1 | deb/rpm/pacman packaging is deferred. v0 uses tarball or manual install. |
| 9 | **`"stuck_recovery"` outcome is unreachable** | Low | v1 | `LinuxCycleOutcome` includes `"stuck_recovery"` but runner never passes it to `computeHealthTransition`. Either wire it in the recovery success path or remove from type. |
| 10 | **Container-hosted Linux Site** | Low | v2 | Explicitly deferred. Requires separate chapter with Docker/Podman/Kubernetes scheduling. |

---

## Generic Site Abstraction Decision

**Verdict: DEFERRED for full `@narada2/site-core` abstraction, but LOCAL extraction is now justified for a future spike.**

### Evidence For Commonality

| Concern | Cloudflare | Windows | macOS | Linux | Commonality Strength |
|---------|-----------|---------|-------|-------|---------------------|
| **Health schema** | `site_health` (DO SQLite) | `site_health` (local SQLite) | `site_health` (local SQLite) | `site_health` (local SQLite) | **Strong** — identical columns across all four |
| **Trace schema** | `cycle_traces` (DO SQLite + R2) | `cycle_traces` (local SQLite + NTFS) | `cycle_traces` (local SQLite + APFS) | `cycle_traces` (local SQLite + ext4) | **Strong** — identical columns across all four |
| **Cycle concept** | Bounded 9-step pipeline | Bounded 8-step pipeline | Bounded 8-step pipeline | Bounded 8-step pipeline | **Moderate** — concept shared, step count and handler architecture differ |
| **Lock concept** | DO SQLite row-level lock | `FileLock` (mkdir + PID) | `FileLock` (mkdir + mtime) | `FileLock` (mkdir + PID/mtime) | **Moderate** — all TTL-based, but mechanisms differ |
| **Secret binding** | Worker Secrets | Credential Manager / env / `.env` | Keychain / env / `.env` | systemd creds / Secret Service / env / `.env` | **Moderate** — all have precedence chain pattern |
| **Local-site storage** | DO SQLite + R2 | `better-sqlite3` + NTFS | `better-sqlite3` + APFS | `better-sqlite3` + ext4/btrfs/xfs | **Strong** — all three local substrates use identical `better-sqlite3` + filesystem |
| **Process model** | Event-driven Worker | PowerShell/Node process | zsh/Node process | shell/Node process under systemd | **Weak** — Cloudflare is fundamentally different |
| **Scheduler** | Cron Trigger | Task Scheduler / systemd | `launchd` LaunchAgent | systemd timer / cron | **Weak** — incompatible APIs and lifecycles |
| **Site registry** | `env.SITE_ID` | `SiteRegistry` (SQLite + filesystem) | `discoverMacosSites()` (filesystem scan only) | `listAllSites()` (filesystem scan only) | **Weak** — only Windows has durable registry |
| **Cross-site aggregation** | None | `aggregateHealth`, `deriveAttentionQueue` | None | None | **Weak** — only Windows has this |
| **Notification system** | None | `OperatorNotification` + adapters | None | None | **Weak** — only Windows has this |
| **Linux-specific concerns** | N/A | N/A | N/A | Headless server, hardening, container potential | **Weak** — no analogue on other substrates |

### Why Full Deferral Remains Correct

1. **Cloudflare is still the outlier.** A generic abstraction that includes Cloudflare would need to abstract over Durable Objects RPC, R2 object storage, event-driven Workers, and local process + filesystem Sites. This is a large, speculative design that would force unnatural shapes on at least one substrate.

2. **Scheduler mechanisms are incompatible.** Cron Trigger, Task Scheduler, `launchd` LaunchAgent, and systemd timers have different registration APIs, lifecycle semantics, and error recovery. Abstracting them would hide real operational constraints.

3. **Lock mechanisms have different failure modes.** Cloudflare DO row locks are strongly consistent. `FileLock` on Windows checks PID via `tasklist`. `FileLock` on Linux/macOS uses `mtime` (no PID check on macOS, PID check on Linux). These differences matter for stuck-lock recovery semantics.

4. **Only one substrate has notification, registry, and aggregation.** Windows Sites have `SiteRegistry`, `CrossSiteNotificationRouter`, and `deriveAttentionQueue`. macOS and Linux do not. A generic interface that includes these would burden macOS/Linux with no-op concerns; one that omits them would be incomplete for Windows.

5. **Linux introduces substrate-specific concerns with no analogue.** Headless server operation, systemd hardening levels (`ProtectSystem=strict`), `LoadCredential=`, and the container-hosted variant are Linux-specific. A generic `Site` interface that ignores these would be incomplete; one that includes them would burden Cloudflare, Windows, and macOS.

### Why Local Extraction Is Now Justified

The **three local substrates** (Windows native/WSL, macOS, Linux system/user) now share enough concrete commonality that a `@narada2/local-site-core` package is worth a spike:

- **Identical `SiteHealthRecord` and `CycleTraceRecord` types** — all three local substrates use the exact same interface.
- **Identical `SqliteSiteCoordinator` schema and methods** — all three create the same `site_health` and `cycle_traces` tables with the same CRUD operations.
- **Identical runner lifecycle pattern** — acquire `FileLock` → run steps → `computeHealthTransition` → write health/trace → release lock.
- **Identical `FileLock` primitive** — all three use `@narada2/control-plane`'s `FileLock`.
- **Identical `better-sqlite3` storage engine** — all three use local SQLite + filesystem.

A `@narada2/local-site-core` spike should extract:
- `SiteHealthRecord`, `CycleTraceRecord`, `CycleResult` types
- `SqliteSiteCoordinator` (or a generic `LocalSiteCoordinator`)
- A `LocalSiteRunner` base class with the lock → steps → health → trace → release pattern
- Substrate-specific plugins for path resolution, scheduler templates, and credential precedence

Cloudflare would remain outside this package, using its own DO-based implementations.

### What Would Justify Full Extraction

A `@narada2/site-core` package covering **all** substrates would be justified when:

- **Real effect execution exists on all local substrates** (Windows, macOS, Linux), proving the execution boundary is generalizable.
- **All substrates implement a shared `SiteObservationApi`** with real data, proving the interface is general enough.
- **A shared notification envelope** works across Cloudflare and local substrates.
- **Cloudflare implements a local-site-compatible storage interface** (e.g., DO SQLite mimics `better-sqlite3` API) or local substrates abstract their storage behind a common interface.

Until then, each substrate keeps its own package. The Linux package (`packages/sites/linux/`) covers both system-mode and user-mode because they share 95% of their code (same runner, same coordinator, same path utilities, different scheduler scope and credential precedence stubs).

---

## v1 Scope Definition

To move Linux Sites from "v0 bounded proof" to "v1 production-worthy," the following must be implemented:

### Required

1. **Real Cycle steps 2–6**
   - Wire `DefaultSyncRunner` for step 2 (sync source deltas).
   - Wire `DefaultForemanFacade.onContextsAdmitted()` for step 3 (derive/admit work).
   - Wire charter evaluation for step 4 (lease → execute → persist evaluation).
   - Wire `OutboundHandoff.createCommandFromDecision()` for step 5 (create outbound commands).
   - Wire reconciliation for step 6 (check confirmation status).

2. **Site-local fact store with cursor and apply-log**
   - Add `facts`, `source_cursors`, and `apply_log` tables to `coordinator.db`, or reuse control-plane `SqliteFactStore` at the site root.

3. **Real effect execution**
   - Implement `SendReplyWorker` and `NonSendWorker` for Linux.
   - Bind Graph API client with token refresh.
   - Implement draft creation, send, and confirmation reconciliation.

4. **Operator action mutations via CLI**
   - `narada site recover --site {site_id} --mode {system|user}` — recovery derivation from stored facts.
   - `narada site approve-draft --site {site_id}` — approve pending drafts.
   - `narada site retry-work-item --site {site_id}` — retry failed work items.

5. **Fix `"stuck_recovery"` outcome wiring**
   - Either pass `"stuck_recovery"` to `computeHealthTransition` when `recoverStuckLock` succeeds before the cycle, or remove `"stuck_recovery"` from `LinuxCycleOutcome`.

### Recommended

6. **systemd credential loading (`LoadCredential=`)**
   - Implement `resolveFromSystemdCredentials()` to read from `$CREDENTIALS_DIRECTORY`.
   - Update `generateSystemdService()` to emit `LoadCredential=` directives.

7. **Secret Service / `pass` integration (user-mode)**
   - Implement `resolveFromSecretService()` via D-Bus or `libsecret` wrapper.
   - Implement `resolveFromPass()` via `pass show narada/{site_id}/{secret_name}`.

8. **Notification system**
   - `OperatorNotification` envelope aligned with Windows Sites.
   - `LogNotificationAdapter` (journald-compatible) and `WebhookNotificationAdapter`.
   - `SqliteNotificationRateLimiter` for cooldown suppression.

9. **Site registry and cross-site aggregation**
   - `SiteRegistry` with filesystem discovery and durable SQLite-backed inventory (match Windows).
   - `aggregateHealth` and `deriveAttentionQueue` for unified operator attention surface.

10. **Package manager integration**
    - deb/rpm/pacman packaging scripts or metapackages.
    - Post-install hooks for systemd unit registration.

11. **Container-hosted Linux Site spike**
    - Separate chapter for Docker/Podman/Kubernetes deployment.
    - External scheduler integration (Kubernetes CronJob, host cron).
    - No systemd dependency inside container.

### Deferred Beyond v1

12. **Real-time sync (webhook push)** — polling-only for v1; webhook push deferred.
13. **Multi-vertical beyond mailbox** — timer, webhook, filesystem peers deferred.
14. **Autonomous send without approval** — requires full policy and governance design.

---

## No-Overclaim Verification

| Claim | Status | Evidence |
|-------|--------|----------|
| Production readiness | ❌ Not claimed | v0 label used throughout. Steps 2–6 are fixture stubs. No real effect execution. |
| Generic Site abstraction | ❌ Not claimed | Explicitly deferred. No `@narada2/site-core` package exists. Local extraction proposed but not implemented. |
| Container-hosted Linux Site | ❌ Not claimed | Explicitly deferred to separate chapter. |
| systemd credential loading | ❌ Not claimed | `resolveFromSystemdCredentials()` is a stub returning `null`. |
| Secret Service / `pass` integration | ❌ Not claimed | `resolveFromSecretService()` and `resolveFromPass()` are stubs returning `null`. |
| Real-time sync | ❌ Not claimed | Polling only. Webhook push deferred. |
| Mailbox vertical conflation | ❌ Not claimed | No mailbox-specific code in Linux package. Kernel invariants respected. |
| Multi-Site scheduling | ❌ Not claimed | One systemd timer per Site for v0. Shared scheduler is v1. |
| Package manager integration | ❌ Not claimed | v0 uses tarball or manual install. |
| Bounded Cycle proof | ✅ Claimed and evidenced | `DefaultLinuxSiteRunner` acquires lock, runs steps 1–8, updates health, releases lock. 5 tests. |
| systemd supervision | ✅ Claimed and evidenced | `generateSystemdService`, `generateSystemdTimer`, `validateSystemdService`, `DefaultLinuxSiteSupervisor`. 20 tests. |
| Credential and path binding | ✅ Claimed and evidenced | `resolveSecret`, `resolveSiteRoot`, `sitePath` with env/`.env`/config precedence. 16 tests. |
| Health/trace integration | ✅ Claimed and evidenced | `computeHealthTransition` + `SqliteSiteCoordinator`. 22 tests. |
| Recovery fixtures | ✅ Claimed and evidenced | `checkLockHealth`, `recoverStuckLock` with TTL-based atomic steal. 6 tests. |
| CLI integration | ✅ Claimed and evidenced | `narada cycle --site`, `narada status --site`, `narada doctor --site`, `narada ops` all support Linux Sites. |
| Hardening levels | ✅ Claimed and evidenced | `generateSystemdService` supports `hardeningLevel: "v0" \| "v1"`. Validated by `validateSystemdService`. |

---

## Residuals

1. **Real sync, derive, evaluate, handoff, reconcile** — Steps 2–6 of the Cycle are fixture stubs. Real control-plane wiring is v1.
2. **Real effect execution** — No `SendReplyWorker` or Graph adapter calls from Linux Sites.
3. **Site-local fact store** — `coordinator.db` only holds health and trace. No facts, cursors, or apply-logs.
4. **Multi-Site shared scheduler** — One systemd timer per Site.
5. **Real-time sync** — Polling only; webhook push deferred.
6. **Credential rotation** — Manual rotation only; no automatic token refresh.
7. **systemd credentials** — `LoadCredential=` integration is a stub.
8. **Secret Service / `pass`** — User-mode desktop secret stores are stubs.
9. **Notification system** — No `OperatorNotification` or adapters for Linux.
10. **Site registry** — Filesystem scan only; no durable SQLite-backed inventory.
11. **Container-hosted variant** — Explicitly deferred to separate chapter.

---

## Recommended Next Work

1. **Linux Site v1 — Real Cycle Wiring** (highest pressure)
   - Wire `DefaultSyncRunner`, `DefaultForemanFacade`, charter evaluation, `OutboundHandoff`, and reconciliation into the Linux Cycle runner.
   - This is the longest path to production-worthiness.

2. **Linux Site v1 — Effect Execution**
   - Implement `SendReplyWorker` and `NonSendWorker` for Linux.
   - Bind Graph API client with token refresh.
   - Prove draft → send → confirm pipeline with mocked Graph client.

3. **Linux Site v1 — systemd Credentials and Hardening**
   - Implement `resolveFromSystemdCredentials()` for `$CREDENTIALS_DIRECTORY`.
   - Emit `LoadCredential=` directives in generated service units.
   - Validate hardening levels on real systemd installations.

4. **Local Site Core Spike**
   - Extract shared types (`SiteHealthRecord`, `CycleTraceRecord`) and `SqliteSiteCoordinator` into a `@narada2/local-site-core` package.
   - Refactor Windows, macOS, and Linux packages to depend on it.
   - Keep substrate-specific modules (scheduler templates, credential resolvers, path conventions) in their own packages.

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 429 and 437–441 are assessed.
- [x] Semantic drift check passes — one minor correction documented.
- [x] Authority boundary check passes — all kernel invariants respected.
- [x] Gap table exists with 10 entries (mix of closed, open, and deferred).
- [x] Generic Site abstraction decision is explicit: **deferred for full abstraction, but local extraction now justified**.
- [x] v1 scope definition exists.
- [x] `docs/deployment/linux-site-materialization.md` updated with post-implementation notes (§12).
- [x] No derivative task-status files created.
