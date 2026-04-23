# macOS Site Boundary Contract

> Actionable boundary contract for macOS Site materializations. Tasks 432–435 implement against this document.
>
> Derived from review of:
> - `docs/deployment/macos-site-materialization.md` (Task 428)
> - `docs/deployment/cloudflare-site-materialization.md` (sibling substrate)
> - `docs/deployment/windows-site-materialization.md` (sibling substrate)
> - `docs/product/unattended-operation-layer.md` (health/lock/recovery semantics)
> - `packages/layers/cli/src/commands/cycle.ts`, `status.ts`, `doctor.ts` (existing CLI integration)
> - `packages/sites/macos/src/` (actual implementation package)

---

## 1. In-Scope

The macOS Site materialization **must** provide:

| # | Boundary | Implementation | Rationale |
|---|----------|---------------|-----------|
| 1 | **Site discovery** | `discoverMacosSites()` scans `~/Library/Application Support/Narada/*` for directories containing `db/coordinator.db` | Operator must enumerate Sites without knowing IDs in advance |
| 2 | **Site root resolution** | `resolveSiteRoot(siteId)` → `~/Library/Application Support/Narada/{site_id}`; overridable by `NARADA_SITE_ROOT` | Deterministic, documented path conventions per Apple File System Layout Guidelines |
| 3 | **Config loading** | `runCycle()` reads `config.json` from `{siteRoot}` using existing `loadConfig()` semantics | Reuse kernel config schema; no new config format |
| 4 | **Lock acquisition** | `FileLock` from `@narada2/control-plane` (already cross-platform, Unix via `mkdir`-based locking with `mtime` stale detection) | Existing module handles Unix locking; no new lock implementation |
| 5 | **Stuck-lock recovery** | `recoverStuckLock()` compares lock `mtimeMs` against `lockTtlMs`; removes stale lock directory atomically | Unattended operation layer §2.2 protocol |
| 6 | **Bounded Cycle runner** | `DefaultMacosSiteRunner.runCycle()` executes 8-step pipeline with wall-clock ceiling and abort buffer | Fixture stubs for steps 2–6 in v0; preserves IAS boundaries |
| 7 | **Health transitions** | `computeHealthTransition()` from `@narada2/control-plane` | Existing state machine implements unattended layer §3 exactly |
| 8 | **Health persistence** | SQLite `site_health` table in `{siteRoot}/db/coordinator.db` via `SqliteSiteCoordinator` | Compact traces in SQLite; large artifacts on APFS |
| 9 | **Trace persistence** | SQLite `cycle_traces` table + APFS `{siteRoot}/traces/` via `writeTraceArtifact()` | Same pattern as Windows/Cloudflare |
| 10 | **Credential resolution** | macOS Keychain (`security` CLI) → env (`NARADA_{site_id}_{name}`) → `.env` → config | macOS-native secret binding with graceful fallback chain |
| 11 | **Supervisor registration** | `writeLaunchAgentFiles()` generates plist + zsh wrapper script; `launchctl load/unload` commands | macOS-native `launchd` LaunchAgent scheduling |
| 12 | **Operator status query** | `getMacosSiteStatus()` returns health + last trace; CLI `narada status --site {site_id}` routes to it | Unified CLI across substrates |
| 13 | **Operator diagnosis** | `narada doctor --site {site_id}` checks directory, DB, lock freshness, LaunchAgent registration, health, cycle freshness | Reuse existing `doctor.ts` pattern, site-scoped |
| 14 | **TCC setup helper** | `setupKeychainAccess()` triggers interactive TCC permission prompt before LaunchAgent activation | Prevents silent Keychain failures from background agents |

---

## 2. Out-of-Scope

The macOS Site materialization **deliberately does not** provide:

| # | Boundary | Reason |
|---|----------|--------|
| 1 | **Generic Site abstraction** | Deferred to Task 436. Not enough commonality proven yet between Cloudflare, Windows native, Windows WSL, Linux, and macOS. |
| 2 | **Full charter runtime in subprocess** | v0 proves the Cycle can run fixture stubs. Full charter/tool catalog in a subprocess is v1 (same as Cloudflare and Windows). |
| 3 | **Multi-Site shared scheduler** | One LaunchAgent plist per Site for v0. A single scheduler managing multiple Sites is v1. |
| 4 | **Operator mutations via CLI/HTTP** | `approve-draft`, `retry-work-item` are deferred. v0 is observation-only (`status`, `doctor`, `cycle`). |
| 5 | **Real-time sync (webhook push)** | `launchd` interval polling only for v0. Webhook push replaces polling in v1. |
| 6 | **GUI or menu bar app** | CLI + localhost HTTP only for v0. Any graphical surface is out of scope. |
| 7 | **Notarization / Gatekeeper bypass** | v0 assumes Node.js is already installed and runnable. Code signing is v1. |
| 8 | **Cross-site aggregation** | Unlike Windows (Tasks 380–381), macOS v0 has no `SiteRegistry`, `aggregateHealth`, or `deriveAttentionQueue`. Port from Windows in v1 if justified. |
| 9 | **Continuous scheduler / lease management** | macOS v0 does not run a continuous scheduler. `SqliteScheduler` leasing is not active. |
| 10 | **Live effect execution** | Outbound workers (`SendReplyWorker`, `NonSendWorker`) are not wired in v0. Effect execution is fixture-only. |

---

## 3. Authority Boundaries

These boundaries are **invariant** across all substrates. The macOS Site materialization must not violate them.

| Concern | Owner | What the macOS runner may do | What the macOS runner must NOT do |
|---------|-------|-----------------------------|-----------------------------------|
| **Lock** | `FileLock` (kernel) | Call `acquire()` before Cycle; call release after Cycle | Invent a new lock mechanism; bypass TTL expiry |
| **Health** | `computeHealthTransition` (kernel) | Call with cycle outcome; write result to SQLite via `SqliteSiteCoordinator` | Invent new health states; override transition rules |
| **Trace** | Cycle runner (ephemeral) | Append trace records to SQLite and APFS via `appendCycleTrace()` / `writeTraceArtifact()` | Delete or mutate historical traces |
| **Work opening** | Foreman (`DefaultForemanFacade`) | Call `onContextsAdmitted()` or `recoverFromStoredFacts()` in v1 | Open work items directly via SQL |
| **Leases** | Scheduler (`SqliteScheduler`) | N/A — macOS v0 does not run a continuous scheduler | Claim or release leases |
| **Decisions** | Foreman (`DefaultForemanFacade`) | Call foreman governance methods in v1 | Create `foreman_decision` rows via SQL |
| **Outbound commands** | `OutboundHandoff` | Call `createCommandFromDecision()` in v1 | Insert `outbound_handoff` rows directly |
| **Effect execution** | Outbound workers | N/A — v0 uses fixture stubs | Send email or mutate Graph API directly |
| **Secret resolution** | Credential resolver (`credentials.ts`) | Call `resolveSecret(siteId, name)` or `resolveSecretRequired()` | Hard-code credentials or read from undocumented locations |

---

## 4. Interface Contract

### 4.1 Module Boundaries

The macOS Site materialization is implemented as **one package** reusing existing packages:

```text
packages/sites/macos/              # macOS Site runner, supervisor, operator surface
  ├── src/
  │   ├── runner.ts                # DefaultMacosSiteRunner — bounded Cycle entrypoint
  │   ├── supervisor.ts            # LaunchAgent plist / wrapper script generation
  │   ├── credentials.ts           # Keychain → env → .env → config secret resolution
  │   ├── path-utils.ts            # sitePath, ensureSiteDir, resolveSiteRoot, etc.
  │   ├── coordinator.ts           # SqliteSiteCoordinator — site-local SQLite schema
  │   ├── health.ts                # writeHealthRecord, readHealthRecord
  │   ├── observability.ts         # getMacosSiteStatus, discoverMacosSites, getSiteSummary
  │   ├── trace.ts                 # appendCycleTrace, writeTraceArtifact
  │   ├── types.ts                 # MacosSiteConfig, MacosCycleResult, SiteHealthRecord
  │   └── index.ts                 # Public exports + runCycle() convenience entrypoint
  ├── test/
  │   ├── unit/                    # Module-level unit tests
  │   │   ├── runner.test.ts
  │   │   ├── supervisor.test.ts
  │   │   ├── credentials.test.ts
  │   │   ├── path-utils.test.ts
  │   │   ├── health.test.ts
  │   │   ├── observability.test.ts
  │   │   └── trace.test.ts
  │   ├── fixtures/                # Test fixtures
  │   └── sleep-wake-recovery.test.ts  # Sleep/wake fixture proving (Task 435)
  ├── package.json
  └── tsconfig.json

packages/layers/cli/src/           # EXISTING — already integrates macOS Sites
  ├── commands/
  │   ├── cycle.ts                 # Routes to runCycle() for macOS Sites
  │   ├── status.ts                # Routes to getMacosSiteStatus()
  │   └── doctor.ts                # macOS-specific checks (lock, LaunchAgent, cycle freshness)
```

> **Decision**: The package already exists at `packages/sites/macos/`. It was created during Tasks 428–430 (chapter shaping and spike). This contract validates and tightens the existing implementation into the canonical reference for Tasks 432–435.

### 4.2 Type Signatures

```typescript
// packages/sites/macos/src/types.ts

/** Resolved site configuration. */
export interface MacosSiteConfig {
  site_id: string;
  site_root: string;
  config_path: string;
  cycle_interval_minutes: number;
  lock_ttl_ms: number;
  ceiling_ms: number;
}

/** Cycle outcome for health transitions. */
export type MacosCycleOutcome = "success" | "failure" | "auth_failure" | "stuck_recovery";

/** Result of one bounded Cycle. */
export interface MacosCycleResult {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: "complete" | "partial" | "failed";
  steps_completed: number[];
  error?: string;
}

/** Health record stored in SQLite. */
export interface SiteHealthRecord {
  site_id: string;
  status: "healthy" | "degraded" | "critical" | "auth_failed" | "stale" | "error" | "stopped";
  last_cycle_at: string | null;
  last_cycle_duration_ms: number | null;
  consecutive_failures: number;
  message: string;
  updated_at: string;
}

/** Trace record stored in SQLite. */
export interface CycleTraceRecord {
  cycle_id: string;
  site_id: string;
  started_at: string;
  finished_at: string;
  status: MacosCycleResult["status"];
  steps_completed: number[];
  error: string | null;
}
```

### 4.3 Runner Interface

```typescript
// packages/sites/macos/src/runner.ts

export interface CycleConfig {
  ceilingMs: number;
  abortBufferMs: number;
  lockTtlMs: number;
}

export interface CycleRunOptions {
  /** Fixture deltas for step-2 sync (test path). */
  fixtureDeltas?: unknown[];
}

export interface MacosSiteRunner {
  /**
   * Execute one bounded Cycle for a Site.
   *
   * 1. Acquire lock via FileLock
   * 2. Sync source deltas (fixture stub in v0)
   * 3. Derive/admit work (fixture stub in v0)
   * 4. Evaluate charters (fixture stub in v0)
   * 5. Handoff decisions (fixture stub in v0)
   * 6. Reconcile submitted effects (fixture stub in v0)
   * 7. Update health via computeHealthTransition
   * 8. Append trace to SQLite
   * 9. Release lock
   */
  runCycle(config: MacosSiteConfig, options?: CycleRunOptions): Promise<MacosCycleResult>;

  /**
   * Check if a Site's lock is stuck and recover it.
   * Returns true if a stale lock was removed.
   */
  recoverStuckLock(siteId: string): Promise<boolean>;
}

export class DefaultMacosSiteRunner implements MacosSiteRunner {
  constructor(config?: Partial<CycleConfig>);
  runCycle(config: MacosSiteConfig, options?: CycleRunOptions): Promise<MacosCycleResult>;
  recoverStuckLock(siteId: string): Promise<boolean>;
}
```

### 4.4 Supervisor Interface

```typescript
// packages/sites/macos/src/supervisor.ts

export interface LaunchAgentPaths {
  plistPath: string;
  scriptPath: string;
}

/** Generate a launchd LaunchAgent plist XML for a macOS Site. */
export function generateLaunchAgentPlist(
  config: MacosSiteConfig,
  nodePath: string,
  scriptPath: string,
): string;

/** Generate a zsh wrapper script that invokes the Cycle runner. */
export function generateWrapperScript(
  siteRoot: string,
  nodePath: string,
  siteId: string,
): string;

/** Write the LaunchAgent plist and wrapper script to disk. */
export function writeLaunchAgentFiles(
  config: MacosSiteConfig,
  nodePath?: string,
): Promise<LaunchAgentPaths>;

/** Generate shell command to load the LaunchAgent. */
export function generateLoadCommand(siteId: string): string;

/** Generate shell command to unload the LaunchAgent. */
export function generateUnloadCommand(siteId: string): string;

/** Generate shell command to check if the LaunchAgent is loaded. */
export function generateStatusCommand(siteId: string): string;
```

### 4.5 Credential Resolver Interface

```typescript
// packages/sites/macos/src/credentials.ts

export interface ResolveSecretOptions {
  configValue?: string | null;
  envFilePath?: string;
}

/** Build the environment variable name for a secret. */
export function envVarName(siteId: string, secretName: string): string;

/** Build the macOS Keychain service name for a secret. */
export function keychainServiceName(siteId: string, secretName: string): string;

/**
 * Resolve a secret using the macOS precedence chain:
 *   1. macOS Keychain (`security find-generic-password`)
 *   2. Environment variable (`NARADA_{SITE_ID}_{SECRET_NAME}`)
 *   3. `.env` file in site root
 *   4. Config file value (passed as options.configValue)
 */
export function resolveSecret(
  siteId: string,
  secretName: string,
  options?: ResolveSecretOptions,
): Promise<string | null>;

/** Resolve a secret, throwing if not found. */
export function resolveSecretRequired(
  siteId: string,
  secretName: string,
  options?: ResolveSecretOptions,
): Promise<string>;

/** Trigger a TCC permission prompt interactively for Keychain access. */
export function setupKeychainAccess(siteId: string): Promise<boolean>;
```

### 4.6 Path Utility Interface

```typescript
// packages/sites/macos/src/path-utils.ts

/** Standard subdirectories created inside a site root. */
export const SITE_SUBDIRECTORIES: readonly string[];

/** Resolve canonical site root: ~/Library/Application Support/Narada/{site_id} */
export function resolveSiteRoot(siteId: string, envOverride?: string): string;

/** Build a path inside a site directory (siteId-based). */
export function sitePath(siteId: string, ...segments: string[]): string;

/** Build a path inside a site directory (siteRoot-based). */
export function sitePathFromRoot(siteRoot: string, ...segments: string[]): string;

/** Ensure site directory and standard subdirectories exist. */
export function ensureSiteDir(siteId: string): Promise<void>;

export function siteConfigPath(siteId: string): string;
export function siteDbPath(siteId: string): string;
export function siteLogsPath(siteId: string): string;
export function siteTracesPath(siteId: string): string;
// ... plus site*FromRoot variants
```

### 4.7 Observability Interface

```typescript
// packages/sites/macos/src/observability.ts

export interface MacosSiteStatus {
  siteId: string;
  siteRoot: string;
  health: SiteHealthRecord;
  lastTrace: CycleTraceRecord | null;
}

export interface DiscoveredMacosSite {
  siteId: string;
  siteRoot: string;
}

export function isMacosSite(siteId: string): boolean;
export function getMacosSiteStatus(siteId: string): Promise<MacosSiteStatus>;
export function getSiteHealth(siteId: string): Promise<SiteHealthRecord>;
export function getLastCycleTrace(siteId: string): Promise<CycleTraceRecord | null>;
export function getSiteSummary(siteId: string): Promise<{ siteId: string; siteRoot: string; health: SiteHealthRecord; lastTrace: CycleTraceRecord | null; scopeCount: number }>;
export function discoverMacosSites(): DiscoveredMacosSite[];
```

### 4.8 Coordinator Interface

```typescript
// packages/sites/macos/src/coordinator.ts

export interface MacosSiteCoordinator {
  getHealth(siteId: string): SiteHealthRecord;
  setHealth(record: SiteHealthRecord): void;
  getLastCycleTrace(siteId: string): CycleTraceRecord | null;
  setLastCycleTrace(record: CycleTraceRecord): void;
  close(): void;
}

export class SqliteSiteCoordinator implements MacosSiteCoordinator {
  constructor(db: Database);
  getHealth(siteId: string): SiteHealthRecord;
  setHealth(record: SiteHealthRecord): void;
  getLastCycleTrace(siteId: string): CycleTraceRecord | null;
  setLastCycleTrace(record: CycleTraceRecord): void;
  close(): void;
}

/** Open the site-local coordinator database (creates db dir if needed). */
export function openCoordinatorDb(siteId: string): Database;
```

---

## 5. Substrate Comparison

| Concern | Cloudflare | Windows Native | Windows WSL | macOS |
|---------|-----------|----------------|-------------|-------|
| **Site identity** | `site_id` → DO instance name | `site_id` → directory under `%LOCALAPPDATA%\Narada\` | `site_id` → directory under `/var/lib/narada/` | `site_id` → directory under `~/Library/Application Support/Narada/` |
| **Cycle trigger** | Cron Trigger → Worker | Task Scheduler → PowerShell → Node.js | systemd timer / cron → shell → Node.js | `launchd` LaunchAgent → zsh script → Node.js |
| **Lock mechanism** | DO SQLite `site_locks` row with `expires_at` | `FileLock` (mkdir-based, `tasklist` PID check) | Same `FileLock` | `FileLock` (mkdir-based, `mtime` stale detection, no PID check on Unix) |
| **Lock TTL** | `lockTtlMs` in DO row | `staleAfterMs` in `FileLock` metadata | Same | `staleAfterMs` in `FileLock` metadata (default 310s) |
| **Stuck-lock detection** | `expires_at` wall-clock comparison | `mtimeMs` + `staleAfterMs` + PID check | Same | `mtimeMs` + `staleAfterMs` (pure time-based; sufficient on Unix) |
| **Coordinator store** | DO SQLite (`SqlStorage`) | `better-sqlite3` file (`Database`) | Same | `better-sqlite3` file at `{siteRoot}/db/coordinator.db` |
| **Health store** | DO SQLite `site_health` | SQLite `site_health` in coordinator.db | Same | SQLite `site_health` in `{siteRoot}/db/coordinator.db` |
| **Trace store** | DO SQLite `cycle_traces` + R2 | SQLite `cycle_traces` + NTFS traces/ | SQLite + ext4 traces/ | SQLite `cycle_traces` + APFS `{siteRoot}/traces/` |
| **Secret binding** | Worker Secrets (`NARADA_{site}_{name}`) | Credential Manager (`Narada/{site}/{name}`) or env | env or `.env` | Keychain (`dev.narada.site.{site}.{name}`) → env → `.env` → config |
| **Process model** | Event-driven Worker (stateless) | PowerShell/Node process (stateless) | shell/Node process (stateless) | zsh/Node process (stateless) |
| **Operator surface** | HTTP `GET /status` | CLI `narada status --site` + optional localhost HTTP | Same CLI | CLI `narada status --site` + optional localhost HTTP |
| **Config loading** | Worker env + secrets | `loadConfig()` from `{siteRoot}\config.json` | Same | `loadConfig()` from `{siteRoot}/config.json` |
| **Bounded Cycle** | `runCycle()` in Worker | `WindowsSiteRunner.runCycle()` | Same | `DefaultMacosSiteRunner.runCycle()` |
| **Restart safety** | DO lock persists across Worker invocations | Filesystem lock persists across process invocations | Same | Filesystem lock persists across `launchd` invocations |
| **Health transitions** | `computeHealthTransition()` in Worker | Same function | Same | Same function |
| **Notification** | Webhook / log adapter | Same webhook / log adapter | Same | Same webhook / log adapter (deferred to v1) |
| **Session boundary** | Stateless Worker | User login session | WSL Linux session | User login session (LaunchAgent) |
| **Sleep/wake handling** | N/A (cloud) | N/A (desktop/server) | N/A (WSL) | **Explicit concern**: missed Cycle triggers on sleep; short interval + cursor-driven catch-up |
| **Permission surface** | Worker Access policy | Windows ACL | Linux permissions | **TCC** (Keychain, filesystem, network) |
| **Install/uninstall** | `wrangler deploy` / `wrangler delete` | PowerShell script registers Task Scheduler task | systemd script or crontab | `launchctl load` / `launchctl unload` |
| **Path-with-spaces** | N/A | `%LOCALAPPDATA%` has no spaces | N/A | `Application Support` contains a space; all scripts must quote paths |

---

## 6. Reuse Inventory

### 6.1 Existing Modules — Import and Use Directly

| Module | Location | Reused For |
|--------|----------|------------|
| `FileLock` | `packages/layers/control-plane/src/persistence/lock.ts` | Lock acquisition/release/stuck detection. Already cross-platform (handles Unix via `mkdir`-based locking with `mtime` stale detection). |
| `computeHealthTransition` | `packages/layers/control-plane/src/health.ts` | Health state machine. Implements unattended layer §3 exactly. |
| `loadConfig` | `packages/layers/control-plane/src/config/load.ts` | Config loading from `config.json`. No new config format needed. |
| `DefaultSyncRunner` | `packages/layers/control-plane/src/runner/sync-once.ts` | Step 2 (sync source deltas) in v1. Handles cursor, apply-log, projector. |
| `SqliteCoordinatorStore` | `packages/layers/control-plane/src/coordinator/store.ts` | SQLite-backed coordinator state (work items, evaluations, decisions) in v1. |
| `SqliteOutboundStore` | `packages/layers/control-plane/src/outbound/store.ts` | SQLite-backed outbound command state machine in v1. |
| `SqliteFactStore` | `packages/layers/control-plane/src/facts/store.ts` | SQLite-backed fact store for durable canonical boundary in v1. |
| `DefaultForemanFacade` | `packages/layers/control-plane/src/foreman/facade.ts` | Work opening, governance, recovery in v1. |
| `buildGraphTokenProvider` | `packages/layers/control-plane/src/config/token-provider.ts` | Graph API credential resolution in v1. |
| `GraphHttpClient` | `packages/layers/control-plane/src/adapter/graph/client.ts` | Graph API HTTP client in v1. |

### 6.2 Existing CLI Commands — Already Integrated

| Command | Location | macOS Integration |
|---------|----------|-------------------|
| `narada cycle` | `packages/layers/cli/src/commands/cycle.ts` | Already routes to `runCycle()` for macOS Sites (detected via `isMacosSite()`). |
| `narada status` | `packages/layers/cli/src/commands/status.ts` | Already routes to `getMacosSiteStatus()` for macOS Sites. |
| `narada doctor` | `packages/layers/cli/src/commands/doctor.ts` | Already runs macOS-specific checks: site directory, coordinator DB, lock freshness, LaunchAgent plist, health, cycle freshness. |
| `narada ops` | `packages/layers/cli/src/commands/ops.ts` | Can be extended to call `discoverMacosSites()` for multi-Site summary. |

### 6.3 New Code — Already Written (Spike Phase)

| Module | Location | Justification |
|--------|----------|---------------|
| `DefaultMacosSiteRunner` | `packages/sites/macos/src/runner.ts` | Orchestrates the 8-step Cycle. No existing orchestrator binds sync + foreman + health + trace in one bounded exit for macOS. |
| `supervisor.ts` (pure functions) | `packages/sites/macos/src/supervisor.ts` | `launchd` LaunchAgent integration is substrate-specific. No existing module handles macOS scheduling. |
| `credentials.ts` | `packages/sites/macos/src/credentials.ts` | macOS Keychain access via `security` CLI is platform-specific. No existing resolver covers this. |
| `path-utils.ts` | `packages/sites/macos/src/path-utils.ts` | macOS-specific path resolution (`~/Library/Application Support/`). Existing code uses config-relative paths. |
| `SqliteSiteCoordinator` | `packages/sites/macos/src/coordinator.ts` | Site-local SQLite schema (`site_health`, `cycle_traces`) decoupled from control-plane coordinator. |
| `observability.ts` | `packages/sites/macos/src/observability.ts` | Read-only operator inspection surface. Mirrors control-plane `observability/` boundary. |

---

## 7. Design Corrections Applied to Task 428 Document

The following corrections were made to `docs/deployment/macos-site-materialization.md` during this review:

### 7.1 Coordinator Database Path

**Original (§8):** Showed `coordinator.db` at the Site root.

**Correction:** The actual implementation places it at **`db/coordinator.db`** (inside a `db/` subdirectory). This keeps the Site root cleaner and aligns with the `SITE_SUBDIRECTORIES` convention in `path-utils.ts`.

**Updated text in §8 and §11.2:**
> The actual implementation places the coordinator database at `{siteRoot}/db/coordinator.db`.

### 7.2 Module Name Corrections

**Original (chapter DAG anticipation):** Anticipated `credential-resolver.ts`, `operator-surface.ts`, and `MacosSiteSupervisor` class.

**Correction:** The actual implementation uses:

| Contract Anticipation | Actual Name | Rationale |
|-----------------------|-------------|-----------|
| `credential-resolver.ts` | `credentials.ts` | Shorter; aligns with `@narada2/control-plane` naming conventions |
| `operator-surface.ts` | `observability.ts` | Explicitly read-only; mirrors control-plane `observability/` boundary |
| `MacosSiteSupervisor` class | `supervisor.ts` (pure functions) | Template generators have no mutable state; functions are sufficient |

**Updated text in §11.3:**
> The boundary contract proposed modules that emerged slightly differently during implementation.

### 7.3 Site-Local Coordinator Clarification

**Original:** Implied the macOS runner might write health and trace directly into the control-plane coordinator.

**Correction:** A separate **site-local coordinator** (`SqliteSiteCoordinator`) was introduced with its own SQLite file (`{siteRoot}/db/coordinator.db`).

**Rationale (already in §11.4):**
- The macOS Site package must not depend on control-plane internals for its own health/trace storage.
- Site-local health/trace tables are simpler and avoid schema coupling.
- The control-plane coordinator remains the authority for `work_item`, `execution_attempt`, and `outbound_handoff` state.
- Site-local tables are substrate-agnostic; they could move into a generic substrate if abstraction is justified later.

### 7.4 `"stuck_recovery"` Outcome Reachability

**Original:** `MacosCycleOutcome` includes `"stuck_recovery"`.

**Correction:** The macOS runner never passes `"stuck_recovery"` as an outcome. When `recoverStuckLock()` succeeds before a Cycle, the Cycle proceeds normally and uses `"success"`. When it fails, the catch block uses `"failure"`.

**Resolution:** Documented in §11.5. Either wire `"stuck_recovery"` in the recovery success path, or remove it from `MacosCycleOutcome` in v1.

### 7.5 Steps 2–6 Are Fixture Stubs

**Correction:** Documented in §11.6. The `runCycle()` step handlers for sync, derive, evaluate, handoff, and reconcile are explicit no-op fixtures. This is identical to the Cloudflare and Windows v0 patterns and preserves IAS boundaries.

### 7.6 Lock Recovery Behavior

**Original (§10.2):** Described `recoverStuckLock()` as primary recovery mechanism.

**Correction:** `FileLock.acquire()` already handles stale lock removal during its retry loop. `recoverStuckLock()` is a **secondary fallback**. The runner calls `recoverStuckLock()` only when `lock.acquire()` throws. Documented in §10.2 and §11.8.

### 7.7 No Cross-Site Aggregation

**Correction:** Unlike Windows (Tasks 380–381), macOS v0 does not implement `SiteRegistry`, `aggregateHealth`, `deriveAttentionQueue`, or `CrossSiteNotificationRouter`. Documented in §11.9.

---

## 8. Assumptions and Risks

| Assumption | Risk | Mitigation |
|------------|------|------------|
| `FileLock` works reliably on all macOS configurations | Some corporate MDM environments may restrict filesystem operations | `FileLock` uses standard `mkdir`/`rmdir`; no special permissions required beyond write access to Site root |
| macOS Keychain is accessible from Node.js via `security` CLI | First access may trigger TCC dialog; headless environments may hang or fail | `setupKeychainAccess()` triggers prompt interactively; env/`.env` fallback is mandatory |
| `launchd` fires the wrapper script reliably | Minimal `PATH` in LaunchAgent environment may miss Node.js | Plist explicitly sets `PATH` including `/opt/homebrew/bin` and `/usr/local/bin`; wrapper uses absolute `node` path |
| Machine sleep skips scheduled Cycles | Long sleep gaps may delay processing | Short `StartInterval` (configurable) + cursor-driven idempotent catch-up on wake |
| `better-sqlite3` builds on macOS | Native module compilation may fail without Xcode Command Line Tools | Document prerequisite; prebuilt binaries available for common Node versions |
| `Application Support` path contains a space | Naive shell scripts break | All shell wrapper scripts quote `"${SITE_ROOT}"`; plist `ProgramArguments` array handles spaces naturally |

---

## Cross-References

| Document | Relationship |
|----------|--------------|
| [`docs/deployment/macos-site-materialization.md`](macos-site-materialization.md) | Parent design document; updated with corrections from this contract |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Cloudflare sibling materialization — compare substrate mappings |
| [`docs/deployment/windows-site-materialization.md`](windows-site-materialization.md) | Windows sibling materialization — compare native desktop substrate |
| [`docs/product/unattended-operation-layer.md`](../product/unattended-operation-layer.md) | Unattended semantics that macOS must satisfy |
| [`AGENTS.md`](../../AGENTS.md) | Kernel invariants that must not be violated |
| `packages/sites/macos/src/` | Implementation package — already exists, validated by this contract |
