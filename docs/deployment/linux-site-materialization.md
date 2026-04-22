# Linux Site Materialization Design

> Design for Narada Site materializations on native Linux substrates.
>
> This document uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
>
> For precision contexts, the canonical expansions apply: **Operation Specification / Runtime Locus / Control Cycle / Effect Intent / Evidence Trace**.

---

## 1. Introduction

Linux is a **sibling Site substrate** to Cloudflare, Windows, and macOS. It is not a generic local runtime, not "WSL without Windows," and not a vertical. Narada should learn the Linux deployment boundary from an honest native Linux materialization before extracting a provider-neutral substrate model.

Linux introduces distinct unattended-operation primitives that deserve first-class treatment:

- `systemd` user and system units with native activation semantics;
- `systemd` timers as first-class scheduled invocation;
- `journald` as the primary structured log sink;
- filesystem conventions under `/var/lib`, `/etc`, `/run`, and XDG user directories;
- service hardening options (`NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`, etc.);
- multiple secret stores (systemd credentials, env files, Secret Service / `libsecret`, `pass`);
- headless server operation without graphical session dependencies;
- explicit boot and network ordering (`After=network.target`);
- package manager and distribution differences.

The Linux family covers three distinct runtime loci:

| Variant | Host | Process Model | Filesystem | Credential Store | Scheduling |
|---------|------|---------------|------------|------------------|------------|
| **System-mode** | Native Linux host | systemd system service | ext4/btrfs/xfs under `/var/lib` | systemd credentials, env, config file | systemd system timer |
| **User-mode** | Native Linux host | systemd user service | ext4/btrfs/xfs under `~/.local/share` | Secret Service, `pass`, env, config file | systemd user timer |
| **Container-hosted** | Container runtime | Container process | Overlay/container volume | Env, secrets volume, config file | External scheduler (deferred) |

All three variants are **Sites**, not operations, not verticals, and not deployment targets in the infrastructure sense.

### Generic Site Abstraction Status

> **Deferred.**
>
> This chapter documents one concrete Linux materialization with two primary variants (system-mode and user-mode). A generic `Site` abstraction (interface, base class, or shared package) is **not justified yet**. The Cloudflare, Windows, and Linux families differ in lock mechanism, secret binding, and process lifecycle enough that premature abstraction would hide real substrate constraints.
>
> If Tasks 430–435 reveal substantial commonality (e.g., identical health schema, identical cycle-step pipeline, identical trace format), a shared `@narada2/site-core` package may be proposed in the closure review (Task 435). Until then, each substrate keeps its own package or module.

---

## 2. Definitions

### `Site`

The **semantic anchor** for an Aim-at-Site binding.

A Linux Site holds:
- state (facts, work items, decisions, confirmations)
- substrate bindings (Graph API, charter runtime, secrets)
- runtime context (policy, posture, allowed actions)

A `/var/lib/narada/{site_id}/` directory is one Site. A `~/.local/share/narada/{site_id}/` directory is another.

### `Site substrate`

The **capability class** that a Site requires from its host environment.

#### System-mode Linux substrate class

```text
linux-native-systemd-system-sqlite
```

Requires:
- scheduled invocation (systemd system timer)
- durable coordination with filesystem locking (`better-sqlite3`)
- bounded execution environment (Linux process under systemd)
- object storage for large artifacts (local filesystem)
- secret binding (systemd credentials, environment variables, or config file)
- operator surface (CLI or localhost HTTP)
- service management (`systemctl`)
- journald logging

#### User-mode Linux substrate class

```text
linux-native-systemd-user-sqlite
```

Requires:
- scheduled invocation (systemd user timer)
- durable coordination with filesystem locking (`better-sqlite3`)
- bounded execution environment (Linux process under `systemd --user`)
- object storage for large artifacts (local filesystem under XDG paths)
- secret binding (Secret Service / `libsecret`, `pass`, environment variables, or config file)
- operator surface (CLI or localhost HTTP)
- user session availability for `systemd --user`
- journald logging (user journal)

#### Container-hosted Linux substrate class (deferred)

```text
linux-container-overlay-sqlite
```

Requires:
- scheduled invocation from external orchestrator
- durable coordination with filesystem locking inside container
- bounded execution environment (container process)
- object storage for large artifacts (container volume or bind mount)
- secret binding (env, secrets volume, config file)

### `Site materialization`

The **concrete files, units, and scheduled timers** that instantiate a Site.

For system-mode Linux, a materialization is the sum of:
- one systemd service unit (`narada-site-{site_id}.service`)
- one systemd timer unit (`narada-site-{site_id}.timer`)
- one dedicated system user (`narada` or per-Site user) **(recommended, not required for v0)**
- one directory tree under `/var/lib/narada/{site_id}/` holding SQLite state, config, and traces
- optional config under `/etc/narada/{site_id}/config.json`
- runtime state under `/run/narada/{site_id}/`
- systemd credentials or environment bindings for secrets
- one local HTTP server (optional) for operator status

For user-mode Linux, a materialization is the sum of:
- one systemd user service unit (`narada-site-{site_id}.service`)
- one systemd user timer unit (`narada-site-{site_id}.timer`)
- one directory tree under `~/.local/share/narada/{site_id}/` holding SQLite state, config, and traces
- config under `~/.config/narada/{site_id}/config.json`
- runtime state under `/run/user/$(id - u)/narada/{site_id}/`
- Secret Service, `pass`, environment, or config bindings for secrets
- one local HTTP server (optional) for operator status

### `Cycle runner`

The **process machinery** that advances an Aim at the Site.

The Linux Cycle runner is not a long-running daemon. It is a scheduled process that:
1. receives a systemd timer invocation
2. acquires the Site coordination lock
3. executes one bounded Cycle
4. releases the lock and exits

> **Distinction from daemon mode**: The existing `narada-daemon` is a continuous runner that stays resident. The Linux Site Cycle runner is a bounded, exit-after-completion process more analogous to `cron` jobs. Both may use systemd, but the Cycle runner uses `Type=oneshot` while the daemon uses `Type=simple`.

### `Trace storage`

Where **decisions, logs, run evidence, and health** are written.

On Linux:
- SQLite holds compact control-state Traces (decisions, evaluations, transitions)
- filesystem holds large Trace artifacts (raw sync snapshots, evaluation dumps)
- `journald` holds ephemeral execution Traces (structured log lines via `StandardOutput=journal`)
- optional Site-local `logs/` directory for file-based trace fallback

---

## 3. Linux Resource Mapping

### 3.1 System-Mode

| Linux Resource | Narada Reading |
| --- | --- |
| **Node.js process under systemd** | Cycle runner. Receives timer invocation, executes Cycle, exits. Stateless between invocations. |
| **systemd system timer** | Cycle scheduler. Fires the service unit at a configured interval. |
| **systemd system service (`Type=oneshot`)** | Cycle execution container. One-shot service that runs the Cycle runner and exits. |
| **Filesystem directory (`/var/lib/narada/{site_id}`)** | Site state, config, SQLite coordinator, and trace artifact root. |
| **Runtime directory (`/run/narada/{site_id}`)** | Lock files, PID files, and ephemeral runtime state. Created via `RuntimeDirectory=` directive. |
| **SQLite (`better-sqlite3`)** | Coordinator/control-state store. Strong consistency via single-writer SQLite. |
| **systemd credentials / env file / config** | Secret binding for Graph API, Kimi API, and admin tokens. |
| **journald** | Ephemeral execution traces. Structured JSON log lines with systemd metadata. |
| **Localhost HTTP server (optional)** | Operator surface. `GET /status` returns health and last-Cycle summary. |

### 3.2 User-Mode

| Linux Resource | Narada Reading |
| --- | --- |
| **Node.js process under `systemd --user`** | Cycle runner. Receives user timer invocation, executes Cycle, exits. |
| **systemd user timer** | Cycle scheduler. Fires the user service unit at a configured interval. |
| **systemd user service (`Type=oneshot`)** | Cycle execution container. Runs under user's systemd instance. |
| **Filesystem directory (`~/.local/share/narada/{site_id}`)** | Site state, config, SQLite coordinator, and trace artifact root. |
| **Runtime directory (`/run/user/$(id - u)/narada/{site_id}`)** | Lock files and ephemeral runtime state. |
| **SQLite (`better-sqlite3`)** | Same as system-mode: coordinator/control-state store. |
| **Secret Service / `pass` / env / config** | Secret binding. User-mode has richer desktop secret store options. |
| **journald (user journal)** | Ephemeral execution traces. Query via `journalctl --user`. |
| **Localhost HTTP server (optional)** | Same as system-mode: operator status surface. |

### 3.3 Cross-Variant Commonality

Both variants share these Narada concerns, even though the Linux substrate differs:

| Concern | System-Mode | User-Mode |
|---------|-------------|-----------|
| **Site identity** | `site_id` string, directory name under `/var/lib/narada/` | `site_id` string, directory name under `~/.local/share/narada/` |
| **Cycle trigger** | systemd system timer → `Type=oneshot` service → Node.js | systemd user timer → `Type=oneshot` user service → Node.js |
| **Coordinator/storage** | `better-sqlite3` file at `{siteRoot}/coordinator.db` | Same (`better-sqlite3` file) |
| **Lock/recovery model** | `FileLock` from `@narada2/control-plane` (cross-platform, handles Linux via PID check) | Same `FileLock` |
| **Health/trace location** | SQLite `site_health` + `cycle_traces` tables | Identical SQLite tables |
| **Trace artifacts** | `{siteRoot}/traces/` | `{siteRoot}/traces/` |
| **Secret binding** | systemd credentials → env → `.env` → config | Secret Service → `pass` → env → `.env` → config |
| **Operator inspection** | `narada status --site {site_id}` or localhost HTTP | Same CLI surface |
| **Control surface** | CLI commands (`narada recover`, `narada derive-work`) | Same CLI commands |
| **journald logs** | `journalctl -u narada-site-{site_id}.service` | `journalctl --user -u narada-site-{site_id}.service` |

> **Key insight**: The Cycle runner, SQLite schema, and Narada runtime code are **substrate-agnostic**. Only the *scheduler*, *credential store*, *filesystem path conventions*, and *systemd scope* (system vs user) change between system-mode and user-mode.

---

## 4. Linux Deployment Modes

### 4.1 System-Mode Linux Site

A Site running as a system-level service under the system systemd instance.

**Characteristics:**
- Runs independently of user sessions
- Suitable for headless servers, VPS, cloud instances
- Uses system-wide paths (`/var/lib`, `/etc`, `/run`)
- Requires root or `systemd` privileges to install units
- Can use `systemd` credential loading (`LoadCredential=`) for secret injection
- journald logs are system-wide

**v0 Scope:**
- systemd service + timer units
- `/var/lib/narada/{site_id}/` data directory
- `FileLock` for coordination
- `computeHealthTransition()` for health
- env / `.env` / config file secret binding
- CLI operator surface

**Deferred:**
- Dedicated per-Site system user
- `systemd` credential loading (`LoadCredential=`)
- Full service hardening (`NoNewPrivileges`, `ProtectSystem=strict`, etc.)
- Socket activation
- `Notify` service type

### 4.2 User-Mode Linux Site

A Site running under a user account's systemd instance (`systemd --user`).

**Characteristics:**
- Tied to user session lifecycle (user logs out → services may stop unless `linger` enabled)
- Suitable for developer workstations, personal machines
- Uses XDG paths (`~/.local/share`, `~/.config`, `/run/user/$(id - u)`)
- Does not require root to install units
- Can use Secret Service / `libsecret` and `pass` for secret storage
- journald logs are per-user

**v0 Scope:**
- systemd user service + timer units
- `~/.local/share/narada/{site_id}/` data directory
- `FileLock` for coordination
- `computeHealthTransition()` for health
- env / `.env` / config file secret binding
- CLI operator surface

**Deferred:**
- Secret Service / `libsecret` integration
- `pass` integration
- `loginctl enable-linger` automation
- Full service hardening

### 4.3 Container-Hosted Linux Site

A Site running inside a Linux container.

**Characteristics:**
- Runs inside a container runtime (Docker, Podman, etc.)
- Scheduler is external to the container (cron on host, Kubernetes CronJob, etc.)
- Secrets via environment variables, bind-mounted files, or container secret mechanisms
- No systemd dependency inside container

**Status:** Explicitly deferred unless needed. The design does not smear container concerns into the native Linux materialization. If container support is required later, it will be a separate substrate class with its own chapter.

---

## 5. Bounded Linux Cycle

A Linux Cycle is a **bounded attempt** to advance an Aim at a Site. It must complete within the execution limits of the host process (no infinite loops, no unbounded memory growth).

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
- The next systemd timer invocation picks up where the partial Trace left off (cursor-driven, idempotent).
- No Cycle may assume it is the only running process. Lock acquisition is mandatory.

### systemd Timer Configuration

```ini
# /etc/systemd/system/narada-site-{site_id}.timer (system-mode)
# ~/.config/systemd/user/narada-site-{site_id}.timer (user-mode)

[Unit]
Description=Narada Site {site_id} Cycle Timer

[Timer]
OnBootSec=60
OnUnitActiveSec=300
AccuracySec=1min

[Install]
WantedBy=timers.target
```

The `OnUnitActiveSec=300` means the timer fires every 5 minutes after the service unit last activated. This naturally spaces Cycles and avoids pile-up if a Cycle exceeds its interval.

---

## 6. Linux-Specific Concerns

### 6.1 systemd User vs System Service Boundaries

The same Site must not mix system and user scope for the same `site_id`. A Site is either system-mode or user-mode. Migration between modes is an operator action that moves data and reconfigures units.

Key differences:

| Concern | System | User |
|---------|--------|------|
| `systemctl` command | `systemctl start ...` | `systemctl --user start ...` |
| Unit path | `/etc/systemd/system/` | `~/.config/systemd/user/` |
| journald query | `journalctl -u ...` | `journalctl --user -u ...` |
| Session dependency | None | Requires user session or `linger` |
| Privilege requirement | Root | None |
| `RuntimeDirectory=` | `/run/narada/{site_id}` | `/run/user/UID/narada/{site_id}` |

### 6.2 Headless Server Operation

Linux Sites must work on headless servers without graphical sessions, D-Bus, or desktop environment dependencies.

- User-mode Sites on headless servers require `loginctl enable-linger $USER` so user services continue after logout.
- Secret Service / `libsecret` may not be available on headless servers; the credential resolver must fall through to env / `.env` / config.
- The operator surface must be available via CLI and optionally localhost HTTP; no GUI dependency.

### 6.3 Boot Ordering and Network Availability

The systemd unit must declare correct ordering:

```ini
[Unit]
After=network-online.target
Wants=network-online.target
```

This ensures the Cycle does not attempt source sync before network is available. For user-mode, `default.target` is sufficient if the user session starts after network.

### 6.4 journald vs File Logs

journald is the **primary** trace sink for Linux Sites. File logs in `{siteRoot}/logs/` are an optional fallback.

| Concern | journald | File Logs |
|---------|----------|-----------|
| Structured metadata | Yes (PRIORITY, SYSLOG_IDENTIFIER, UNIT) | Must be embedded in JSON |
| Rotation | Automatic (`SystemMaxUse=`) | Manual or `logrotate` |
| Remote forwarding | `systemd-journal-remote` | Custom |
| Query | `journalctl` | `cat` / `tail` |
| Availability | Requires systemd | Always available |

v0 uses journald primary, file fallback. v1 may add structured log shipping.

### 6.5 Secret Injection and File Permissions

System-mode secrets:

1. **systemd `LoadCredential=`** (v1) — loads credentials from files into `$CREDENTIALS_DIRECTORY`
2. **Environment variables** — set via `Environment=` in unit file or `/etc/default/narada-{site_id}`
3. **`.env` file** in Site root
4. **Config file values** (lowest precedence)

User-mode secrets:

1. **Secret Service / `libsecret`** (v1) — desktop secret store
2. **`pass`** (v1) — password-store via GPG
3. **Environment variables**
4. **`.env` file**
5. **Config file values**

File permissions:
- `/var/lib/narada/{site_id}/` should be `0750` (owner: `narada`, group: `narada`)
- `/etc/narada/{site_id}/config.json` should be `0640`
- `~/.local/share/narada/{site_id}/` should be `0700`
- `~/.config/narada/{site_id}/config.json` should be `0600`

> **v0 does not enforce permissions automatically**. The design documents the recommended permissions; enforcement is deferred to v1.

### 6.6 Service Hardening Options

Recommended hardening for the systemd service unit (v1 scope unless noted):

```ini
[Service]
# Basic hardening (recommended for v1)
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/narada/{site_id} /run/narada/{site_id}
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
MemoryMax=512M
TasksMax=50

# v0: minimal hardening
NoNewPrivileges=yes
PrivateTmp=yes
```

v0 uses minimal hardening (`NoNewPrivileges`, `PrivateTmp`). Full sandboxing is v1.

### 6.7 Package Manager Differences

Installation scripts may need to handle:

| Distribution | Package Manager | Service Enable |
|--------------|-----------------|----------------|
| Debian/Ubuntu | `dpkg` / `apt` | `systemctl enable` |
| RHEL/CentOS/Fedora | `rpm` / `dnf` | `systemctl enable` |
| Arch | `pacman` | `systemctl enable` |
| Generic | tarball | manual systemd unit install |

Package manager integration is **deferred** to v1. v0 uses tarball or manual installation.

### 6.8 Cron Fallback

If systemd is unavailable (e.g., minimal container, WSL without systemd, old sysvinit system), a cron fallback is provided:

```cron
*/5 * * * * /usr/bin/narada cycle --site {site_id}
```

The cron fallback:
- Uses the same Cycle runner executable
- Uses the same `FileLock`
- Writes to the same SQLite health/trace tables
- Does not use journald (falls back to file logs)

Cron fallback is **in scope for v0** as an alternative scheduler path.

---

## 7. v0 Prototype Boundary

### In v0 — System-Mode

```text
One systemd service unit
+ one systemd timer unit
+ one /var/lib/narada/{site_id}/ directory with better-sqlite3
+ environment or .env bindings
```

can execute **one bounded mailbox Cycle** for **one configured Aim-at-Site binding**, write health/Trace, and expose a **local operator status endpoint** (or CLI).

Specifically, v0 requires:
- systemd timer fires `Type=oneshot` service → begins Cycle
- `FileLock` metadata directory holds coordination lock; SQLite file holds compact state
- filesystem holds message payloads, sync snapshots, evaluation evidence
- env / `.env` holds Graph API and charter runtime credentials
- Cycle completes: sync → admit → evaluate → govern → handoff → reconcile → trace
- Process exits cleanly after lock release
- CLI `narada status --site {site_id}` returns health and last-Cycle summary

### In v0 — User-Mode

```text
One systemd user service unit
+ one systemd user timer unit
+ one ~/.local/share/narada/{site_id}/ directory with better-sqlite3
+ environment or .env bindings
```

can execute the same bounded Cycle with the same semantics. The user-mode variant is suitable for developer workstations and personal machines.

### Deferred

- **Full charter runtime in subprocess** — v0 proves the Cycle can run *something* bounded; full charter/tool catalog is v1
- **Multi-Site** — one systemd timer per Site for v0; shared scheduling across Sites is v1
- **Operator action mutations** — approve/reject drafts via endpoint or CLI; v0 is observation-only
- **Multi-vertical** — mailbox only for v0; timer/webhook peers are v1
- **Real-time sync** — webhook push instead of polling; v1
- **systemd credential loading (`LoadCredential=`)** — deferred to v1
- **Secret Service / `libsecret` / `pass` integration** — deferred to v1
- **Full service hardening** — deferred to v1
- **Package manager integration** — deferred to v1
- **Container-hosted Site** — explicitly deferred to a separate chapter if needed

---

## 8. Filesystem Layout

### 8.1 System-Mode

```text
/var/lib/narada/{site_id}/
  ├── config.json              # Site configuration (posture, sources, charters)
  ├── coordinator.db           # SQLite: locks, health, traces, control state
  ├── .env                     # Optional fallback secrets
  ├── logs/
  │   └── cycles/              # Structured JSON log lines per Cycle (fallback)
  ├── traces/
  │   └── {cycle_id}.json      # Cycle trace artifacts
  ├── snapshots/
  │   └── {timestamp}.json     # Raw sync snapshots
  └── messages/
      └── {context_id}/        # Message payloads per context

/etc/narada/{site_id}/
  └── config.json              # Alternative config location (optional)

/run/narada/{site_id}/         # Created by RuntimeDirectory= directive
  ├── lock/                    # FileLock metadata directory
  └── runtime.state            # Ephemeral runtime state
```

### 8.2 User-Mode

```text
~/.local/share/narada/{site_id}/
  ├── config.json
  ├── coordinator.db
  ├── .env
  ├── logs/cycles/
  ├── traces/
  ├── snapshots/
  └── messages/

~/.config/narada/{site_id}/
  └── config.json              # Alternative config location (optional)

/run/user/$(id - u)/narada/{site_id}/
  ├── lock/
  └── runtime.state
```

The user-mode layout mirrors the system-mode layout with XDG path conventions.

### 8.3 Path Resolution Precedence

When resolving the Site root for a given `site_id`:

1. `NARADA_SITE_ROOT` environment variable (highest precedence)
2. For system-mode: `/var/lib/narada/{site_id}/`
3. For user-mode: `~/.local/share/narada/{site_id}/`
4. Config-relative path if invoked with explicit `--config` (lowest precedence)

When resolving config:

1. `{siteRoot}/config.json`
2. For system-mode: `/etc/narada/{site_id}/config.json`
3. For user-mode: `~/.config/narada/{site_id}/config.json`

---

## 9. Secret Binding and Rotation

### 9.1 System-Mode: Environment / `.env`

Secrets are resolved in this precedence:

1. **Environment variables** (`NARADA_{site_id}_{secret_name}`)
2. **`.env` file** in Site root
3. **Config file values** (lowest precedence)

Examples:

```text
NARADA_HELP_GRAPH_ACCESS_TOKEN
NARADA_HELP_GRAPH_TENANT_ID
NARADA_HELP_GRAPH_CLIENT_ID
NARADA_HELP_GRAPH_CLIENT_SECRET
NARADA_HELP_KIMI_API_KEY
NARADA_HELP_ADMIN_TOKEN
```

### 9.2 User-Mode: Secret Service / `pass` / Env / `.env`

User-mode secrets (full precedence for v1; v0 uses env / `.env` only):

1. **Secret Service / `libsecret`** — via `secret-tool` or Node.js `keytar` equivalent
2. **`pass`** — via `pass narada/{site_id}/{secret_name}`
3. **Environment variables**
4. **`.env` file**
5. **Config file values**

### 9.3 Rotation Strategy

- Secrets are rotated manually by the operator.
- The Cycle reads secrets at invocation time; no caching beyond one Cycle.
- On secret mismatch (e.g., 401 from Graph API), the Cycle fails gracefully and records the auth failure in health/Trace.
- Automatic secret rotation is deferred to v1.

---

## 10. Sibling Substrate Comparison

| Mechanism | Cloudflare | Windows Native | Windows WSL | macOS | Linux |
|-----------|------------|----------------|-------------|-------|-------|
| **Scheduler** | Cron Trigger → Worker | Task Scheduler → PowerShell → Node.js | systemd timer / cron → shell → Node.js | LaunchAgent → Node.js | systemd timer → `Type=oneshot` service → Node.js |
| **Site root** | DO instance + R2 | `%LOCALAPPDATA%\Narada\{site_id}` | `/var/lib/narada/{site_id}` or `~/narada/` | `~/Library/Application Support/Narada/{site_id}` | `/var/lib/narada/{site_id}` (system) or `~/.local/share/narada/{site_id}` (user) |
| **Credential store** | Worker Secrets | Windows Credential Manager or env | env / `.env` | macOS Keychain or env | systemd credentials (v1) / env / `.env` / Secret Service / `pass` (user) |
| **Lock** | DO SQLite `site_locks` | `FileLock` (mkdir-based) | `FileLock` | `FileLock` | `FileLock` |
| **Health** | `computeHealthTransition()` in Worker | `computeHealthTransition()` | `computeHealthTransition()` | `computeHealthTransition()` | `computeHealthTransition()` |
| **Trace** | DO SQLite + R2 + Worker Logs | SQLite + NTFS + Event Log | SQLite + ext4 + journald | SQLite + APFS + unified logging | SQLite + filesystem + journald |
| **Operator surface** | HTTP `GET /status` | CLI + optional localhost HTTP | CLI + optional localhost HTTP | CLI + optional localhost HTTP | CLI + optional localhost HTTP |
| **Process execution** | Event-driven Worker | PowerShell/Node process | shell/Node process | Node.js process under launchd | Node.js process under systemd |
| **Secret injection** | `NARADA_{site}_{name}` env binding | `Narada/{site}/{name}` Credential Manager or env | `NARADA_{site}_{name}` env | Keychain or env | Env / `.env` / `LoadCredential=` (v1) / Secret Service (user, v1) |
| **Install/uninstall** | `wrangler deploy` / `wrangler delete` | PowerShell registration script | systemd unit files + shell script | LaunchAgent plist + shell script | systemd unit files + `systemctl enable` or tarball |

---

## 11. What Must Not Be Claimed

| Claim | Status | Why |
|-------|--------|-----|
| Generic Site abstraction | **Deferred** | Not enough commonality proven yet. Propose in Task 435 closure if justified. |
| Container-hosted Linux Site | **Deferred** | Requires separate chapter. Do not smear Docker/Kubernetes into native Linux materialization. |
| Linux as "just local development" | **Forbidden** | Linux Site is a first-class unattended substrate, not a development convenience. |
| WSL as "just Linux" | **Forbidden** | WSL is a Windows-hosted substrate with distinct filesystem and interop boundaries. It belongs to the Windows chapter. |
| Mailbox vertical conflation | **Forbidden** | Linux Site is a substrate, not a mailbox feature. Mailbox logic lives in the kernel, not the Site package. |
| systemd as Narada itself | **Forbidden** | systemd is Cycle machinery. Narada is the invariant control form that runs inside the Cycle. |
| journald as authority | **Forbidden** | journald is a Trace surface. Durable boundaries remain in SQLite. |
| Credential stores as authority | **Forbidden** | Credentials are secret sources. Authority remains with Foreman and Scheduler. |
| Generic Site abstraction from path commonality alone | **Forbidden** | Shared path utilities are not sufficient to justify a generic abstraction. Wait for evidence from health, trace, and operator surface commonality. |

---

## 12. Post-Implementation Notes (Tasks 437–441)

The following corrections and additions were discovered during implementation and are recorded here for future substrate work.

### 12.1 Module Names and Boundaries

The boundary contract (`docs/deployment/linux-site-boundary-contract.md`) proposed modules named `config.ts`, `LinuxCredentialResolver` (as a class), and `LinuxSiteSupervisor` (as a class). The actual implementation uses:

| Contract Name | Actual Name | Rationale |
|---------------|-------------|-----------|
| `config.ts` | `observability.ts` (`listAllSites`) | Site discovery by directory scan lives in the observability module; no separate config loader was needed |
| `LinuxCredentialResolver` (class) | `credentials.ts` (plain functions) | `resolveSecret` and `resolveSecretRequired` are stateless async functions; no mutable state needed |
| `LinuxSiteSupervisor` (class) | `supervisor.ts` (class + functions) | `DefaultLinuxSiteSupervisor` is a class, but unit generators (`generateSystemdService`, `generateCronEntry`) are pure functions |
| — | `recovery.ts` (new) | Dedicated `checkLockHealth` and `recoverStuckLock` functions, separated from runner for testability and reuse |

### 12.2 Site-Local Coordinator

The design assumed the Linux runner might write health and trace into the control-plane coordinator. During implementation, a separate **site-local coordinator** (`SqliteSiteCoordinator`) was introduced with its own SQLite file (`{siteRoot}/db/coordinator.db`).

**Rationale:**
- The Linux Site package must not depend on control-plane internals for its own health/trace storage.
- Site-local health/trace tables (`site_health`, `cycle_traces`) are simpler and avoid schema coupling.
- The control-plane coordinator remains the authority for `work_item`, `execution_attempt`, and `outbound_handoff` state.
- Site-local tables are substrate-agnostic; they could move into a generic substrate if abstraction is justified later.

### 12.3 CLI Integration Completed

Unlike the Windows and macOS closures (where CLI integration was deferred to subsequent tasks), Linux Sites received full CLI integration during Task 440:

- `narada cycle --site {site_id} --mode {system|user}` — triggers one bounded Cycle
- `narada status --site {site_id} --mode {system|user}` — reads health and last trace
- `narada doctor --site {site_id} --mode {system|user}` — runs doctor checks
- `narada ops` — discovers Linux Sites alongside Windows and macOS Sites

Substrate auto-detection order in CLI: macOS → Linux → Windows fallback.

### 12.4 Hardening Levels

The implementation introduced an explicit `hardeningLevel` option (`"v0" | "v1"`) in `generateSystemdService()`. This was not anticipated in the original design but aligns with the design doc's §6.6 hardening discussion:

- **v0**: `NoNewPrivileges=yes`, `PrivateTmp=yes`
- **v1**: adds `ProtectSystem=strict`, `ProtectHome=yes`, `ReadWritePaths={siteRoot}`

The `validateSystemdService()` function ensures generated units contain required directives (`[Unit]`, `[Service]`, `Type=oneshot`, network ordering, timeouts).

### 12.5 Recovery Module Separation

Stuck-lock recovery was originally planned as a method on the runner (`recoverStuckLock`). During Task 441, it was extracted into a standalone `recovery.ts` module with:

- `checkLockHealth()` — read-only inspection of lock state
- `recoverStuckLock()` — TTL-based atomic steal

This allows doctor checks and observability to inspect lock health without invoking the runner.

### 12.6 Path Resolution Fixes

Two path-resolution bugs were discovered and fixed during Task 440:

1. **`listAllSites` ignored `NARADA_SITE_ROOT`**: The function originally scanned canonical paths (`/var/lib/narada`, `~/.local/share/narada`) even when `NARADA_SITE_ROOT` was set. Tests now seed canonical paths or set `NARADA_SITE_ROOT` explicitly.

2. **`resolveLinuxSiteMode` preferred system over user when `NARADA_SITE_ROOT` was set**: The function checked the system path first, which meant a user-mode site under `NARADA_SITE_ROOT` could be misidentified as system-mode. Fixed by making `resolveLinuxSiteMode` check the actual resolved path rather than hardcoded canonical paths.

### 12.7 `"stuck_recovery"` Outcome Unreachable

`LinuxCycleOutcome` includes `"stuck_recovery"`, but `DefaultLinuxSiteRunner.runCycle()` never passes it to `computeHealthTransition`. When `recoverStuckLock` succeeds before a cycle, the cycle proceeds with `"success"`. When recovery fails, the cycle throws and uses `"failure"`. The `"stuck_recovery"` type member should either be wired in the recovery success path or removed from the type.

### 12.8 No Notification System

Unlike Windows Sites (which have `notification.ts`, `LogNotificationAdapter`, `WebhookNotificationAdapter`, and `CrossSiteNotificationRouter`), Linux Sites do not implement an operator notification system in v0. The design doc mentions journald as the primary trace sink; structured log-based alerting is deferred to v1.

### 12.9 No Site Registry or Cross-Site Aggregation

Linux Sites do not implement a durable `SiteRegistry`, `aggregateHealth`, or `deriveAttentionQueue` (unlike Windows Sites). Site discovery is performed via filesystem scan (`listAllSites`) on each CLI invocation. Cross-site aggregation is deferred to v1.

---

## 13. Cross-References

| Document | Relationship |
|----------|--------------|
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace and their canonical expansions |
| [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) | Cloudflare sibling materialization — compare substrate mappings |
| [`docs/deployment/windows-site-materialization.md`](windows-site-materialization.md) | Windows sibling materialization — compare native vs WSL approach |
| [`docs/deployment/windows-site-boundary-contract.md`](windows-site-boundary-contract.md) | Boundary contract pattern — Tasks 430–431 follow this structure |
| [`docs/product/unattended-operation-layer.md`](../product/unattended-operation-layer.md) | Unattended semantics apply equally to Linux Sites |
| [`AGENTS.md`](../../AGENTS.md) | Agent navigation hub; critical invariants |
| [`docs/deployment/systemd/narada-daemon.service`](systemd/narada-daemon.service) | Existing systemd service template (daemon mode, not Cycle runner) |
