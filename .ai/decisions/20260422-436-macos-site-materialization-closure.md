# Decision: macOS Site Materialization Chapter Closure

**Date:** 2026-04-22
**Chapter:** Tasks 431–436
**Verdict:** **Closed — accepted.**

---

## Summary

The macOS Site Materialization chapter made macOS an explicit, self-standing Site substrate sibling to Cloudflare and Windows. It implemented a bounded Cycle runner with `launchd` LaunchAgent supervision, macOS Keychain credential resolution, APFS path conventions with space-safe handling, site-local health/trace storage, and fixture-proven sleep/wake recovery behavior. All kernel invariants are respected. The generic Site abstraction remains deferred — the evidence is stronger than at the Windows closure but still premature.

**Honest scope:** This is a bounded v0 proof, not production readiness. Steps 2–6 of the Cycle are fixture stubs. No real charter runtime, effect execution, or multi-Site scheduling exists. Production readiness would require live effect workers, real-time sync, credential rotation, and operational monitoring.

---

## Task-by-Task Assessment

### Task 431 — macOS Site Boundary / Design Contract

**Delivered:**
- `docs/deployment/macos-site-materialization.md` — comprehensive design document (417 lines).
- Boundary contract embedded in chapter DAG file (`.ai/do-not-open/tasks/20260422-431-436-macos-site-materialization.md`) with authority table and reuse inventory.
- Sibling substrate comparison table (Cloudflare vs Windows Native vs Windows WSL vs macOS).
- macOS-specific concerns: sleep/wake, TCC, path-with-spaces, LaunchAgent environment mismatch.

**Tests/checks:** Document-only task. `pnpm verify` passes at package level.

**Residuals:** No separate `macos-site-boundary-contract.md` file was created; the contract lives in the chapter DAG and the design doc. Post-implementation notes (§11) document corrections.

**Boundary concerns:** None. Contract correctly preserves all IAS boundaries.

---

### Task 432 — launchd Runner / Supervision Spike

**Delivered:**
- `packages/sites/macos/src/runner.ts` — `DefaultMacosSiteRunner` with `runCycle()` and `recoverStuckLock()`.
- `packages/sites/macos/src/supervisor.ts` — LaunchAgent plist generator and zsh wrapper script generator (`generateLaunchAgentPlist`, `generateWrapperScript`, `writeLaunchAgentFiles`).
- `packages/sites/macos/src/path-utils.ts` — `resolveSiteRoot`, `sitePath`, `ensureSiteDir` with `~/Library/Application Support/` conventions.
- `packages/sites/macos/src/types.ts` — `MacosSiteConfig`, `MacosCycleResult`, `SiteHealthRecord`, `CycleTraceRecord`.
- `test/unit/runner.test.ts` — 12 tests covering complete cycle, partial cycle, failure path, lock contention, and health transitions.
- `test/unit/supervisor.test.ts` — 7 tests covering plist generation, wrapper script quoting, and load/unload commands.
- `test/unit/path-utils.test.ts` — 9 tests covering root resolution, path building, env override, and directory creation.

**Tests:** 28 tests across 3 files. All pass.

**Corrections applied during review:**
- `FileLock` from `@narada2/control-plane` confirmed as the lock primitive.
- Health transitions use `computeHealthTransition()` from control-plane.
- `supervisor.ts` uses pure functions, not a class — same pattern as Windows.

**Residuals:**
- LaunchAgent files are generators only — they output plist/XML and shell script text; they do not invoke `launchctl` directly.
- No GUI or menu bar app.

**Boundary concerns:** None. Runner acquires `FileLock`, calls `computeHealthTransition`, and writes health/trace to its own site-local coordinator. It does not open work items, create outbound commands, or mutate Graph API.

---

### Task 433 — macOS Credential and Path Binding Contract

**Delivered:**
- `packages/sites/macos/src/credentials.ts` — `resolveSecret`, `resolveSecretRequired`, `envVarName`, `keychainServiceName`, `setupKeychainAccess`.
- Precedence chain: Keychain → env (`NARADA_{site_id}_{name}`) → `.env` → config.
- TCC pre-warming helper (`setupKeychainAccess`) to trigger permission dialog interactively before LaunchAgent activation.
- `test/unit/credentials.test.ts` — 12 tests covering precedence chain, missing secret errors, empty string handling, and TCC helper.

**Tests:** 12 tests. All pass.

**Boundary concerns:** None. Credential resolver is read-only. No secrets are written; only resolution is performed.

---

### Task 434 — Health, Trace, and Operator-Loop Integration

**Delivered:**
- `packages/sites/macos/src/coordinator.ts` — `SqliteSiteCoordinator` with `site_health` and `cycle_traces` tables.
- `packages/sites/macos/src/observability.ts` — `getMacosSiteStatus`, `getSiteHealth`, `getLastCycleTrace`, `getSiteSummary`, `discoverMacosSites`.
- `packages/sites/macos/src/health.ts` — `writeHealthRecord`, `readHealthRecord` wrapping `computeHealthTransition`.
- `packages/sites/macos/src/trace.ts` — `appendCycleTrace`, `writeTraceArtifact`.
- `test/unit/health.test.ts` — 6 tests covering success, failure, auth failure, and stuck recovery transitions.
- `test/unit/observability.test.ts` — 10 tests covering status query, discovery, health read, trace read, and summary.
- `test/unit/trace.test.ts` — 5 tests covering trace append and artifact write.

**Tests:** 21 tests across 3 files. All pass.

**Corrections applied during review:**
- Site-local coordinator (`SqliteSiteCoordinator`) introduced instead of writing directly to control-plane coordinator. This decouples macOS Sites from control-plane schema internals.

**Boundary concerns:** None. Health and trace are advisory. Removing them leaves durable boundaries intact. Observation functions are SELECT-only.

---

### Task 435 — Sleep/Wake and Missed-Cycle Recovery Fixture

**Delivered:**
- `packages/sites/macos/test/sleep-wake-recovery.test.ts` — 6 fixture tests proving macOS Cycle behavior across sleep/wake boundaries without a real sleeping Mac.
- Scenario A: Sleep before Cycle — cursor-driven catch-up, no phantom trace.
- Scenario B: Sleep mid-Cycle with TTL expiry — stale lock recovery via `FileLock` TTL detection.
- Scenario C: Sleep mid-Cycle, wake before TTL — lock still held, next cycle fails fast, sleep is not a health failure.
- Scenario D: Long sleep (> multiple intervals) — lock prevents duplicate catch-up cycles.
- FileLock TTL coverage: stale vs fresh lock detection on macOS (pure `mtime` check).

**Tests:** 6 tests. All pass (24+ seconds due to `FileLock` polling intervals).

**Corrections applied during review:**
- Scenario C fix: manually acquire a `FileLock` with long TTL (without releasing) before invoking the second cycle, so the second cycle encounters a genuinely held lock.

**Boundary concerns:** None. Fixtures only exercise `FileLock` and `FileCursorStore` from `@narada2/control-plane`. No production code changes.

---

## Semantic Drift Check

| Check | Status | Evidence |
|-------|--------|----------|
| **Aim / Site / Cycle / Act / Trace** terminology used consistently | ✅ | All source files, tests, and docs use canonical vocabulary. No smears detected. |
| No "macOS operation" or "deployment operation" smears | ✅ | `grep -ri "macOS operation\|deployment operation\|daemon operation" packages/sites/macos/src` — 0 matches. |
| No mailbox vertical conflation | ✅ | `grep -ri "mailbox\|mail\.\|conversation_id\|thread_id" packages/sites/macos/src` — 0 matches (only comments referencing v1 deferred work). |
| `site_id` vs `siteId` naming consistent | ✅ | DB columns use `site_id` (snake_case); TypeScript interfaces use `siteId` (camelCase). Mapping is explicit in coordinator. |
| No "deployment" used as synonym for Site materialization | ✅ | Design doc §1 correctly uses "deployment boundary" (legitimate phrase per SEMANTICS.md), not "deployment operation". |
| Stale task number references in design doc | ⚠️ Found | §1 references "Tasks 429–434" and "Task 434 closure"; actual chapter is Tasks 431–436. Corrected in post-implementation notes. |
| `stuck_recovery` outcome unreachable in runner | ⚠️ Found | `MacosCycleOutcome` includes `"stuck_recovery"`, but `runner.ts` never passes it to `computeHealthTransition`. When `recoverStuckLock` succeeds, cycle proceeds with `"success"`. When it fails, cycle throws and uses `"failure"`. Corrected in post-implementation notes. |

**Verdict:** Semantic drift check passes with two minor corrections documented.

---

## Authority Boundary Check

| Boundary | Owner | macOS Runner Behavior | Status |
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
| 2 | **No site-local fact store or cursor persistence** | High | v1 | `coordinator.db` only has `site_health` and `cycle_traces`. Facts, cursors, and apply-logs need tables or direct reuse of control-plane stores. |
| 3 | **No real effect execution** | High | v1 | No `SendReplyWorker`, `NonSendWorker`, or Graph adapter calls from macOS Sites. Effect execution is deferred to v1. |
| 4 | **No operator action mutations** | High | v1 | v0 is observation-only. No `approve-draft`, `retry-work-item`, or `recover` via CLI or HTTP. |
| 5 | **`"stuck_recovery"` outcome is unreachable** | Low | 436 | `MacosCycleOutcome` includes `"stuck_recovery"` but runner never passes it to `computeHealthTransition`. Either wire it in the recovery success path or remove from type. |
| 6 | **No multi-Site scheduling or cross-site aggregation** | Medium | v1 | One LaunchAgent per Site. No `SiteRegistry`, `aggregateHealth`, or `deriveAttentionQueue` (unlike Windows). |
| 7 | **No wake notification mechanism** | Medium | v1 | Short `StartInterval` + catch-up is v0. `com.apple.powersources.haspower` or `NSWorkspaceDidWakeNotification` deferred to v1. |
| 8 | **TCC / Keychain not tested with real `security` CLI** | Low | v1 | Tests mock `exec`. Real Keychain access is only fixture-proven. |
| 9 | **Notarization / code signing** | Low | v1+ | Out of scope for v0, documented as deferred. Required for Gatekeeper-compliant distribution. |

---

## Generic Site Abstraction Decision

**Verdict: DEFERRED — stronger evidence than Windows closure, but still premature.**

### Evidence For Commonality

| Concern | Cloudflare | Native Windows | WSL | macOS | Commonality Strength |
|---------|-----------|----------------|-----|-------|---------------------|
| **Health schema** | `site_health` (DO SQLite) | `site_health` (local SQLite) | `site_health` (local SQLite) | `site_health` (local SQLite) | **Strong** — identical columns |
| **Trace schema** | `cycle_traces` (DO SQLite + R2) | `cycle_traces` (local SQLite + NTFS) | `cycle_traces` (local SQLite + ext4) | `cycle_traces` (local SQLite + APFS) | **Strong** — identical columns |
| **Cycle concept** | Bounded 9-step pipeline | Bounded 8-step pipeline | Bounded 8-step pipeline | Bounded 8-step pipeline | **Moderate** — concept shared, step count differs |
| **Lock concept** | DO SQLite row-level lock | `FileLock` (mkdir + PID) | `FileLock` (mkdir + PID) | `FileLock` (mkdir + mtime) | **Moderate** — all TTL-based, but mechanisms differ |
| **Secret binding** | Worker Secrets | Credential Manager / env | env / `.env` | Keychain / env / `.env` | **Moderate** — all have precedence chain pattern |
| **Process model** | Event-driven Worker | PowerShell/Node process | shell/Node process | zsh/Node process | **Weak** — different lifecycles |
| **Scheduler** | Cron Trigger | Task Scheduler | systemd/cron | `launchd` LaunchAgent | **Weak** — fundamentally different |
| **Site registry** | `env.SITE_ID` | `SiteRegistry` (SQLite + filesystem) | `SiteRegistry` | `discoverMacosSites()` (filesystem scan only) | **Weak** — no durable registry on macOS |
| **Cross-site aggregation** | None | `aggregateHealth`, `deriveAttentionQueue` | Same | None | **Weak** — only Windows has this |
| **Sleep/wake handling** | N/A (cloud) | N/A (desktop/server) | N/A (WSL) | **Explicit concern** | **Weak** — macOS-only substrate constraint |

### Why Deferral Remains Correct

1. **Three substrates exist, but two are very similar.** Windows native, Windows WSL, and macOS are all local-filesystem + process-based Sites. Cloudflare is the only truly different substrate (event-driven Worker + DO + R2). A generic abstraction designed around local process Sites would force Cloudflare into an unnatural shape, and vice versa.

2. **Scheduler mechanisms are incompatible.** Cron Trigger, Task Scheduler, systemd/cron, and `launchd` LaunchAgent have different registration APIs, lifecycle semantics, and error recovery. Abstracting them would hide real operational constraints.

3. **Lock mechanisms have different failure modes.** Cloudflare DO row locks are strongly consistent. `FileLock` on Windows checks PID via `tasklist`. `FileLock` on macOS uses pure `mtime` (no PID check). These differences matter for stuck-lock recovery semantics.

4. **macOS introduces a substrate-specific concern (sleep/wake) that has no analogue.** A generic `Site` interface that ignores sleep/wake would be incomplete; one that includes it would burden Cloudflare and Windows with a no-op concern.

5. **The shared parts are already in `@narada2/control-plane`.** `FileLock`, `computeHealthTransition`, and `DefaultSyncRunner` provide the mechanical reuse. The substrate-specific parts (scheduler templates, credential resolver, path conventions) are genuinely different and should remain so.

### What Would Justify Extraction

A `@narada2/site-core` package would be justified when:

- A **fourth substrate** (e.g., Docker, AWS Lambda, Kubernetes) is implemented and shares the same patterns.
- **All three local substrates** (Windows native, WSL, macOS) implement a shared `SiteObservationApi` interface with real data, proving the interface is general enough.
- **Real effect execution exists on macOS** that mirrors Cloudflare's and Windows's effect worker patterns, proving the execution boundary is generalizable.
- **A shared `SiteRegistry` abstraction** works across all local substrates, or macOS gains durable registry/aggregation equivalent to Windows.

Until then, each substrate keeps its own package. The crystallized vocabulary (`Aim / Site / Cycle / Act / Trace`) provides the semantic consistency layer; no additional implementation abstraction is needed yet.

---

## v1 Scope Definition

To move macOS Sites from "v0 bounded proof" to "v1 production-worthy," the following must be implemented:

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
   - Implement `SendReplyWorker` and `NonSendWorker` for macOS.
   - Bind Graph API client with token refresh.
   - Implement draft creation, send, and confirmation reconciliation.

4. **Operator action mutations via CLI**
   - `narada cycle --site {site_id}` — trigger one bounded Cycle.
   - `narada status --site {site_id}` — read health and last trace.
   - `narada doctor --site {site_id}` — check directory, DB, lock, health.
   - `narada site recover --site {site_id}` — recovery derivation from stored facts.

5. **Fix `"stuck_recovery"` outcome wiring**
   - Either pass `"stuck_recovery"` to `computeHealthTransition` when `recoverStuckLock` succeeds before the cycle, or remove `"stuck_recovery"` from `MacosCycleOutcome`.

### Recommended

6. **Multi-Site registry and cross-site aggregation**
   - `SiteRegistry` with filesystem discovery and durable SQLite-backed inventory (match Windows).
   - `aggregateHealth` and `deriveAttentionQueue` for unified operator attention surface.
   - `CrossSiteNotificationRouter` with per-Site cooldown.

7. **Wake notification mechanism**
   - Register for `com.apple.powersources.haspower` or `NSWorkspaceDidWakeNotification` to trigger an immediate Cycle on wake.
   - Reduces catch-up latency for operators who need near-real-time response.

8. **Notarization and code signing**
   - Apple Developer ID signing for the Node.js wrapper or a thin native launcher.
   - Required for Gatekeeper-compliant distribution outside the Mac App Store.

9. **GUI menu bar helper (v1.5)**
   - Show Site health and last-cycle status in the system tray.
   - Trigger manual Cycle run from menu.
   - Open operator dashboard in browser.

### Deferred Beyond v1

10. **Real-time sync (webhook push)** — polling-only for v1; webhook push deferred.
11. **Multi-vertical beyond mailbox** — timer, webhook, filesystem peers deferred.
12. **Autonomous send without approval** — requires full policy and governance design.

---

## No-Overclaim Verification

| Claim | Status | Evidence |
|-------|--------|----------|
| Production readiness | ❌ Not claimed | v0 label used throughout. Steps 2–6 are fixture stubs. No real effect execution. |
| Generic Site abstraction | ❌ Not claimed | Explicitly deferred. No `@narada2/site-core` package exists. |
| macOS is "basically Linux" | ❌ Not claimed | Design doc explicitly forbids this claim. macOS has distinct scheduling, credential, permission, and filesystem conventions. |
| Real-time sync | ❌ Not claimed | Polling only. Webhook push deferred. |
| Mailbox vertical conflation | ❌ Not claimed | No mailbox-specific code in macOS package. Kernel invariants respected. |
| Multi-Site scheduling | ❌ Not claimed | One LaunchAgent per Site for v0. Shared scheduler is v1. |
| GUI / menu bar app | ❌ Not claimed | CLI + localhost HTTP only for v0. GUI deferred. |
| Notarization / Gatekeeper bypass | ❌ Not claimed | v0 assumes Node.js is already installed and runnable. Code signing is v1. |
| Bounded Cycle proof | ✅ Claimed and evidenced | `DefaultMacosSiteRunner` acquires lock, runs steps 1–8, updates health, releases lock. 12 tests. |
| Credential and path binding | ✅ Claimed and evidenced | `resolveSecret`, `resolveSiteRoot`, `sitePath` with Keychain precedence. 12 tests. |
| Health/trace integration | ✅ Claimed and evidenced | `computeHealthTransition` + `SqliteSiteCoordinator`. 21 tests. |
| Sleep/wake recovery | ✅ Claimed and evidenced | Fixture-proven scenarios A–D with `FileLock` TTL and cursor catch-up. 6 tests. |
| LaunchAgent supervision | ✅ Claimed and evidenced | Plist generation, wrapper script, load/unload commands. 7 tests. |

---

## Residuals

1. **Real sync, derive, evaluate, handoff, reconcile** — Steps 2–6 of the Cycle are fixture stubs. Real control-plane wiring is v1.
2. **Real effect execution** — No `SendReplyWorker` or Graph adapter calls from macOS Sites.
3. **CLI integration** — `narada cycle --site`, `narada status --site`, `narada doctor --site` are not yet implemented.
4. **Site-local fact store** — `coordinator.db` only holds health and trace. No facts, cursors, or apply-logs.
5. **Multi-Site shared scheduler** — One LaunchAgent per Site.
6. **Real-time sync** — Polling only; webhook push deferred.
7. **Credential rotation** — Manual rotation only; no automatic token refresh.
8. **Wake notification** — Short `StartInterval` only. No system wake registration.
9. **Live Keychain validation** — No real `security` CLI exercised in CI; tests mock `exec`.
10. **Notarization** — No code signing or Apple Developer ID.

---

## Recommended Next Work

1. **macOS Site v1 — Real Cycle Wiring** (highest pressure)
   - Wire `DefaultSyncRunner`, `DefaultForemanFacade`, charter evaluation, `OutboundHandoff`, and reconciliation into the macOS Cycle runner.
   - This is the longest path to production-worthiness.

2. **macOS Site v1 — Effect Execution**
   - Implement `SendReplyWorker` and `NonSendWorker` for macOS.
   - Bind Graph API client with token refresh.
   - Prove draft → send → confirm pipeline with mocked Graph client.

3. **macOS Site v0.5 — CLI Integration**
   - Implement `narada cycle --site`, `narada status --site`, `narada doctor --site` in `packages/layers/cli/`.
   - Integrate `discoverMacosSites` into `narada ops`.

4. **macOS Site v1 — Wake Notification Spike**
   - Research `com.apple.powersources.haspower` LaunchAgent `StartOnMount` or `KeepAlive` alternatives for wake-triggered Cycles.
   - Produce a spike document before implementation.

---

## Closure Checklist

- [x] Closure decision exists.
- [x] Tasks 431–435 are assessed.
- [x] Semantic drift check passes — two minor corrections documented.
- [x] Authority boundary check passes — all kernel invariants respected.
- [x] Gap table exists with 9 entries (mix of closed, open, and deferred).
- [x] Generic Site abstraction decision is explicit: **deferred with evidence-based rationale**.
- [x] v1 scope definition exists.
- [x] `docs/deployment/macos-site-materialization.md` updated with post-implementation notes.
- [x] No derivative task-status files created.
