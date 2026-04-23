# macOS Site Materialization Design

> Design for Narada Site materializations on macOS substrates.
>
> This document uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace** with canonical expansions per the two-level mapping (Operation Specification / Runtime Locus / Control Cycle / Effect Intent→Effect Attempt→Confirmation / Evidence Trace).

---

## 1. Introduction

macOS is a **sibling Site substrate** to Cloudflare and Windows, not a replacement, a vertical, or "basically Linux." Narada should learn the macOS deployment boundary from an honest local-user materialization before extracting any provider-neutral substrate model.

Unlike Windows, macOS has **one primary variant** for local-user Sites:

| Variant | Host OS | Process Model | Filesystem | Credential Store | Scheduling |
|---------|---------|---------------|------------|------------------|------------|
| **macOS native** | macOS 13+ | Node.js / zsh process | APFS (`~/Library/Application Support/`) | macOS Keychain or env | `launchd` LaunchAgent |

macOS is a **Site**, not an operation, not a vertical, and not a deployment target in the infrastructure sense.

### Generic Site Abstraction Status

> **Deferred.**
>
> This chapter documents one concrete macOS materialization. A generic `Site` abstraction (interface, base class, or shared package) is **not justified yet**. Cloudflare, Windows native, Windows WSL, and macOS differ in scheduler mechanism, secret binding, filesystem locking behavior, and session/permission boundaries enough that premature abstraction would hide real substrate constraints.
>
> If Tasks 431–435 reveal substantial commonality, a shared `@narada2/site-core` package may be proposed in the closure review (Task 436). Until then, each substrate keeps its own package or module.

---

## 2. Definitions

### `Site`

The **semantic anchor** for an Aim-at-Site binding.

A macOS Site holds:
- state (facts, work items, decisions, confirmations)
- substrate bindings (Graph API, charter runtime, secrets)
- runtime context (policy, posture, allowed actions)

A `~/Library/Application Support/Narada/{site_id}/` directory is one Site.

### `Site substrate`

The **capability class** that a Site requires from its host environment.

For the macOS materialization, the substrate class is:

```text
macos-native-launchd-apfs-sqlite
```

Requires:
- scheduled invocation (`launchd` LaunchAgent)
- durable coordination with filesystem locking (`better-sqlite3` + `FileLock`)
- bounded execution environment (Node.js / zsh process)
- object storage for large artifacts (APFS filesystem)
- secret binding (macOS Keychain or environment variables)
- operator surface (HTTP localhost server or CLI)

### `Site materialization`

The **concrete files, scripts, and scheduled tasks** that instantiate a Site.

For macOS, a materialization is the sum of:
- one shell script that invokes the Cycle runner
- one `launchd` LaunchAgent plist bound to that script
- one APFS directory tree holding SQLite state, config, and traces
- Keychain entries (or env bindings) for secrets
- one local HTTP server (optional) for operator status

### `Cycle runner`

The **process machinery** that advances an Aim at the Site.

The macOS Cycle runner is not a long-running daemon. It is a scheduled process that:
1. receives a `launchd` LaunchAgent invocation
2. acquires the Site coordination lock
3. executes one bounded Control Cycle
4. releases the lock and exits

### `Trace storage`

Where **decisions, logs, run evidence, and health** are written.

On macOS:
- SQLite holds compact control-state Traces (decisions, evaluations, transitions)
- APFS holds large Trace artifacts (raw sync snapshots, evaluation dumps)
- Unified Logging (`os_log`) or structured log files hold ephemeral execution Traces

---

## 3. macOS Resource Mapping

| macOS Resource | Narada Reading |
| --- | --- |
| **Node.js / zsh process** | Cycle runner. Receives `launchd` invocation, executes Cycle, exits. Stateless between invocations. |
| **`launchd` LaunchAgent** | Cycle scheduler. Fires the shell script at a configured interval or on demand (`launchctl start`). |
| **APFS directory (`~/Library/Application Support/Narada/{site_id}`)** | Site state, config, SQLite coordinator, and trace artifact root. |
| **SQLite (`better-sqlite3`)** | Coordinator/control-state store. Strong consistency via single-writer SQLite. |
| **macOS Keychain** | Secret binding for Graph API, Kimi API, and admin tokens. |
| **Unified Logging (`os_log`) / log file** | Ephemeral execution traces. Structured JSON log lines written to `~/Library/Logs/Narada/{site_id}/` or Site-local `logs/`. |
| **Localhost HTTP server (optional)** | Operator surface. `GET /status` returns health and last-Cycle summary. |

### Cross-Variant Commonality

macOS shares these Narada concerns with other substrates, even though the substrate differs:

| Concern | macOS |
|---------|-------|
| **Site identity** | `site_id` string, directory name under `~/Library/Application Support/Narada/` |
| **Cycle trigger** | `launchd` LaunchAgent plist → shell script → Node.js |
| **Coordinator/storage** | `better-sqlite3` file at `{siteRoot}/coordinator.db` |
| **Lock/recovery model** | `FileLock` from `@narada2/control-plane` (cross-platform, handles Unix via `mkdir`-based locking with PID check) |
| **Health/trace location** | SQLite `site_health` + `cycle_traces` tables (same schema as Windows/Cloudflare site-local tables) |
| **Trace artifacts** | APFS `{siteRoot}/traces/` |
| **Secret binding** | macOS Keychain first; env or `.env` fallback |
| **Operator inspection** | `narada status --site {site_id}` or localhost HTTP |
| **Control surface** | CLI commands (`narada recover`, `narada derive-work`) |

> **Key insight**: The Cycle runner, SQLite schema, and Narada runtime code are **substrate-agnostic**. Only the *scheduler* (`launchd`), *credential store* (Keychain), and *filesystem path conventions* are macOS-specific.

---

## 4. Bounded macOS Cycle

A macOS Cycle is a **bounded attempt** to advance an Aim at a Site. It must complete within the execution limits of the host process (no infinite loops, no unbounded memory growth).

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
- The next `launchd` invocation picks up where the partial Trace left off (cursor-driven, idempotent).
- No Cycle may assume it is the only running process. Lock acquisition is mandatory.

---

## 5. Local Assumptions That Break on macOS

| Linux / Unix Assumption | macOS Replacement |
|--------------------------|-------------------|
| `systemd` / `cron` for scheduling | `launchd` LaunchAgent (`.plist` XML) |
| `~/.config/narada/` config directory | `~/Library/Application Support/Narada/` (Apple File System Layout Guidelines) |
| `~/.local/share/narada/` data directory | `~/Library/Application Support/Narada/{site_id}/` |
| Linux keyring (`secret-tool`) | macOS Keychain (`security` CLI or Keychain Services API) |
| `XDG_*` directory conventions | macOS File System Layout (Application Support, Logs, Caches) |
| GNU `ps` flags | BSD `ps` flags (different option syntax) |
| `/proc/{pid}` for process inspection | `sysctl` / `ps` / `lsof` (no `/proc` on macOS) |
| GNU `date` | BSD `date` (different format strings) |
| Case-sensitive filesystem | Case-insensitive APFS by default |
| `flock()` reliable across processes | `FileLock` from `@narada2/control-plane` (`mkdir`-based, portable) |
| Signal handling (`SIGTERM` standard) | `SIGTERM` works; `SIGKILL` from `launchctl`; no `SIGPWR` |

---

## 6. v0 Prototype Boundary

### In v0 — macOS

```text
One shell script
+ one launchd LaunchAgent plist
+ one APFS directory with better-sqlite3
+ macOS Keychain entries (or env fallback)
```

can execute **one bounded mailbox Cycle** for **one configured Aim-at-Site binding**, write health/Trace, and expose a **local operator status endpoint** (or CLI).

Specifically, v0 requires:
- `launchd` fires shell script → begins Cycle
- `FileLock` metadata directory holds coordination lock; SQLite file holds compact state
- APFS holds message payloads, sync snapshots, evaluation evidence
- Keychain (or env) holds Graph API and charter runtime credentials
- Cycle completes: sync → admit → evaluate → govern → handoff → reconcile → trace
- Node process exits cleanly after lock release
- CLI `narada status --site {site_id}` returns health and last-Cycle summary

### Deferred

- **Full charter runtime in subprocess** — v0 proves the Cycle can run *something* bounded; full charter/tool catalog is v1
- **Multi-Site** — one LaunchAgent plist per Site for v0; shared scheduler across Sites is v1
- **Operator action mutations** — approve/reject drafts via endpoint or CLI; v0 is observation-only
- **Multi-vertical** — mailbox only for v0; timer/webhook peers are v1
- **Real-time sync** — delta webhook push instead of polling; v1
- **GUI or menu bar app** — any graphical surface is out of scope for v0
- **Notarization / code signing** — running without Gatekeeper warnings is v1

---

## 7. Secret Binding and Rotation

### 7.1 macOS Keychain

Secrets are stored in the macOS Keychain under the service name:

```text
dev.narada.site.{site_id}.{secret_name}
```

Examples:

```text
dev.narada.site.help.GRAPH_ACCESS_TOKEN
dev.narada.site.help.GRAPH_TENANT_ID
dev.narada.site.help.GRAPH_CLIENT_ID
dev.narada.site.help.GRAPH_CLIENT_SECRET
dev.narada.site.help.KIMI_API_KEY
dev.narada.site.help.ADMIN_TOKEN
```

A Node.js helper reads credentials at Cycle start time via the `security` CLI command:

```bash
security find-generic-password -s "dev.narada.site.{site_id}.{secret_name}" -w
```

No caching beyond one Cycle.

> **TCC caveat**: The first Keychain access from a LaunchAgent may trigger a TCC permission dialog if the terminal app (or Node.js binary) has not been previously authorized. See §10.3 for mitigation.

### 7.2 Environment Fallback

If Keychain access fails (e.g., CI, headless, TCC denial), secrets fall back to environment variables:

```text
NARADA_{site_id}_{secret_name}
```

Same naming convention as Cloudflare and Windows, but resolved from the process environment.

### 7.3 `.env` Fallback

A `.env` file in the Site root directory is the third fallback:

```text
{siteRoot}/.env
```

### 7.4 Rotation Strategy

- Secrets are rotated manually by the operator.
- The Cycle reads secrets at invocation time; no caching beyond one Cycle.
- On secret mismatch (e.g., 401 from Graph API), the Cycle fails gracefully and records the auth failure in health/Trace.
- Automatic secret rotation is deferred to v1.

---

## 8. Filesystem Layout

```text
~/Library/Application Support/Narada/{site_id}/
  ├── config.json              # Site configuration (posture, sources, charters)
  ├── db/
  │   └── coordinator.db       # SQLite: locks, health, traces, control state
  ├── .env                     # Optional fallback secrets
  ├── logs/
  │   └── cycles/              # Structured JSON log lines per Cycle
  ├── traces/
  │   └── {cycle_id}.json      # Cycle trace artifacts
  ├── snapshots/
  │   └── {timestamp}.json     # Raw sync snapshots
  └── messages/
      └── {context_id}/        # Message payloads per context
```

> **Path-with-spaces note**: `Application Support` contains a space. All shell scripts, plist `ProgramArguments`, and Node.js path resolution must quote or escape the Site root. The `sitePath()` helper in the macOS Site package must return properly quoted paths for shell consumption.

---

## 9. Sibling Substrate Comparison

| Mechanism | Cloudflare | Windows Native | Windows WSL | macOS |
|-----------|------------|----------------|-------------|-------|
| **Scheduler** | Cron Trigger | Task Scheduler | systemd timer / cron | `launchd` LaunchAgent |
| **Site root** | Durable Object / R2 | `%LOCALAPPDATA%\Narada\{site_id}` | `/var/lib/narada/{site_id}` | `~/Library/Application Support/Narada/{site_id}` |
| **Credential store** | Worker Secrets | Windows Credential Manager | env / `.env` | macOS Keychain → env → `.env` |
| **Lock** | DO SQLite row lock | `FileLock` (cross-platform) | `FileLock` (cross-platform) | `FileLock` (cross-platform) |
| **Health** | DO SQLite `site_health` | SQLite `site_health` | SQLite `site_health` | SQLite `site_health` |
| **Trace** | DO SQLite + R2 | SQLite + NTFS | SQLite + ext4 | SQLite + APFS |
| **Operator surface** | Cloudflare Worker HTTP | CLI + localhost HTTP | CLI + localhost HTTP | CLI + localhost HTTP |
| **Process execution** | Worker / Sandbox | PowerShell / Node.js | shell / Node.js | zsh / Node.js |
| **Secret injection** | Worker Secrets binding | `cmdkey` / `keytar` | env file / export | `security` CLI / Keychain Services |
| **Install/uninstall mechanism** | `wrangler deploy` / `wrangler delete` | PowerShell script registers Task Scheduler task | systemd script or crontab | `launchctl load` / `launchctl unload` |
| **Session boundary** | Stateless Worker | User login session | WSL Linux session | User login session (LaunchAgent) |
| **Sleep/wake handling** | N/A (cloud) | N/A (desktop/server) | N/A (WSL) | **Explicit concern**: missed Cycle triggers on sleep |
| **Permission surface** | Worker Access policy | Windows ACL | Linux permissions | **TCC** (Keychain, filesystem, network) |

---

## 10. macOS-Specific Concerns

### 10.1 LaunchAgent vs Interactive Shell Environment Mismatch

A LaunchAgent runs in a **restricted environment** compared to an interactive zsh shell:

- `PATH` is minimal (`/usr/bin:/bin:/usr/sbin:/sbin`) — Node.js may not be on PATH unless the plist sets `EnvironmentVariables` or the script uses an absolute path.
- `HOME` is set correctly for user LaunchAgents.
- Shell initialization files (`~/.zshrc`, `~/.zprofile`) are **not sourced**.
- `launchctl` user context differs from Terminal user context.

**Mitigation**:
- The LaunchAgent plist must set `EnvironmentVariables` with `PATH` including the Node.js binary directory (e.g., `/opt/homebrew/bin` or `/usr/local/bin`).
- The shell wrapper script should use an absolute path to `node` (resolved at install time).
- Environment variables needed by the Cycle should be explicitly listed in the plist, not assumed from the interactive shell.

### 10.2 Machine Sleep / Wake and Missed Cycle Triggers

macOS laptops sleep when the lid closes or on idle. A scheduled LaunchAgent that fires during sleep is **not queued** — it is skipped.

**Mitigation strategies**:
1. **Short interval + catch-up on wake**: Configure the LaunchAgent with `StartInterval` (e.g., 60 seconds). On wake, the next interval fires soon. The Cycle is cursor-driven and idempotent, so a skipped Cycle does not lose work.
2. **`KeepAlive` consideration**: `KeepAlive` would restart the process immediately, but the Cycle runner is not a daemon. Do not use `KeepAlive` for a bounded Cycle runner.
3. **Wake notification** (v1): Register for `com.apple.powersources.haspower` or `NSWorkspaceDidWakeNotification` (if a GUI helper existed, which it does not in v0) to trigger an immediate Cycle on wake. For v0, short interval is sufficient.

**Fixture-proven behavior** (`packages/sites/macos/test/sleep-wake-recovery.test.ts`):

| Scenario | Condition | Expected Behavior | Fixture Result |
|----------|-----------|-------------------|----------------|
| **A — Sleep before Cycle** | Machine sleeps before Cycle start; Cycle is skipped | On wake, next interval fires. Cursor-driven catch-up processes all pending deltas. No phantom trace for skipped interval. Health remains healthy. | ✅ Proven |
| **B — Sleep mid-Cycle (TTL expires)** | Machine sleeps after lock acquire; process dies; lock TTL expires during sleep | Next Cycle steals stale lock via `FileLock` TTL detection or `recoverStuckLock()`. Catch-up Cycle completes successfully. Health stays healthy — recovery is normal unattended behavior. | ✅ Proven |
| **C — Sleep mid-Cycle (wake before TTL)** | Machine sleeps after lock acquire; process survives or lock is still fresh on wake | Next Cycle fails fast (lock held). Sleep itself is not counted as a failure; health transitions only if the lock-hold collision is treated as a cycle failure (degraded, not critical). | ✅ Proven |
| **D — Long sleep (> multiple intervals)** | Multiple intervals missed; old process died, leaving stale lock | First post-wake Cycle recovers lock and processes all pending work. Lock prevents duplicate Cycles. Subsequent interval fires find no new deltas. Health resets to healthy. | ✅ Proven |

**Key fixture findings**:
- `FileLock` on macOS uses **pure time-based stale detection** (`mtime` age > `staleAfterMs`). No PID check is performed on macOS, which is sufficient because `mkdir`-based locking is atomic on Unix and a crashed process cannot update directory `mtime`.
- Cursor state (`FileCursorStore`) survives sleep gaps without corruption. The post-wake Cycle reads the pre-sleep cursor and continues from it.
- A stale lock is automatically removed by `FileLock.acquire()` during its retry loop; the runner's `recoverStuckLock()` is a secondary fallback.
- Health transitions are **outcome-driven**, not time-driven. A long gap between Cycles does not degrade health unless a Cycle actually fails.

### 10.3 Keychain Access from Background Agents

The `security` CLI and Keychain Services API require TCC (Transparency, Consent, and Control) authorization. The first access from a new binary or terminal app triggers a system dialog.

For a LaunchAgent:
- If the Node.js binary was first launched from Terminal and the user clicked "Always Allow," subsequent LaunchAgent access may succeed.
- If not, the `security` command may fail with `errSecUserCanceled` or hang waiting for a UI interaction that never comes.

**Mitigation**:
- Document that the operator must run one interactive `security find-generic-password` command before activating the LaunchAgent.
- Provide a `narada site setup-keychain --site {site_id}` command that performs a no-op Keychain read to trigger the TCC prompt interactively.
- Always fall back to env/`.env` if Keychain returns an error.

### 10.4 TCC Prompts or Permission Denial

Beyond Keychain, TCC may restrict:
- Filesystem access outside the sandbox (for sandboxed apps — Node.js CLI is generally not sandboxed, but Apple Silicon hardened runtime may apply)
- Network access (rare for CLI tools, but possible in enterprise-managed environments)
- Full Disk Access (for reading Mail.app data — not relevant for Narada's Graph API path)

**Mitigation**:
- Narada runs as an un-sandboxed Node.js CLI process. It does not require Full Disk Access for its v0 scope.
- Document that enterprise MDM policies that restrict `/usr/local/bin` or network access may require exceptions.

### 10.5 Path Names with Spaces in `Application Support`

The canonical Site root `~/Library/Application Support/Narada/{site_id}` contains a space. This breaks naive shell scripting.

**Mitigation**:
- All shell wrapper scripts must quote `"${SITE_ROOT}"`.
- The LaunchAgent plist `ProgramArguments` array must pass the path as a single array element (plist arrays handle this naturally).
- Node.js `path.join()` and `fs` operations are unaffected.

### 10.6 Local Development vs Unattended `launchd` Execution

Developers often run Narada interactively during development. The LaunchAgent runs unattended. These two contexts differ in:
- Environment variables (interactive shell vs LaunchAgent minimal env)
- Working directory (interactive cwd vs LaunchAgent sets `/`)
- Stdout/stderr destination (Terminal vs `~/Library/Logs/` or `/dev/null`)
- Signal handling (`Ctrl+C` vs `launchctl stop`)

**Mitigation**:
- The Cycle runner must be cwd-agnostic. All paths must resolve through `{siteRoot}` or env vars.
- Stdout/stderr should be redirected to `{siteRoot}/logs/cycles/{timestamp}.log` in the LaunchAgent plist.
- The CLI `narada cycle --site {site_id}` command must work identically in both contexts.

### 10.7 Visible Menu Bar App or GUI Helper

A macOS menu bar app (e.g., showing Site health in the system tray) is **out of scope** for v0. It may be considered in v1 if operator experience demands it. The v0 operator surface is CLI + localhost HTTP only.

---

## 11. Post-Implementation Notes (Tasks 431–435)

The following corrections and additions were discovered during implementation and are recorded here for future substrate work.

### 11.1 Stale Task Number References

The design document §1 originally referenced "Tasks 429–434" and "Task 434 closure." The actual chapter tasks are **431–436**, with Task 436 as the closure review. These references have been corrected in this document.

### 11.2 Coordinator Database Path

The design document §8 showed `coordinator.db` at the Site root. The actual implementation places it at **`db/coordinator.db`** (inside a `db/` subdirectory). This keeps the Site root cleaner and aligns with the `SITE_SUBDIRECTORIES` convention in `path-utils.ts`.

### 11.3 Module Names and Boundaries

The boundary contract proposed in the chapter DAG anticipated modules that emerged slightly differently during implementation:

| Contract Anticipation | Actual Name | Rationale |
|-----------------------|-------------|-----------|
| `credential-resolver.ts` | `credentials.ts` | Shorter; aligns with `@narada2/control-plane` naming conventions |
| `operator-surface.ts` | `observability.ts` | Explicitly read-only; mirrors control-plane `observability/` boundary |
| `MacosSiteSupervisor` class | `supervisor.ts` (pure functions) | Template generators have no mutable state; functions are sufficient |

No additional modules (registry, aggregation, cross-site notifier) were created for macOS v0. These remain Windows-specific features that macOS may adopt in v1 if multi-Site scheduling is justified.

### 11.4 Site-Local Coordinator vs Control-Plane Coordinator

The design assumed the macOS runner might write health and trace directly into the control-plane coordinator. During implementation (Task 434), a separate **site-local coordinator** (`SqliteSiteCoordinator`) was introduced with its own SQLite file (`{siteRoot}/db/coordinator.db`).

**Rationale:**
- The macOS Site package must not depend on control-plane internals for its own health/trace storage.
- Site-local health/trace tables (`site_health`, `cycle_traces`) are simpler and avoid schema coupling.
- The control-plane coordinator remains the authority for `work_item`, `execution_attempt`, and `outbound_handoff` state.
- Site-local tables are substrate-agnostic; they could move into a generic substrate if abstraction is justified later.

### 11.5 `"stuck_recovery"` Outcome Is Unreachable

`MacosCycleOutcome` includes `"stuck_recovery"`, and `computeHealthTransition` handles it (maps to `critical` status). However, the macOS runner never passes `"stuck_recovery"` as an outcome:

- When `recoverStuckLock()` succeeds before a Cycle, the Cycle proceeds normally and uses `"success"` if it completes.
- When `recoverStuckLock()` fails (or lock acquisition fails outright), the Cycle throws and the catch block uses `"failure"`.

**Resolution:** Either wire `"stuck_recovery"` in the recovery success path (treat recovered lock as a warning, not a clean success), or remove `"stuck_recovery"` from `MacosCycleOutcome` in v1.

### 11.6 Steps 2–6 Are Fixture Stubs

The `runCycle()` step handlers for sync, derive, evaluate, handoff, and reconcile are explicit no-op fixtures with comments noting the v1 wiring path:

```typescript
// v0: no-op fixture. In v1, this runs context formation + foreman admission.
```

This is identical to the Cloudflare and Windows v0 patterns. The fixture stubs preserve IAS boundaries: even though they do nothing, they occupy the correct step slots and cannot accidentally bypass foreman, scheduler, or outbound handoff.

### 11.7 Keychain Testing Is Mocked

The credential resolver tests (`credentials.test.ts`) mock the `security` CLI via `_setTestExecImpl()`. No real Keychain access is exercised in CI. Real TCC behavior (permission dialogs, `errSecUserCanceled`, hangs) is documented but not fixture-proven.

### 11.8 Sleep/Wake Fixture Findings

`packages/sites/macos/test/sleep-wake-recovery.test.ts` proved:

- `FileLock` on macOS uses **pure time-based stale detection** (`mtime` age > `staleAfterMs`). No PID check is performed, which is sufficient because `mkdir`-based locking is atomic on Unix.
- Cursor state (`FileCursorStore`) survives sleep gaps without corruption.
- A stale lock is automatically removed by `FileLock.acquire()` during its retry loop; `recoverStuckLock()` is a secondary fallback.
- Health transitions are **outcome-driven**, not time-driven.

### 11.9 No Cross-Site Aggregation

Unlike Windows (Tasks 380–381), macOS v0 does not implement `SiteRegistry`, `aggregateHealth`, `deriveAttentionQueue`, or `CrossSiteNotificationRouter`. These may be ported from Windows in v1 if multi-Site scheduling is justified.

---

## 12. What Must Not Be Claimed

| Claim | Status | Why |
|-------|--------|-----|
| Generic Site abstraction | **Deferred** | Not enough commonality proven yet. Propose in Task 436 closure if justified. |
| macOS is "basically Linux" | **Forbidden** | macOS has distinct scheduling, credential, permission, and filesystem conventions. |
| macOS is a vertical | **Forbidden** | macOS Site is a substrate, not a mailbox or campaign feature. |
| GUI / menu bar app | **Deferred** | Out of scope for v0. CLI + localhost HTTP only. |
| Notarization / Gatekeeper bypass | **Deferred** | v0 assumes Node.js is already installed and runnable. Code signing is v1. |
| Developer machine layout dependence | **Forbidden** | All paths must resolve through `~/Library/Application Support/` or documented env vars. No hard-coded `/Users/...` paths. |

---

## 13. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Cloudflare sibling materialization |
| [`docs/deployment/windows-site-materialization.md`](windows-site-materialization.md) | Windows sibling materialization |
| [`docs/product/unattended-operation-layer.md`](../product/unattended-operation-layer.md) | Unattended semantics apply equally to macOS Sites |
| [`docs/deployment/macos-site-boundary-contract.md`](macos-site-boundary-contract.md) | Actionable boundary contract with authority table, interface signatures, and reuse inventory |
| [`AGENTS.md`](../../AGENTS.md) | Agent navigation hub; critical invariants |
| `packages/sites/macos/` | Implementation package (created by Tasks 431–435) |
