# Windows Site Materialization Design

> Design for Narada Site materializations on Windows substrates.
>
> This document uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
>
> It distinguishes two Windows variants:
> - **Windows native Site** — runs directly on Windows 11 using PowerShell, Task Scheduler, and native filesystem/SQLite.
> - **Windows WSL Site** — runs inside a WSL 2 Linux distribution using standard Linux process supervision and the WSL filesystem.
>
> It also distinguishes two Windows authority loci:
> - **Windows user Site** — represents one user profile and its profile-local operator context.
> - **Windows PC Site** — represents machine/session state such as display topology, drivers, services, scheduled tasks, and whole-PC recovery actions.

---

## 1. Introduction

Windows is a **sibling Site substrate** to Cloudflare, not a replacement or a vertical. Narada should learn the Windows deployment boundary from honest native and WSL materializations before extracting a provider-neutral substrate model.

The Windows family covers two distinct runtime loci:

| Variant | Host OS | Process Model | Filesystem | Credential Store | Scheduling |
|---------|---------|---------------|------------|------------------|------------|
| **Native** | Windows 11 | PowerShell / Node.js | NTFS (`%USERPROFILE%\.narada` for user-locus; `%ProgramData%\Narada\sites\pc\...` for PC-locus; legacy `%LOCALAPPDATA%` Sites remain compatible) | Windows Credential Manager or env | Task Scheduler |
| **WSL** | WSL 2 Linux | systemd / cron / shell | ext4 inside WSL (`/home/...`) | Linux env / `.env` / WSL interop | systemd timer / cron |

Both variants are **Sites**, not operations, not verticals, and not deployment targets in the infrastructure sense.

Variant and authority locus are independent. `native` vs `wsl` answers how the Site runs. `user` vs `pc` answers which Windows authority grammar the Site represents.

### Generic Site Abstraction Status

> **Deferred.**
>
> This chapter documents two concrete Windows materializations. A generic `Site` abstraction (interface, base class, or shared package) is **not justified yet**. The Cloudflare and Windows families differ in lock mechanism, secret binding, and process lifecycle enough that premature abstraction would hide real substrate constraints.
>
> If Tasks 372–377 reveal substantial commonality (e.g., identical health schema, identical cycle-step pipeline, identical trace format), a shared `@narada2/site-core` package may be proposed in the closure review (Task 377). Until then, each substrate keeps its own package or module.

---

## 2. Definitions

### `Site`

The **semantic anchor** for an Aim-at-Site binding.

A Windows Site holds:
- state (facts, work items, decisions, confirmations)
- substrate bindings (Graph API, charter runtime, secrets)
- runtime context (policy, posture, allowed actions)

A Windows Site root is selected by authority locus. A `%USERPROFILE%\.narada\` directory is the Windows user-locus Site for that profile. A `%ProgramData%\Narada\sites\pc\{site_id}\` directory is a native Windows PC-locus Site. A `/var/lib/narada/{site_id}` directory inside WSL is another Site.

For profile-local experimental Sites, an operator may override the Site root. That override is path policy, not a new canonical substrate convention; the config should carry the authority locus explicitly.

### `Site substrate`

The **capability class** that a Site requires from its host environment.

#### Native Windows substrate class

```text
windows-11-native-powershell-sqlite
```

Requires:
- scheduled invocation (Task Scheduler)
- durable coordination with filesystem locking (`better-sqlite3`)
- bounded execution environment (PowerShell / Node.js process)
- object storage for large artifacts (NTFS filesystem)
- secret binding (Windows Credential Manager or environment variables)
- operator surface (HTTP localhost server or CLI)

#### WSL substrate class

```text
wsl-2-linux-systemd-sqlite
```

Requires:
- scheduled invocation (systemd timer or cron)
- durable coordination with filesystem locking (`better-sqlite3`)
- bounded execution environment (Linux process)
- object storage for large artifacts (ext4 filesystem)
- secret binding (environment variables or `.env` file)
- operator surface (HTTP localhost server or CLI)

### `Windows authority locus`

The Windows authority locus is the part of Windows whose state and authority the Site represents.

| Locus | Owns | Typical root posture |
|-------|------|----------------------|
| **User** | User profile state, per-user credentials/preferences, shell and app config, operator KB, task governance, user-scoped tool policy | `%USERPROFILE%\.narada` |
| **PC** | Machine/session state, display topology, drivers, services, scheduled tasks, device inventory, recovery actions that affect the whole PC | `%ProgramData%\Narada\sites\pc\{site_id}`; user-owned prototype allowed before service/runtime hardening |

This distinction is separate from `site_id` and from the substrate variant. A user-owned prototype PC Site may be stored under a user profile while explicitly declaring:

```json
{
  "locus": {
    "authority_locus": "pc",
    "machine": {
      "hostname": "DESKTOP-SUNROOM-2"
    },
    "root_posture": "user_owned_pc_site_prototype"
  }
}
```

The root posture names the policy instead of letting a path such as `C:\Users\...\` silently imply user authority.

The user-locus Site's telos is the operator's personal working memory and control surface. It should hold operator KB, tasks, agent/session continuity, preferences, and user-scoped tool policy. It should not own display topology, driver recovery, Windows services, scheduled tasks, or other machine authority. Those belong to the PC-locus Site.

### `Site materialization`

The **concrete files, scripts, and scheduled tasks** that instantiate a Site.

For native Windows, a materialization is the sum of:
- one PowerShell script that invokes the Cycle runner
- one Task Scheduler task bound to that script
- one NTFS directory tree holding SQLite state, config, and traces
- Windows Credential Manager entries (or env bindings) for secrets
- one local HTTP server (optional) for operator status

For WSL, a materialization is the sum of:
- one shell script that invokes the Cycle runner
- one systemd service/timer or crontab entry
- one ext4 directory tree holding SQLite state, config, and traces
- environment or `.env` bindings for secrets
- one local HTTP server (optional) for operator status

### `Cycle runner`

The **process machinery** that advances an Aim at the Site.

The Windows Cycle runner is not a long-running daemon. It is a scheduled process that:
1. receives a Task Scheduler or systemd timer invocation
2. acquires the Site coordination lock
3. executes one bounded Cycle
4. releases the lock and exits

### `Trace storage`

Where **decisions, logs, run evidence, and health** are written.

On Windows native:
- SQLite holds compact control-state Traces (decisions, evaluations, transitions)
- NTFS holds large Trace artifacts (raw sync snapshots, evaluation dumps)
- Windows Event Log or structured log files hold ephemeral execution Traces

On WSL:
- SQLite holds compact control-state Traces
- ext4 holds large Trace artifacts
- systemd journal or structured log files hold ephemeral execution Traces

---

## 3. Windows Resource Mapping

### 3.1 Native Windows

| Windows Resource | Narada Reading |
| --- | --- |
| **PowerShell / Node.js process** | Cycle runner. Receives Task Scheduler invocation, executes Cycle, exits. Stateless between invocations. |
| **Task Scheduler** | Cycle scheduler. Fires the PowerShell/Node script at a configured interval. |
| **NTFS directory (`%USERPROFILE%\.narada` or `%ProgramData%\Narada\sites\pc\{site_id}`)** | Site state, config, SQLite coordinator, and trace artifact root chosen by authority locus. Legacy `%LOCALAPPDATA%\Narada\{site_id}` Sites remain compatible. |
| **SQLite (`better-sqlite3`)** | Coordinator/control-state store. Strong consistency via single-writer SQLite. |
| **Windows Credential Manager** | Secret binding for Graph API, Kimi API, and admin tokens. |
| **Windows Event Log / log file** | Ephemeral execution traces. Structured JSON log lines written under the locus-selected Site root's `logs\` directory. |
| **Localhost HTTP server (optional)** | Operator surface. `GET /status` returns health and last-Cycle summary. |

### 3.2 WSL

| WSL Resource | Narada Reading |
| --- | --- |
| **Node.js process under Linux** | Cycle runner. Receives systemd/cron invocation, executes Cycle, exits. |
| **systemd timer or cron** | Cycle scheduler. Fires the shell script at a configured interval. |
| **ext4 directory (`/var/lib/narada/{site_id}` or `~/narada/{site_id}`)** | Site state, config, SQLite coordinator, and trace artifact root. |
| **SQLite (`better-sqlite3`)** | Same as native: coordinator/control-state store. |
| **Environment / `.env` file** | Secret binding. Same pattern as local Linux development. |
| **systemd journal / log file** | Ephemeral execution traces. |
| **Localhost HTTP server (optional)** | Same as native: operator status surface. |

### 3.3 Cross-Variant Commonality

Both variants share these Narada concerns, even though the Windows substrate differs:

| Concern | Native Windows | WSL |
|---------|---------------|-----|
| **Site identity** | `site_id` string, config-declared authority locus, root under `%USERPROFILE%\.narada` or `%ProgramData%\Narada\sites\pc\` | `site_id` string, directory name under `/var/lib/narada/` |
| **Cycle trigger** | Task Scheduler task → PowerShell → Node.js | systemd timer / cron → shell → Node.js |
| **Coordinator/storage** | `better-sqlite3` file at `{siteRoot}\coordinator.db` | `better-sqlite3` file at `{siteRoot}/coordinator.db` |
| **Lock/recovery model** | `FileLock` from `@narada2/control-plane` (cross-platform, handles Windows via `tasklist` PID check) | Same `FileLock` |
| **Health/trace location** | SQLite `site_health` + `cycle_traces` tables | Identical SQLite tables (same schema) |
| **Trace artifacts** | NTFS `{siteRoot}\traces\` | ext4 `{siteRoot}/traces/` |
| **Secret binding** | Windows Credential Manager or env | Linux env or `.env` file |
| **Operator inspection** | `narada status --site {site_id}` or localhost HTTP | Same CLI or localhost HTTP |
| **Control surface** | CLI commands (`narada recover`, `narada derive-work`) | Same CLI commands |

> **Key insight**: The Cycle runner, SQLite schema, and Narada runtime code are **substrate-agnostic**. Only the *scheduler*, *credential store*, and *filesystem path conventions* change between native Windows and WSL.

---

## 4. Bounded Windows Cycle

A Windows Cycle is a **bounded attempt** to advance an Aim at a Site. It must complete within the execution limits of the host process (no infinite loops, no unbounded memory growth).

The Cycle explicitly avoids long-running daemon assumptions.

### Steps

1. **Acquire Site/Cycle lock** — Claim exclusive coordination authority via `FileLock` from `@narada2/control-plane`. Fail fast if another Cycle is active.
2. **Sync source deltas** — Pull new facts from the Source. Write cursor and apply-log updates.
3. **Derive / admit work** — Run context formation + foreman admission over new facts. Open or supersede work items.
4. **Run charter evaluation** — Lease runnable work, execute charters, persist evaluations.
5. **Create draft / intent handoffs as allowed** — Run foreman governance over evaluations. Create outbound commands or intents where policy permits.
6. **Reconcile submitted effects** — Check confirmation status of previously submitted Acts. Update durable state.
7. **Update health and Trace** — Write health record, transition log, and run summary.
8. **Release lock and exit** — Clean up ephemeral state, release the `FileLock`, process exits.

### Boundedness Guarantees

- A Cycle has a **hard wall-clock ceiling** configured by the operator (default: 5 minutes).
- If the ceiling is reached, the Cycle **gracefully aborts** at the next safe boundary, releases the lock, and leaves a partial Trace.
- The next Task Scheduler / systemd invocation picks up where the partial Trace left off (cursor-driven, idempotent).
- No Cycle may assume it is the only running process. Lock acquisition is mandatory.

---

## 5. Local Assumptions That Break on Windows

| Linux / macOS Assumption | Windows Replacement | Variant |
|--------------------------|---------------------|---------|
| Unix signal handling (`SIGTERM`, `SIGHUP`) | PowerShell pipeline stop / process termination | Native |
| `~/.config/narada/` config directory | `%USERPROFILE%\.narada` for the user-locus Site | Native user-locus |
| `/var/lib/narada/` machine state | `%ProgramData%\Narada\sites\pc\{site_id}` | Native PC-locus |
| Legacy Windows local app data | `%LOCALAPPDATA%\Narada\{site_id}\` | Native compatibility |
| Unix domain sockets for inter-process communication | Named pipes or localhost TCP | Native |
| `flock()` / `fcntl()` file locking | `FileLock` from `@narada2/control-plane` (mkdir-based, cross-platform, handles Windows via `tasklist` PID check) | Both |
| systemd / cron for scheduling | Task Scheduler | Native |
| systemd / cron for scheduling | systemd (if available) or cron | WSL |
| POSIX path separators (`/`) | Windows path separators (`\\`) | Native |
| Case-sensitive filesystem | Case-preserving, case-insensitive NTFS | Native |
| Symlinks for view store | NTFS junctions or reparse points; or skip symlinks | Native |
| Shell script (`#!/bin/bash`) | PowerShell script (`.ps1`) | Native |
| `.env` file loading as primary secret source | Windows Credential Manager as primary; `.env` as fallback | Native |

---

## 6. v0 Prototype Boundary

### In v0 — Native Windows

```text
One PowerShell script
+ one Task Scheduler task
+ one NTFS directory with better-sqlite3
+ Windows Credential Manager entries (or env fallback)
```

can execute **one bounded mailbox Cycle** for **one configured Aim-at-Site binding**, write health/Trace, and expose a **local operator status endpoint** (or CLI).

Specifically, v0 requires:
- Task Scheduler fires PowerShell → begins Cycle
- `FileLock` metadata directory holds coordination lock; SQLite file holds compact state
- NTFS holds message payloads, sync snapshots, evaluation evidence
- Credential Manager (or env) holds Graph API and charter runtime credentials
- Cycle completes: sync → admit → evaluate → govern → handoff → reconcile → trace
- PowerShell/Node process exits cleanly after lock release
- CLI `narada status --site {site_id}` returns health and last-Cycle summary

### In v0 — WSL

```text
One shell script
+ one systemd timer or cron entry
+ one ext4 directory with better-sqlite3
+ environment or .env bindings
```

can execute the same bounded Cycle with the same semantics. The WSL variant reuses as much of the local Linux substrate as possible; it is essentially the existing local development runtime formalized as a Site materialization.

### Deferred

- **Full charter runtime in subprocess** — v0 proves the Cycle can run *something* bounded; full charter/tool catalog is v1
- **Multi-Site** — one directory/task per Site for v0; shared scheduler across Sites is v1
- **Operator action mutations** — approve/reject drafts via endpoint or CLI; v0 is observation-only
- **Multi-vertical** — mailbox only for v0; timer/webhook peers are v1
- **Real-time sync** — delta webhook push instead of polling; v1
- **Windows Service** — running Narada as a true Windows Service is deferred to v1; v0 uses Task Scheduler
- **WSL ↔ Windows host interop** — explicit cross-boundary file or credential sharing is v1

---

## 7. Secret Binding and Rotation

### 7.1 Native Windows: Credential Manager

Secrets are stored in the Windows Credential Manager under the target name:

```text
Narada/{site_id}/{secret_name}
```

Examples:

```text
Narada/help/GRAPH_ACCESS_TOKEN
Narada/help/GRAPH_TENANT_ID
Narada/help/GRAPH_CLIENT_ID
Narada/help/GRAPH_CLIENT_SECRET
Narada/help/KIMI_API_KEY
Narada/help/ADMIN_TOKEN
```

A Node.js helper (using `child_process` to call `cmdkey` or a small native module) reads credentials at Cycle start time. No caching beyond one Cycle.

### 7.2 Native Windows: Environment Fallback

If Credential Manager is unavailable (e.g., CI, headless), secrets fall back to environment variables:

```text
NARADA_{site_id}_{secret_name}
```

Same naming convention as Cloudflare, but resolved from the process environment instead of Worker Secrets.

### 7.3 WSL: Environment / `.env`

WSL Sites use the same secret resolution as local Linux development:

1. Environment variables (`NARADA_{site_id}_{secret_name}`)
2. `.env` file in the Site root directory
3. Config file values (lowest precedence)

### 7.4 Rotation Strategy

- Secrets are rotated manually by the operator.
- The Cycle reads secrets at invocation time; no caching beyond one Cycle.
- On secret mismatch (e.g., 401 from Graph API), the Cycle fails gracefully and records the auth failure in health/Trace.
- Automatic secret rotation is deferred to v1.

---

## 8. Filesystem Layout

### 8.1 Native Windows

User-locus:

```text
%USERPROFILE%\.narada\
  ├── config.json              # User Site configuration
  ├── registry.db              # User-locus Site registry / operator memory index
  ├── kb\
  ├── tasks\
  ├── logs\
  └── traces\
```

PC-locus:

```text
%ProgramData%\Narada\sites\pc\{site_id}\
  ├── config.json              # Site configuration (posture, sources, charters)
  ├── coordinator.db           # SQLite: locks, health, traces, control state
  ├── .env                     # Optional fallback secrets
  ├── logs\
  │   └── cycles\              # Structured JSON log lines per Cycle
  ├── traces\
  │   └── {cycle_id}.json      # Cycle trace artifacts
  ├── snapshots\
  │   └── {timestamp}.json     # Raw sync snapshots
  └── messages\
      └── {context_id}\         # Message payloads per context
```

Legacy native Sites under `%LOCALAPPDATA%\Narada\{site_id}\` remain compatible, but new Windows Site materialization should use authority-locus roots.

### 8.2 WSL

```text
/var/lib/narada/{site_id}/          # or ~/narada/{site_id}/
  ├── config.json
  ├── coordinator.db
  ├── .env
  ├── logs/cycles/
  ├── traces/
  ├── snapshots/
  └── messages/
```

The WSL layout mirrors the native layout with POSIX path conventions.

---

## 9. What Must Not Be Claimed

| Claim | Status | Why |
|-------|--------|-----|
| Generic Site abstraction | **Deferred** | Not enough commonality proven yet. Propose in Task 377 closure if justified. |
| Windows Service production runtime | **Deferred** | Task Scheduler is the v0 scheduler. Windows Service wrapper is v1. |
| Mailbox vertical conflation | **Forbidden** | Windows Site is a substrate, not a mailbox feature. Mailbox logic lives in the kernel, not the Site package. |
| Developer machine layout dependence | **Forbidden** | All paths must resolve through documented authority-locus policy or env vars. No hard-coded `C:\Users\...` paths. |
| WSL as "just Linux" | **Forbidden** | WSL has distinct filesystem boundaries, interop quirks, and Windows-host coupling. It is a separate substrate variant. |
| Path-implied authority locus | **Forbidden** | A Site's path must not be the only place where user-vs-PC authority is encoded. Use `locus.authority_locus`. |

---

## 10. Post-Implementation Notes (Tasks 372–376)

The following corrections and additions were discovered during implementation and are recorded here for future substrate work.

### 10.1 Module Names and Boundaries

The boundary contract (Task 372) proposed modules named `credential-resolver.ts`, `operator-surface.ts`, and `WindowsSiteSupervisor`. The actual implementation uses:

| Contract Name | Actual Name | Rationale |
|---------------|-------------|-----------|
| `credential-resolver.ts` | `credentials.ts` | Shorter; aligns with `@narada2/control-plane` naming conventions |
| `operator-surface.ts` | `observability.ts` | Explicitly read-only; mirrors control-plane `observability/` boundary |
| `WindowsSiteSupervisor` | `supervisor.ts` (functions, not class) | Template generators are pure functions; no mutable state needed |
| — | `router.ts` (new) | `ControlRequestRouter` provides the audited console→Site control boundary |
| — | `site-control.ts` (new) | `WindowsSiteControlClient` bridges console requests to `executeOperatorAction` |
| — | `registry.ts` (new, Task 380) | `SiteRegistry` provides durable SQLite-backed site inventory |
| — | `aggregation.ts` (new, Task 381) | Cross-site health aggregation and attention queue derivation |
| — | `cross-site-notifier.ts` (new, Task 381) | `CrossSiteNotificationRouter` polls all Sites and emits on bad transitions |
| — | `notification.ts` (new, Task 376) | Unified notification envelope and emission surface |

### 10.2 Site-Local Coordinator vs Control-Plane Coordinator

The design assumed the Windows runner would write health and trace directly into the control-plane coordinator (`SqliteCoordinatorStore`). During implementation (Task 376), a separate **site-local coordinator** (`SqliteSiteCoordinator`) was introduced with its own SQLite file (`{siteRoot}/db/coordinator.db`).

**Rationale:**
- The Windows Site package must not depend on control-plane internals for its own health/trace storage.
- Site-local health/trace tables (`site_health`, `cycle_traces`, `notification_log`) are simpler and avoid schema coupling.
- The control-plane coordinator remains the authority for `work_item`, `execution_attempt`, and `outbound_handoff` state.
- Site-local tables are substrate-agnostic; they could move into a generic substrate if abstraction is justified later.

### 10.3 Control Router Pattern

The boundary contract did not anticipate a dedicated control router. The implementation introduces:

- `ControlRequestRouter` — validates target Site exists, resolves a `SiteControlClient`, forwards the request, and audits the outcome.
- `WindowsSiteControlClient` — maps `ConsoleControlRequest` → `OperatorActionPayload` → `executeOperatorAction`.

This pattern separates **routing** (registry lookup, audit logging) from **execution** (`executeOperatorAction` governance). It mirrors the Cloudflare-site control surface but uses local function calls instead of HTTP RPC.

### 10.4 Cross-Site Aggregation Added

Tasks 380–381 added `SiteRegistry`, `aggregateHealth`, and `deriveAttentionQueue` after the original design. These were not in the Task 371 or 372 documents but are essential for multi-Site operator surfaces:

- `SiteRegistry` scans filesystem for Sites and persists metadata in `~/.narada/registry.db` (WSL) or native Windows registry roots selected by authority locus. Legacy native registry storage under `%LOCALAPPDATA%\Narada\.registry\registry.db` remains compatible until registry migration is explicit.
- `deriveAttentionQueue` queries every registered Site via `SiteObservationApi` and produces a unified, severity-sorted attention queue.
- `CrossSiteNotificationRouter` polls all Sites and emits `OperatorNotification` only on transitions **to** `critical` or `auth_failed`.

### 10.5 Notification Contract Alignment

The `OperatorNotification` envelope and adapter system (`LogNotificationAdapter`, `WebhookNotificationAdapter`, `DefaultNotificationEmitter`, `SqliteNotificationRateLimiter`) were designed to mirror the Cloudflare-site notification contract exactly. This ensures operator surfaces are substrate-agnostic:

```typescript
// Same envelope on Cloudflare and Windows
interface OperatorNotification {
  site_id: string;
  scope_id: string;
  severity: "warning" | "critical";
  health_status: "degraded" | "critical" | "auth_failed";
  summary: string;
  detail: string;
  suggested_action: string;
  occurred_at: string;
  cooldown_until: string;
}
```

### 10.6 Credential Manager via `keytar`

The native Windows credential resolver uses `keytar` (optional dependency) to read from Windows Credential Manager. If `keytar` is not installed, the resolver falls through to environment variables and `.env` files without crashing. This is documented in `credentials.ts` and tested in `credentials.test.ts`.

### 10.7 Task Scheduler as v0 Scheduler Confirmed

No Windows Service implementation was attempted. Task Scheduler (via `generateRegisterTaskScript`) remains the v0 scheduler for native Windows. systemd/cron remains the v0 scheduler for WSL. This was explicitly deferred in the design and the deferral is confirmed correct — a true Windows Service would require session 0 isolation research, service lifecycle hooks, and recovery action design that are out of scope for v0.

---

## 11. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Cloudflare sibling materialization — compare substrate mappings |
| [`docs/product/unattended-operation-layer.md`](../product/unattended-operation-layer.md) | Unattended semantics apply equally to Windows and Cloudflare Sites |
| [`AGENTS.md`](../../AGENTS.md) | Agent navigation hub; critical invariants |
| [`docs/deployment/windows-site-boundary-contract.md`](windows-site-boundary-contract.md) | Boundary contract with authority table and reuse inventory |
| [`docs/deployment/windows-credential-path-contract.md`](windows-credential-path-contract.md) | Credential resolution and path binding contract |
| `packages/sites/windows/` | Implementation package — single package, both variants |
