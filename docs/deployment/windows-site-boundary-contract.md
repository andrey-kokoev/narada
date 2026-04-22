# Windows Site Boundary Contract

> Actionable boundary contract for Windows Site materializations. Tasks 373–376 implement against this document.
>
> Derived from review of:
> - `docs/deployment/windows-site-materialization.md` (Task 371)
> - `docs/deployment/cloudflare-site-materialization.md` (sibling substrate)
> - `docs/product/unattended-operation-layer.md` (health/lock/recovery semantics)
> - `packages/layers/cli/src/commands/` (existing local Cycle entrypoints)
> - `packages/layers/control-plane/src/` (kernel modules available for reuse)

---

## 1. In-Scope

The Windows Site materialization **must** provide:

| # | Boundary | Native Windows | WSL | Rationale |
|---|----------|---------------|-----|-----------|
| 1 | **Site discovery** | Scan `%LOCALAPPDATA%\Narada\` for site directories | Scan `/var/lib/narada/` or `~/narada/` for site directories | Operator must be able to enumerate Sites without knowing IDs in advance |
| 2 | **Site root resolution** | Resolve `{siteRoot}` from `%LOCALAPPDATA%\Narada\{site_id}` (overridable by `NARADA_SITE_ROOT`) | Resolve `{siteRoot}` from `/var/lib/narada/{site_id}` or `~/narada/{site_id}` (overridable by `NARADA_SITE_ROOT`) | Deterministic, documented path conventions |
| 3 | **Config loading** | Load `config.json` from `{siteRoot}` using existing `loadConfig()` | Same | Reuse kernel config schema; no new config format |
| 4 | **Lock acquisition** | `FileLock` from `@narada2/control-plane` (already cross-platform) | Same | Existing module handles Windows and Unix; no new lock implementation |
| 5 | **Stuck-lock recovery** | TTL comparison on lock metadata + atomic steal | Same | Unattended operation layer §2.2 protocol |
| 6 | **Bounded Cycle runner** | Execute 8-step pipeline (sync → derive → evaluate → handoff → reconcile → trace → health) | Same | Reuse `DefaultSyncRunner` for step 2; remaining steps use existing control-plane stores |
| 7 | **Health transitions** | `computeHealthTransition()` from `@narada2/control-plane/src/health.ts` | Same | Existing state machine implements unattended layer §3 exactly |
| 8 | **Health persistence** | SQLite `site_health` table in `{siteRoot}\coordinator.db` | Same table, POSIX path | DO SQLite on Cloudflare; local SQLite on Windows |
| 9 | **Trace persistence** | SQLite `cycle_traces` table + NTFS `{siteRoot}\traces\` | SQLite table + ext4 `{siteRoot}/traces/` | Compact traces in SQLite; large artifacts on filesystem |
| 10 | **Credential resolution** | Windows Credential Manager → env → `.env` → config | env → `.env` → config | Native uses Credential Manager; WSL uses Linux-native binding |
| 11 | **Supervisor registration** | PowerShell script + Task Scheduler task creation | systemd service/timer template + cron fallback | Native: Windows-native scheduler; WSL: Linux-native scheduler |
| 12 | **Operator status query** | `narada status --site {site_id}` returns health + last cycle | Same CLI surface | Unified CLI across substrates |
| 13 | **Operator diagnosis** | `narada doctor --site {site_id}` checks directory, DB, lock, health | Same CLI surface | Reuse existing `doctor.ts` pattern, site-scoped |
| 14 | **Operator dashboard** | `narada ops` discovers all Sites and summarizes | Same CLI surface | Reuse existing `ops.ts` pattern, extended to site discovery |

## 2. Out-of-Scope

The Windows Site materialization **deliberately does not** provide:

| # | Boundary | Reason |
|---|----------|--------|
| 1 | **Generic Site abstraction** | Deferred to Task 377. Not enough commonality proven yet between Cloudflare, native Windows, and WSL. |
| 2 | **Windows Service wrapper** | Task Scheduler is the v0 scheduler. Running as a true Windows Service requires additional research into service lifecycle, recovery actions, and session 0 isolation. |
| 3 | **Live charter runtime in subprocess** | v0 proves the Cycle can run fixture stubs. Full charter/tool catalog in a subprocess is v1 (same as Cloudflare). |
| 4 | **Multi-Site shared scheduler** | One Task Scheduler task / systemd timer per Site for v0. A single scheduler managing multiple Sites is v1. |
| 5 | **WSL ↔ Windows host interop** | Credential sharing, file sharing, or process signaling across the WSL boundary is v1. Each variant is self-contained in v0. |
| 6 | **Operator mutations via CLI** | `approve-draft`, `retry-work-item` are deferred. v0 is observation-only (`status`, `doctor`, `ops`). |
| 7 | **Real-time sync (webhook push)** | Cron/Task Scheduler polling only for v0. Webhook push replaces polling in v1. |
| 8 | **GUI or tray application** | PowerShell / CLI only for v0. Any graphical surface is out of scope. |
| 9 | **Remote management** | Operator surfaces are local-only. HTTP server is optional and localhost-bound. |

## 3. Authority Boundaries

These boundaries are **invariant** across all substrates. The Windows Site materialization must not violate them.

| Concern | Owner | What the Windows runner may do | What the Windows runner must NOT do |
|---------|-------|-------------------------------|-------------------------------------|
| **Lock** | `FileLock` (kernel) | Call `acquire()` before Cycle; call release after Cycle | Invent a new lock mechanism; bypass TTL expiry |
| **Health** | `computeHealthTransition` (kernel) | Call with cycle outcome; write result to SQLite | Invent new health states; override transition rules |
| **Trace** | Cycle runner (ephemeral) | Append trace records to SQLite and filesystem | Delete or mutate historical traces |
| **Work opening** | Foreman (`DefaultForemanFacade`) | Call `onContextsAdmitted()` or `recoverFromStoredFacts()` | Open work items directly via SQL |
| **Leases** | Scheduler (`SqliteScheduler`) | N/A — Windows v0 does not run a continuous scheduler | Claim or release leases |
| **Decisions** | Foreman (`DefaultForemanFacade`) | Call foreman governance methods | Create `foreman_decision` rows via SQL |
| **Outbound commands** | `OutboundHandoff` | Call `createCommandFromDecision()` | Insert `outbound_handoff` rows directly |
| **Effect execution** | Outbound workers (`SendReplyWorker`, `NonSendWorker`) | N/A — v0 uses fixture stubs | Send email or mutate Graph API directly |
| **Secret resolution** | Credential resolver (new module, Task 375) | Call `resolveSecret(siteId, name, variant)` | Hard-code credentials or read from undocumented locations |

## 4. Interface Contract

### 4.1 Module Boundaries

The Windows Site materialization introduces **one new package** and **reuses existing packages**:

```text
packages/sites/windows/          # NEW — Windows Site runner, supervisor, operator surface
  ├── src/
  │   ├── runner.ts              # WindowsSiteRunner — bounded Cycle entrypoint
  │   ├── supervisor.ts          # WindowsSiteSupervisor — Task Scheduler / systemd registration
  │   ├── operator-surface.ts    # status, doctor, ops query functions
  │   ├── credential-resolver.ts # resolveSecret, resolveSiteRoot
  │   ├── path-utils.ts          # sitePath, ensureSiteDir, siteConfigPath, etc.
  │   ├── types.ts               # WindowsSiteConfig, WindowsSiteVariant, etc.
  │   └── index.ts               # Public exports
  ├── test/
  │   └── fixtures/              # Windows-specific fixtures
  └── package.json

packages/layers/cli/src/         # EXISTING — extended with site-scoped commands
  ├── commands/
  │   ├── cycle.ts               # NEW — narada cycle --site {site_id}
  │   └── site-status.ts         # NEW — narada status --site {site_id}
```

> **Decision**: A single `packages/sites/windows/` package covers both native and WSL variants. The variant is selected at runtime by `detectVariant()` (checks `process.platform` and `WSL_DISTRO_NAME` env). If the package grows too large, extraction into `windows-native` and `windows-wsl` subdirectories happens in v1.

### 4.2 Type Signatures

```typescript
// packages/sites/windows/src/types.ts

/** Detected or declared variant */
export type WindowsSiteVariant = 'native' | 'wsl';

/** Minimal site configuration overlay */
export interface WindowsSiteConfig {
  site_id: string;
  variant: WindowsSiteVariant;
  site_root: string;
  config_path: string;
  cycle_interval_minutes: number;
  lock_ttl_ms: number;
  ceiling_ms: number;
}

/** Cycle outcome for health transition */
export type WindowsCycleOutcome = 'success' | 'failure' | 'auth_failure' | 'stuck_recovery';

/** Result of one bounded Cycle */
export interface WindowsCycleResult {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: 'complete' | 'partial' | 'failed';
  steps_completed: number[];
  error?: string;
}
```

### 4.3 Runner Interface

```typescript
// packages/sites/windows/src/runner.ts

import type { WindowsSiteConfig, WindowsCycleResult } from './types.js';

export interface WindowsSiteRunner {
  /**
   * Execute one bounded Cycle for a Site.
   *
   * 1. Acquire lock via FileLock
   * 2. Sync source deltas via DefaultSyncRunner
   * 3. Derive/admit work via DefaultForemanFacade
   * 4. Evaluate charters (fixture stub in v0)
   * 5. Handoff decisions (fixture stub in v0)
   * 6. Reconcile submitted effects (fixture stub in v0)
   * 7. Update health via computeHealthTransition
   * 8. Append trace to SQLite
   * 9. Release lock
   */
  runCycle(config: WindowsSiteConfig): Promise<WindowsCycleResult>;

  /**
   * Check if a Site's lock is stuck and recover it.
   * Returns true if a stale lock was stolen.
   */
  recoverStuckLock(siteId: string, variant: WindowsSiteVariant): Promise<boolean>;
}
```

### 4.4 Supervisor Interface

```typescript
// packages/sites/windows/src/supervisor.ts

export interface WindowsSiteSupervisor {
  /** Register a scheduled task/timer for a Site. */
  register(siteId: string, variant: WindowsSiteVariant, intervalMinutes: number): Promise<void>;

  /** Unregister the scheduled task/timer for a Site. */
  unregister(siteId: string, variant: WindowsSiteVariant): Promise<void>;

  /** List all registered Sites for this variant. */
  listRegistered(variant: WindowsSiteVariant): Promise<string[]>;
}
```

### 4.5 Operator Surface Interface

```typescript
// packages/sites/windows/src/operator-surface.ts

export interface SiteHealthView {
  site_id: string;
  variant: WindowsSiteVariant;
  status: 'healthy' | 'degraded' | 'critical' | 'auth_failed';
  last_cycle_at: string | null;
  last_cycle_duration_ms: number | null;
  consecutive_failures: number;
  message: string;
}

export interface SiteStatusQuery {
  getSiteHealth(siteId: string, variant: WindowsSiteVariant): Promise<SiteHealthView>;
  getLastCycleTrace(siteId: string, variant: WindowsSiteVariant): Promise<WindowsCycleResult | null>;
  listAllSites(): Promise<Array<{ site_id: string; variant: WindowsSiteVariant; site_root: string }>>;
}

export interface SiteDoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  remediation?: string;
}

export interface SiteDoctorQuery {
  checkSite(siteId: string, variant: WindowsSiteVariant): Promise<SiteDoctorCheck[]>;
}
```

### 4.6 Credential Resolver Interface

```typescript
// packages/sites/windows/src/credential-resolver.ts

export interface CredentialResolver {
  /**
   * Resolve a secret for a Site.
   *
   * Precedence:
   * - Native: Credential Manager → env (`NARADA_{site_id}_{name}`) → `.env` → config
   * - WSL: env → `.env` → config
   */
  resolveSecret(
    siteId: string,
    secretName: string,
    variant: WindowsSiteVariant
  ): string | null;

  /** Resolve the canonical site root directory. */
  resolveSiteRoot(siteId: string, variant: WindowsSiteVariant): string;
}
```

### 4.7 Path Utility Interface

```typescript
// packages/sites/windows/src/path-utils.ts

export interface SitePathResolver {
  sitePath(siteId: string, ...segments: string[]): string;
  ensureSiteDir(siteId: string, variant: WindowsSiteVariant): Promise<void>;
  siteConfigPath(siteId: string, variant: WindowsSiteVariant): string;
  siteDbPath(siteId: string, variant: WindowsSiteVariant): string;
  siteLogsPath(siteId: string, variant: WindowsSiteVariant): string;
  siteTracesPath(siteId: string, variant: WindowsSiteVariant): string;
}
```

## 5. Substrate Comparison

| Concern | Cloudflare | Native Windows | WSL |
|---------|-----------|----------------|-----|
| **Site identity** | `site_id` → DO instance name | `site_id` → directory name under `%LOCALAPPDATA%\Narada\` | `site_id` → directory name under `/var/lib/narada/` |
| **Cycle trigger** | Cron Trigger → Worker | Task Scheduler → PowerShell → Node.js | systemd timer / cron → shell → Node.js |
| **Lock mechanism** | DO SQLite `site_locks` table with `expires_at` | `FileLock` (mkdir-based, cross-platform) | Same `FileLock` |
| **Lock TTL** | `lockTtlMs` in DO row | `staleAfterMs` in `FileLock` metadata | Same |
| **Stuck-lock detection** | `expires_at` wall-clock comparison | `mtimeMs` + `staleAfterMs` + PID check | Same |
| **Coordinator store** | DO SQLite (`SqlStorage`) | `better-sqlite3` file (`Database`) | Same |
| **Health store** | DO SQLite `site_health` | SQLite `site_health` table in coordinator.db | Same |
| **Trace store** | DO SQLite `cycle_traces` + R2 | SQLite `cycle_traces` + NTFS traces/ | SQLite + ext4 traces/ |
| **Secret binding** | Worker Secrets (`NARADA_{site}_{name}`) | Credential Manager (`Narada/{site}/{name}`) or env | env or `.env` |
| **Process model** | Event-driven Worker (stateless) | PowerShell/Node process (stateless) | shell/Node process (stateless) |
| **Operator surface** | HTTP `GET /status` (Cloudflare) | CLI `narada status --site` + optional localhost HTTP | Same CLI |
| **Config loading** | Worker env + secrets | `loadConfig()` from `{siteRoot}\config.json` | Same |
| **Bounded Cycle** | `runCycle()` in Worker | `WindowsSiteRunner.runCycle()` | Same |
| **Restart safety** | DO lock persists across Worker invocations | Filesystem lock persists across process invocations | Same |
| **Health transitions** | `computeHealthTransition()` in Worker | Same function | Same |
| **Notification** | Webhook / log adapter | Same webhook / log adapter | Same |

## 6. Reuse Inventory

### 6.1 Existing Modules — Import and Use Directly

| Module | Location | Reused For |
|--------|----------|------------|
| `FileLock` | `packages/layers/control-plane/src/persistence/lock.ts` | Lock acquisition/release/stuck detection. Already cross-platform (handles Windows via `tasklist` PID check). |
| `DefaultSyncRunner` | `packages/layers/control-plane/src/runner/sync-once.ts` | Step 2 (sync source deltas). Handles cursor, apply-log, projector, lock acquisition, cleanup. |
| `computeHealthTransition` | `packages/layers/control-plane/src/health.ts` | Health state machine. Implements unattended layer §3 exactly. |
| `loadConfig` | `packages/layers/control-plane/src/config/load.ts` | Config loading from `config.json`. No new config format needed. |
| `SqliteCoordinatorStore` | `packages/layers/control-plane/src/coordinator/store.ts` | SQLite-backed coordinator state (work items, evaluations, decisions). |
| `SqliteOutboundStore` | `packages/layers/control-plane/src/outbound/store.ts` | SQLite-backed outbound command state machine. |
| `SqliteFactStore` | `packages/layers/control-plane/src/facts/store.ts` | SQLite-backed fact store for durable canonical boundary. |
| `DefaultForemanFacade` | `packages/layers/control-plane/src/foreman/facade.ts` | Work opening, governance, recovery. |
| `buildGraphTokenProvider` | `packages/layers/control-plane/src/config/token-provider.ts` | Graph API credential resolution. |
| `GraphHttpClient` | `packages/layers/control-plane/src/adapter/graph/client.ts` | Graph API HTTP client. |
| `DefaultGraphAdapter` | `packages/layers/control-plane/src/adapter/graph/adapter.ts` | Graph API adapter for sync. |
| `ExchangeSource` | `packages/layers/control-plane/src/adapter/graph/exchange-source.ts` | Source wrapper for Graph adapter. |

### 6.2 Existing CLI Commands — Extend, Not Rewrite

| Command | Location | Extension For Windows Sites |
|---------|----------|----------------------------|
| `narada sync` | `packages/layers/cli/src/commands/sync.ts` | Add `--site {site_id}` flag that resolves config from site root instead of `--config` path. |
| `narada ops` | `packages/layers/cli/src/commands/ops.ts` | Add site discovery: scan `%LOCALAPPDATA%\Narada\` and `~/narada/` for Sites. |
| `narada doctor` | `packages/layers/cli/src/commands/doctor.ts` | Add `--site {site_id}` flag; replace PID-file checks with lock-file checks for site-scoped runners. |
| `narada status` | `packages/layers/cli/src/commands/status.ts` | Add `--site {site_id}` flag; read from SQLite `site_health` instead of `.health.json`. |
| `narada recover` | `packages/layers/cli/src/commands/recover.ts` | Add `--site {site_id}` flag; resolve `coordinator.db` and `facts.db` from site root. |

### 6.3 New Code — Must Be Written

| Module | Location | Justification |
|--------|----------|---------------|
| `WindowsSiteRunner` | `packages/sites/windows/src/runner.ts` | Orchestrates the 8-step Cycle using kernel modules. No existing orchestrator binds sync + foreman + health + trace in one bounded exit. |
| `WindowsSiteSupervisor` | `packages/sites/windows/src/supervisor.ts` | Task Scheduler and systemd integration are substrate-specific. No existing module handles Windows scheduling. |
| `CredentialResolver` | `packages/sites/windows/src/credential-resolver.ts` | Windows Credential Manager access requires platform-specific code (`child_process` to `cmdkey` or native module). No existing resolver covers this. |
| `SitePathResolver` | `packages/sites/windows/src/path-utils.ts` | Site-scoped path resolution (`%LOCALAPPDATA%` vs `/var/lib/narada`) is new. Existing code uses config-relative paths. |
| `WindowsSiteConfig` loader | `packages/sites/windows/src/config.ts` | Discovers Sites by directory scan rather than by config file path. Existing `loadConfig` takes a path; this takes a site ID. |
| `narada cycle` CLI | `packages/layers/cli/src/commands/cycle.ts` | New command. Does not exist in CLI today. Triggers a single bounded Cycle for a Site. |

## 7. Design Corrections Applied to Task 371 Document

The following corrections were made to `docs/deployment/windows-site-materialization.md` during this review:

### 7.1 Lock Mechanism Correction

**Original (§3.3, §4):** Implied a new SQLite row-level lock would be implemented for Windows.

**Correction:** The existing `FileLock` class from `@narada2/control-plane` already handles Windows (via `tasklist` PID check and `mkdir`-based locking). Windows Sites **must reuse `FileLock`**, not invent a SQLite-based lock. The `FileLock` metadata already contains `acquired_at` and `pid`, satisfying the TTL and stuck-detection requirements.

**Updated text in §3.3:**
> Lock/recovery model: `FileLock` from `@narada2/control-plane` (cross-platform, handles Windows via `tasklist` PID check). Same code for native and WSL.

### 7.2 Health Transition Correction

**Original (§4):** Implied health transitions would be newly implemented.

**Correction:** `computeHealthTransition()` in `packages/layers/control-plane/src/health.ts` already implements the exact unattended operation layer state machine. Windows Sites must call this function, not reimplement it.

**Updated text in §3.3:**
> Health/trace location: SQLite `site_health` table + `cycle_traces` table, populated via `computeHealthTransition()` from `@narada2/control-plane`.

### 7.3 CLI Reuse Clarification

**Original:** Did not explicitly state which CLI commands are reused vs new.

**Correction:** Added explicit mapping in §6.2 showing how existing `sync`, `ops`, `doctor`, `status`, `recover` commands are extended with `--site` flags, and noting that `narada cycle` is a new command.

### 7.4 Package Location Decision

**Original:** Proposed `packages/sites/windows-native/` and `packages/sites/windows-wsl/` as possible locations.

**Correction:** A single `packages/sites/windows/` package is sufficient for v0. Variant selection is runtime (`detectVariant()`). This reduces package sprawl and acknowledges that most code is shared. Extraction into separate packages is a v1 concern if justified by Task 377.

**Updated text in §8:**
> Suggested package location: `packages/sites/windows/` (single package covering both variants).

## 8. Assumptions and Risks

| Assumption | Risk | Mitigation |
|------------|------|------------|
| `FileLock` works reliably on all Windows 11 configurations | Some Windows environments (corporate, sandboxed) may block `mkdir`-based locking or `tasklist` execution | Document `FileBasedLock` as fallback; test in CI if possible |
| Windows Credential Manager is accessible from Node.js | Headless / CI environments lack Credential Manager | Env fallback is mandatory; documented in §4.6 |
| Task Scheduler can invoke PowerShell → Node.js reliably | Execution policy, PATH issues, or antivirus may block | Document prerequisite checks; provide manual invocation path |
| systemd is available in WSL 2 | Some WSL distributions lack systemd; older WSL 1 does not support it | cron fallback is mandatory; documented in Task 374 |
| `better-sqlite3` builds on Windows 11 | Native module compilation may fail without build tools | Document `npm install --build-from-source` or prebuilt binaries |

---

## Cross-References

| Document | Relationship |
|----------|--------------|
| [`docs/deployment/windows-site-materialization.md`](windows-site-materialization.md) | Parent design document; updated with corrections from this contract |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Sibling substrate; comparison reference |
| [`docs/product/unattended-operation-layer.md`](../product/unattended-operation-layer.md) | Health/lock/recovery semantics that Windows must satisfy |
| [`AGENTS.md`](../../AGENTS.md) | Kernel invariants that must not be violated |
| `packages/sites/windows/src/` (proposed) | Implementation location for Tasks 373–376 |
