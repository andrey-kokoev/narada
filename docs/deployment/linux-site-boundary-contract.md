# Linux Site Boundary Contract

> Actionable boundary contract for Linux Site materializations. Tasks 438–441 implement against this document.
>
> Derived from review of:
> - `docs/deployment/linux-site-materialization.md` (Task 429)
> - `docs/deployment/cloudflare-site-materialization.md` (sibling substrate)
> - `docs/deployment/windows-site-materialization.md` and `docs/deployment/windows-site-boundary-contract.md` (sibling substrate)
> - `docs/product/unattended-operation-layer.md` (health/lock/recovery semantics)
> - `packages/layers/cli/src/commands/` (existing local Cycle entrypoints)
> - `packages/layers/control-plane/src/` (kernel modules available for reuse)

---

## 1. In-Scope

The Linux Site materialization **must** provide:

| # | Boundary | System-Mode | User-Mode | Rationale |
|---|----------|-------------|-----------|-----------|
| 1 | **Site discovery** | Scan `/var/lib/narada/` for site directories | Scan `~/.local/share/narada/` for site directories | Operator must be able to enumerate Sites without knowing IDs in advance |
| 2 | **Site root resolution** | Resolve `{siteRoot}` from `/var/lib/narada/{site_id}` (overridable by `NARADA_SITE_ROOT`) | Resolve `{siteRoot}` from `~/.local/share/narada/{site_id}` (overridable by `NARADA_SITE_ROOT`) | Deterministic, documented path conventions |
| 3 | **Config loading** | Load `config.json` from `{siteRoot}` using existing `loadConfig()` | Same | Reuse kernel config schema; no new config format |
| 4 | **Lock acquisition** | `FileLock` from `@narada2/control-plane` (already cross-platform) | Same | Existing module handles Linux; no new lock implementation |
| 5 | **Stuck-lock recovery** | TTL comparison on lock metadata + atomic steal | Same | Unattended operation layer §2.2 protocol |
| 6 | **Bounded Cycle runner** | Execute 8-step pipeline (sync → derive → evaluate → handoff → reconcile → trace → health) | Same | Reuse `DefaultSyncRunner` for step 2; remaining steps use existing control-plane stores |
| 7 | **Health transitions** | `computeHealthTransition()` from `@narada2/control-plane/src/health.ts` | Same | Existing state machine implements unattended layer §3 exactly |
| 8 | **Health persistence** | SQLite `site_health` table in `{siteRoot}/db/coordinator.db` | Same table, XDG path | DO SQLite on Cloudflare; local SQLite on Linux |
| 9 | **Trace persistence** | SQLite `cycle_traces` table + filesystem `{siteRoot}/traces/` | SQLite table + filesystem traces/ | Compact traces in SQLite; large artifacts on filesystem |
| 10 | **Credential resolution** | env → `.env` → config (v0); systemd credentials (v1) | env → `.env` → config (v0); Secret Service / `pass` (v1) | System-mode uses Linux-native secret binding; user-mode uses desktop secret stores |
| 11 | **Supervisor registration** | systemd service/timer unit generation + `systemctl enable` | systemd user service/timer + `systemctl --user enable` | Linux-native scheduler; cron fallback when systemd unavailable |
| 12 | **Operator status query** | `narada status --site {site_id}` returns health + last cycle | Same CLI surface | Unified CLI across substrates |
| 13 | **Operator diagnosis** | `narada doctor --site {site_id}` checks directory, DB, lock, health | Same CLI surface | Reuse existing `doctor.ts` pattern, site-scoped |
| 14 | **Operator dashboard** | `narada ops` discovers all Sites and summarizes | Same CLI surface | Reuse existing `ops.ts` pattern, extended to site discovery |

## 2. Out-of-Scope

The Linux Site materialization **deliberately does not** provide:

| # | Boundary | Reason |
|---|----------|--------|
| 1 | **Generic Site abstraction** | Deferred to Task 442. Not enough commonality proven yet between Cloudflare, Windows, and Linux. |
| 2 | **Container-hosted Linux Site** | Explicitly deferred to a separate chapter. Do not smear Docker/Kubernetes into native Linux materialization. |
| 3 | **Full charter runtime in subprocess** | v0 proves the Cycle can run fixture stubs. Full charter/tool catalog in a subprocess is v1. |
| 4 | **Multi-Site shared scheduler** | One systemd timer per Site for v0. A single scheduler managing multiple Sites is v1. |
| 5 | **Operator mutations via CLI** | `approve-draft`, `retry-work-item` are deferred. v0 is observation-only (`status`, `doctor`, `ops`). |
| 6 | **Real-time sync (webhook push)** | systemd timer polling only for v0. Webhook push replaces polling in v1. |
| 7 | **systemd credential loading (`LoadCredential=`)** | v1 enhancement for system-mode secret injection. |
| 8 | **Secret Service / `libsecret` / `pass` integration** | v1 enhancement for user-mode secret storage. |
| 9 | **Full service hardening** | v0 uses `NoNewPrivileges` + `PrivateTmp`. Full `ProtectSystem=strict` etc. is v1. |
| 10 | **Package manager integration** | deb/rpm/pacman packaging is v1. v0 uses tarball or manual install. |

## 3. Authority Boundaries

These boundaries are **invariant** across all substrates. The Linux Site materialization must not violate them.

| Concern | Owner | What the Linux runner may do | What the Linux runner must NOT do |
|---------|-------|------------------------------|-----------------------------------|
| **Lock** | `FileLock` (kernel) | Call `acquire()` before Cycle; call release after Cycle | Invent a new lock mechanism; bypass TTL expiry |
| **Health** | `computeHealthTransition` (kernel) | Call with cycle outcome; write result to SQLite | Invent new health states; override transition rules |
| **Trace** | Cycle runner (ephemeral) | Append trace records to SQLite and filesystem | Delete or mutate historical traces |
| **Work opening** | Foreman (`DefaultForemanFacade`) | Call `onContextsAdmitted()` or `recoverFromStoredFacts()` | Open work items directly via SQL |
| **Leases** | Scheduler (`SqliteScheduler`) | N/A — Linux v0 does not run a continuous scheduler | Claim or release leases |
| **Decisions** | Foreman (`DefaultForemanFacade`) | Call foreman governance methods | Create `foreman_decision` rows via SQL |
| **Outbound commands** | `OutboundHandoff` | Call `createCommandFromDecision()` | Insert `outbound_handoff` rows directly |
| **Effect execution** | Outbound workers (`SendReplyWorker`, `NonSendWorker`) | N/A — v0 uses fixture stubs | Send email or mutate Graph API directly |
| **Secret resolution** | Credential resolver (new module, Task 439) | Call `resolveSecret(siteId, mode, name)` | Hard-code credentials or read from undocumented locations |

## 4. Interface Contract

### 4.1 Module Boundaries

The Linux Site materialization introduces **one new package** and **reuses existing packages**:

```text
packages/sites/linux/              # NEW — Linux Site runner, supervisor, operator surface
  ├── src/
  │   ├── runner.ts                # LinuxSiteRunner — bounded Cycle entrypoint
  │   ├── supervisor.ts            # LinuxSiteSupervisor — systemd unit/timer generation
  │   ├── observability.ts         # status, doctor, ops query functions
  │   ├── credentials.ts           # resolveSecret, resolveSiteRoot
  │   ├── path-utils.ts            # sitePath, ensureSiteDir, siteConfigPath, etc.
  │   ├── types.ts                 # LinuxSiteMode, LinuxSiteConfig, etc.
  │   └── index.ts                 # Public exports
  ├── test/
  │   └── fixtures/                # Linux-specific fixtures
  └── package.json

packages/layers/cli/src/         # EXISTING — extended with site-scoped commands
  ├── commands/
  │   ├── cycle.ts               # NEW/EXTENDED — narada cycle --site {site_id}
  │   └── site-status.ts         # NEW/EXTENDED — narada status --site {site_id}
```

> **Decision**: A single `packages/sites/linux/` package covers both system-mode and user-mode. The mode is selected at runtime by `detectMode()` (checks `EUID`, `systemctl` availability, or explicit config). If the package grows too large, extraction into `linux-system/` and `linux-user/` subdirectories happens in v1.

### 4.2 Type Signatures

```typescript
// packages/sites/linux/src/types.ts

/** Deployment mode for a Linux Site */
export type LinuxSiteMode = "system" | "user";

/** Minimal site configuration overlay */
export interface LinuxSiteConfig {
  site_id: string;
  mode: LinuxSiteMode;
  site_root: string;
  config_path: string;
  cycle_interval_minutes: number;
  lock_ttl_ms: number;
  ceiling_ms: number;
}

/** Cycle outcome for health transition */
export type LinuxCycleOutcome = "success" | "failure" | "auth_failure" | "stuck_recovery";

/** Result of one bounded Cycle */
export interface LinuxCycleResult {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: "complete" | "partial" | "failed";
  steps_completed: number[];
  error?: string;
}
```

### 4.3 Runner Interface

```typescript
// packages/sites/linux/src/runner.ts

import type { LinuxSiteConfig, LinuxCycleResult } from "./types.js";

export interface LinuxSiteRunner {
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
  runCycle(config: LinuxSiteConfig): Promise<LinuxCycleResult>;

  /**
   * Check if a Site's lock is stuck and recover it.
   * Returns true if a stale lock was stolen.
   */
  recoverStuckLock(siteId: string, mode: LinuxSiteMode): Promise<boolean>;
}
```

### 4.4 Supervisor Interface

```typescript
// packages/sites/linux/src/supervisor.ts

export interface LinuxSiteSupervisor {
  /** Register a systemd service/timer for a Site. */
  register(siteId: string, mode: LinuxSiteMode, intervalMinutes: number): Promise<void>;

  /** Unregister the systemd service/timer for a Site. */
  unregister(siteId: string, mode: LinuxSiteMode): Promise<void>;

  /** List all registered Sites for this mode. */
  listRegistered(mode: LinuxSiteMode): Promise<string[]>;
}

/** Generate systemd unit file content without writing to disk. */
export function generateSystemdService(config: LinuxSiteConfig): string;
export function generateSystemdTimer(config: LinuxSiteConfig): string;

/** Generate a cron fallback entry. */
export function generateCronEntry(config: LinuxSiteConfig): string;
```

### 4.5 Operator Surface Interface

```typescript
// packages/sites/linux/src/observability.ts

export interface SiteHealthView {
  site_id: string;
  mode: LinuxSiteMode;
  status: "healthy" | "degraded" | "critical" | "auth_failed";
  last_cycle_at: string | null;
  last_cycle_duration_ms: number | null;
  consecutive_failures: number;
  message: string;
}

export interface SiteStatusQuery {
  getSiteHealth(siteId: string, mode: LinuxSiteMode): Promise<SiteHealthView>;
  getLastCycleTrace(siteId: string, mode: LinuxSiteMode): Promise<LinuxCycleResult | null>;
  listAllSites(): Promise<Array<{ site_id: string; mode: LinuxSiteMode; site_root: string }>>;
}

export interface SiteDoctorCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  remediation?: string;
}

export interface SiteDoctorQuery {
  checkSite(siteId: string, mode: LinuxSiteMode): Promise<SiteDoctorCheck[]>;
}
```

### 4.6 Credential Resolver Interface

```typescript
// packages/sites/linux/src/credentials.ts

export interface LinuxCredentialResolver {
  /**
   * Resolve a secret for a Site.
   *
   * Precedence:
   * - System-mode (v0): env (`NARADA_{site_id}_{name}`) → `.env` → config
   * - User-mode (v0): env → `.env` → config
   * - System-mode (v1): systemd credentials → env → `.env` → config
   * - User-mode (v1): Secret Service → pass → env → `.env` → config
   */
  resolveSecret(siteId: string, mode: LinuxSiteMode, secretName: string): string | null;

  /** Resolve the canonical site root directory. */
  resolveSiteRoot(siteId: string, mode: LinuxSiteMode): string;
}
```

### 4.7 Path Utility Interface

```typescript
// packages/sites/linux/src/path-utils.ts

export interface LinuxSitePathResolver {
  sitePath(siteId: string, mode: LinuxSiteMode, ...segments: string[]): string;
  ensureSiteDir(siteId: string, mode: LinuxSiteMode): Promise<void>;
  siteConfigPath(siteId: string, mode: LinuxSiteMode): string;
  siteDbPath(siteId: string, mode: LinuxSiteMode): string;
  siteLogsPath(siteId: string, mode: LinuxSiteMode): string;
  siteTracesPath(siteId: string, mode: LinuxSiteMode): string;
  siteRuntimePath(siteId: string, mode: LinuxSiteMode): string;
}
```

## 5. Substrate Comparison

| Concern | Cloudflare | Native Windows | WSL | Linux System | Linux User |
|---------|-----------|----------------|-----|--------------|------------|
| **Site identity** | `site_id` → DO instance name | `site_id` → directory under `%LOCALAPPDATA%\Narada\` | `site_id` → directory under `/var/lib/narada/` | `site_id` → directory under `/var/lib/narada/` | `site_id` → directory under `~/.local/share/narada/` |
| **Cycle trigger** | Cron Trigger → Worker | Task Scheduler → PowerShell → Node.js | systemd timer / cron → shell → Node.js | systemd system timer → `Type=oneshot` service → Node.js | systemd user timer → `Type=oneshot` service → Node.js |
| **Lock mechanism** | DO SQLite `site_locks` | `FileLock` (mkdir-based) | `FileLock` | `FileLock` | `FileLock` |
| **Lock TTL** | `lockTtlMs` in DO row | `staleAfterMs` in `FileLock` metadata | Same | Same | Same |
| **Stuck-lock detection** | `expires_at` wall-clock comparison | `mtimeMs` + `staleAfterMs` + PID check | Same | Same | Same |
| **Coordinator store** | DO SQLite | `better-sqlite3` file | `better-sqlite3` file | `better-sqlite3` file | `better-sqlite3` file |
| **Health store** | DO SQLite `site_health` | SQLite `site_health` | SQLite `site_health` | SQLite `site_health` | SQLite `site_health` |
| **Trace store** | DO SQLite + R2 | SQLite + NTFS | SQLite + ext4 | SQLite + ext4/btrfs/xfs | SQLite + ext4/btrfs/xfs |
| **Secret binding** | Worker Secrets | Credential Manager or env | env or `.env` | env or `.env` (v0); systemd credentials (v1) | env or `.env` (v0); Secret Service / `pass` (v1) |
| **Process model** | Event-driven Worker | PowerShell/Node process | shell/Node process | Node.js under systemd | Node.js under `systemd --user` |
| **Operator surface** | HTTP `GET /status` | CLI + optional localhost HTTP | Same CLI | Same CLI | Same CLI |
| **Config loading** | Worker env + secrets | `loadConfig()` from `{siteRoot}\config.json` | Same | Same | Same |
| **Bounded Cycle** | `runCycle()` in Worker | `WindowsSiteRunner.runCycle()` | Same | `LinuxSiteRunner.runCycle()` | Same |
| **Restart safety** | DO lock persists across Workers | Filesystem lock persists across processes | Same | Same | Same |
| **Health transitions** | `computeHealthTransition()` | Same | Same | Same | Same |
| **Notification** | Webhook / log adapter | Same webhook / log adapter | Same | Same | Same |
| **journald/logs** | Worker Logs | Event Log / log file | journald (if available) | journald primary, file fallback | journald (user journal), file fallback |
| **Service hardening** | Sandbox resource limits | N/A (v0) | N/A (v0) | `NoNewPrivileges`, `PrivateTmp` (v0) | Same (v0) |

## 6. Reuse Inventory

### 6.1 Existing Modules — Import and Use Directly

| Module | Location | Reused For |
|--------|----------|------------|
| `FileLock` | `packages/layers/control-plane/src/persistence/lock.ts` | Lock acquisition/release/stuck detection. Already cross-platform. |
| `DefaultSyncRunner` | `packages/layers/control-plane/src/runner/sync-once.ts` | Step 2 (sync source deltas). Handles cursor, apply-log, projector, lock acquisition, cleanup. |
| `computeHealthTransition` | `packages/layers/control-plane/src/health.ts` | Health state machine. Implements unattended layer §3 exactly. |
| `loadConfig` | `packages/layers/control-plane/src/config/load.ts` | Config loading from `config.json`. No new config format needed. |
| `SqliteCoordinatorStore` | `packages/layers/control-plane/src/coordinator/store.ts` | SQLite-backed coordinator state. |
| `SqliteOutboundStore` | `packages/layers/control-plane/src/outbound/store.ts` | SQLite-backed outbound command state machine. |
| `SqliteFactStore` | `packages/layers/control-plane/src/facts/store.ts` | SQLite-backed fact store. |
| `DefaultForemanFacade` | `packages/layers/control-plane/src/foreman/facade.ts` | Work opening, governance, recovery. |
| `buildGraphTokenProvider` | `packages/layers/control-plane/src/config/token-provider.ts` | Graph API credential resolution. |

### 6.2 Existing CLI Commands — Extend, Not Rewrite

| Command | Location | Extension For Linux Sites |
|---------|----------|---------------------------|
| `narada sync` | `packages/layers/cli/src/commands/sync.ts` | Add `--site {site_id}` flag that resolves config from site root. |
| `narada ops` | `packages/layers/cli/src/commands/ops.ts` | Add site discovery: scan `/var/lib/narada/` and `~/.local/share/narada/`. |
| `narada doctor` | `packages/layers/cli/src/commands/doctor.ts` | Add `--site {site_id}` flag; replace PID-file checks with lock-file checks. |
| `narada status` | `packages/layers/cli/src/commands/status.ts` | Add `--site {site_id}` flag; read from SQLite `site_health`. |
| `narada recover` | `packages/layers/cli/src/commands/recover.ts` | Add `--site {site_id}` flag; resolve `coordinator.db` from site root. |

### 6.3 New Code — Must Be Written

| Module | Location | Justification |
|--------|----------|---------------|
| `LinuxSiteRunner` | `packages/sites/linux/src/runner.ts` | Orchestrates the 8-step Cycle using kernel modules. No existing orchestrator binds sync + foreman + health + trace in one bounded exit for Linux. |
| `LinuxSiteSupervisor` | `packages/sites/linux/src/supervisor.ts` | systemd unit/timer generation is substrate-specific. No existing module handles Linux scheduling. |
| `LinuxCredentialResolver` | `packages/sites/linux/src/credentials.ts` | Linux-specific secret precedence and path resolution. |
| `LinuxSitePathResolver` | `packages/sites/linux/src/path-utils.ts` | Site-scoped path resolution (`/var/lib` vs `~/.local/share`) is new. |
| `LinuxSiteConfig` loader | `packages/sites/linux/src/config.ts` | Discovers Sites by directory scan rather than by config file path. |
| `narada cycle` CLI | `packages/layers/cli/src/commands/cycle.ts` | New command. Triggers a single bounded Cycle for a Site. |

## 7. Design Corrections Applied to Task 429 Document

The following corrections were made to `docs/deployment/linux-site-materialization.md` during this review:

### 7.1 Lock Mechanism Confirmation

**Review finding:** The design doc correctly identified `FileLock` as the lock mechanism. This is confirmed correct — no new lock implementation is needed.

**No correction required.**

### 7.2 Health Transition Confirmation

**Review finding:** The design doc correctly identified `computeHealthTransition()` as the health state machine. This is confirmed correct — no new health transition logic is needed.

**No correction required.**

### 7.3 CLI Reuse Clarification

**Original:** Did not explicitly state which CLI commands are reused vs new.

**Correction:** Added explicit mapping in §6.2 showing how existing `sync`, `ops`, `doctor`, `status`, `recover` commands are extended with `--site` flags, and noting that `narada cycle` is a new command.

### 7.4 Package Location Decision

**Original:** Proposed `packages/sites/linux/` as the implementation location.

**Correction:** Confirmed. A single `packages/sites/linux/` package covers both system-mode and user-mode. Mode selection is runtime (`detectMode()`). Extraction into separate packages is a v1 concern if justified by Task 442.

### 7.5 Runtime Directory Clarification

**Original:** Suggested `/run/narada/{site_id}` for system-mode runtime state.

**Correction:** Added clarification that `RuntimeDirectory=` in systemd units automatically creates and cleans up `/run/narada/{site_id}`. For user-mode, the runtime path is `/run/user/$(id - u)/narada/{site_id}`.

### 7.6 Cron Fallback Scope

**Original:** Listed cron fallback as a Linux-specific concern.

**Correction:** Confirmed cron fallback is in scope for v0. It is the only alternative scheduler path when systemd is unavailable. Added to §2 out-of-scope table to clarify that full cron-based operation (without systemd at all) is not the primary target, but the fallback mechanism is in scope.

## 8. Assumptions and Risks

| Assumption | Risk | Mitigation |
|------------|------|------------|
| `FileLock` works reliably on all Linux configurations | Some containerized or restricted environments may block `mkdir`-based locking | Document `FileBasedLock` as fallback; test in CI if possible |
| `systemd` is available on target systems | Minimal containers, WSL without systemd, or old systems lack it | Cron fallback is mandatory; documented in §4.4 |
| `better-sqlite3` builds on target Linux distributions | Native module compilation may fail without build tools | Document `npm install --build-from-source` or prebuilt binaries |
| User-mode systemd persists after logout | Without `loginctl enable-linger`, user services stop on logout | Document prerequisite; system-mode is recommended for headless servers |
| Node.js is available in systemd unit `ExecStart` | PATH may not include Node.js in minimal environments | Use absolute path or `/usr/bin/env node` with documented prerequisites |

---

## Cross-References

| Document | Relationship |
|----------|--------------|
| [`docs/deployment/linux-site-materialization.md`](linux-site-materialization.md) | Parent design document; validated by this contract |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Sibling substrate; comparison reference |
| [`docs/deployment/windows-site-materialization.md`](windows-site-materialization.md) | Sibling substrate; reuse pattern reference |
| [`docs/deployment/windows-site-boundary-contract.md`](windows-site-boundary-contract.md) | Boundary contract pattern — this document follows the same structure |
| [`docs/product/unattended-operation-layer.md`](../product/unattended-operation-layer.md) | Health/lock/recovery semantics that Linux must satisfy |
| [`AGENTS.md`](../../AGENTS.md) | Kernel invariants that must not be violated |
| `packages/sites/linux/src/` (proposed) | Implementation location for Tasks 438–441 |
