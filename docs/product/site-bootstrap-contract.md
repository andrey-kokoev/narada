# Site Bootstrap Contract

> Canonical first-run path for creating a Narada **Site** — a runtime locus where bounded Cycles execute.
>
> For the operation bootstrap path (expressing intent and configuring work objectives), see [`bootstrap-contract.md`](bootstrap-contract.md).
>
> This document uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## 1. Overview

A Narada **Site** is a runtime locus — a place where bounded Cycles execute. It is not an operation, not a deployment target in the infrastructure sense, and not a vertical. A Site holds state, substrate bindings, and runtime context for one or more operations.

The Site bootstrap path is **separate from and composes with** the operation bootstrap path:

| Concern | Operation Bootstrap | Site Bootstrap |
|---------|--------------------|----------------|
| **What it creates** | Configured work objective (mailbox, workflow) | Runtime locus (filesystem, scheduler, credentials) |
| **Entry command** | `narada want-mailbox`, `narada want-workflow` | `narada sites init` |
| **Artifact** | `config/config.json` with scopes, sources, charters | `{siteRoot}/config.json` with Site metadata |
| **Authority** | Operator declares intent | Substrate provides execution environment |
| **Repeatable** | Once per operation | Once per Site, or per machine |

An operator may have:
- One operation running on one Site (simplest case)
- Multiple operations running on one Site (shared substrate)
- One operation mirrored across multiple Sites (failover / multi-host)

---

## 2. Canonical Site First-Run Path

The Site bootstrap is an **8-step explicit path**:

```
1. Choose substrate
2. Create Site root
3. Bind operation/config
4. Bind credentials
5. Validate readiness
6. Run one bounded Cycle
7. Enable unattended supervisor
8. Inspect health/trace
```

### Step 1: Choose substrate

Select the substrate class that matches your host environment:

| Substrate | Host | Use when |
|-----------|------|----------|
| `windows-native` | Native Windows | You run on Windows with Task Scheduler |
| `windows-wsl` | Windows Subsystem for Linux | You run inside WSL with systemd/cron |
| `macos` | macOS | You run on macOS with launchd |
| `linux-user` | Linux (user account) | You run under your user account with `systemd --user` |
| `linux-system` | Linux (system service) | You run as a system service with `systemd` |

Cloudflare Site is explicitly deferred from this first-run path.

For Windows Sites, substrate is not the same as authority locus. `windows-native` and `windows-wsl` describe how the Site runs. A Windows Site config may also declare:

| Authority locus | Use when |
|-----------------|----------|
| `user` | The Site represents a Windows user profile: credentials, preferences, operator KB, task governance, and user-scoped tools |
| `pc` | The Site represents machine/session state: display topology, drivers, services, scheduled tasks, and PC recovery actions |

Omitted `locus` fields are treated as user-locus for legacy compatibility. New Windows configs should declare the locus explicitly, especially when a PC Site is temporarily stored under a user-owned root.

Windows root policy follows the authority locus:

| Authority locus | Native Windows root |
|-----------------|---------------------|
| `user` | `%USERPROFILE%\.narada` |
| `pc` | `%ProgramData%\Narada\sites\pc\{site_id}` |

The user-locus Site is the operator's personal working memory and control surface. The PC-locus Site is the machine/session memory and recovery surface.

### Step 2: Create Site root

```bash
narada sites init <site-id> --substrate <substrate> [--operation <operation-id>]
```

This creates:
- The Site root directory (substrate-specific path)
- A minimal Site `config.json` with metadata
- Standard subdirectories (`state/`, `messages/`, `db/`, `logs/`, `traces/`)
- For Windows: a registry entry in the Site registry

Use `--dry-run` to preview without filesystem mutation.

### Step 3: Bind operation/config

If `--operation` was not provided during `sites init`, bind the operation now:

```bash
# The operation config lives in the ops repo
narada setup
narada preflight <operation-id>
```

The Site config and operation config are separate files. The Site config tells Narada *where* to run; the operation config tells Narada *what* to do.

### Step 4: Bind credentials

Set the required secrets for your operation. Each substrate has its own precedence chain:

**Windows native:**
1. Windows Credential Manager (`keytar`)
2. Environment variable (`NARADA_{SITE_ID}_{SECRET_NAME}`)
3. `.env` file in Site root
4. Config file value

**WSL / Linux / macOS:**
1. Environment variable (`NARADA_{SITE_ID}_{SECRET_NAME}`)
2. `.env` file in Site root
3. Config file value

Linux system-mode v1 will add systemd `LoadCredential=`. Linux user-mode v1 will add Secret Service / `pass`. macOS v1 will add Keychain.

### Step 5: Validate readiness

```bash
narada doctor --site <site-id>
```

Checks:
- Site directory exists and is writable
- Coordinator database is readable
- Lock is not stuck
- Supervisor unit is registered (if applicable)
- Health status is not critical

A newly initialized Site will show `warn` for "no cycle recorded yet" and "no health record" — this is expected.

### Step 6: Run one bounded Cycle

```bash
narada cycle --site <site-id>
```

This executes one full Cycle:
1. Acquire Site lock
2. Sync source deltas (fixture-backed in v0)
3. Derive/admit work
4. Evaluate charters
5. Handoff decisions
6. Reconcile submitted effects
7. Update health and trace
8. Release lock

The first Cycle initializes the coordinator database (`db/coordinator.db`) and creates the first health record.

### Step 7: Enable unattended supervisor

```bash
narada sites enable <site-id> [--interval-minutes <n>]
```

This generates and writes the substrate-specific supervisor configuration:

| Substrate | Supervisor | Generated files |
|-----------|------------|-----------------|
| `windows-native` | Task Scheduler | PowerShell registration script |
| `windows-wsl` | systemd / cron | `.service` + `.timer` units, or cron entry |
| `macos` | launchd | `.plist` + wrapper script |
| `linux-user` | systemd user / cron | `.service` + `.timer` units, or cron entry |
| `linux-system` | systemd system / cron | `.service` + `.timer` units, or cron entry |

Use `--dry-run` to preview without writing files.

**Important:** `sites enable` generates configuration files but does not automatically register them with the host supervisor. The command prints the exact manual activation step (e.g., `systemctl enable narada-site-{id}.timer`, `launchctl load ...`). This avoids requiring elevated privileges during the bootstrap flow.

### Step 8: Inspect health/trace

```bash
narada status --site <site-id>
narada ops --site <site-id>
```

After the first Cycle, `status` shows the health record and last trace. `ops` shows the operator dashboard for the Site.

---

## 3. Supported Substrate Matrix

| Substrate | Status | Supervisor | Credential source | Lock | Health store |
|-----------|--------|------------|-------------------|------|--------------|
| `windows-native` | Supported | Task Scheduler | Credential Manager / env / `.env` / config | `FileLock` | SQLite `site_health` |
| `windows-wsl` | Supported | systemd / cron inside WSL | env / `.env` / config | `FileLock` | SQLite `site_health` |
| `macos` | Supported | launchd LaunchAgent | Keychain (v1) / env / `.env` / config | `FileLock` | SQLite `site_health` |
| `linux-user` | Supported | systemd user / cron | env / `.env` / config (Secret Service/`pass` v1) | `FileLock` | SQLite `site_health` |
| `linux-system` | Supported | systemd system / cron | env / `.env` / config (systemd creds v1) | `FileLock` | SQLite `site_health` |
| `cloudflare` | **Deferred** | Cron Trigger / Worker | Cloudflare bindings | DO SQLite row lock | DO SQLite `site_health` |

---

## 4. Copy-Pastable First-Run Examples

### Windows (WSL)

```bash
# 1. Operation bootstrap
narada init-repo ~/src/my-ops
cd ~/src/my-ops
narada want-mailbox help@example.com

# 2. Site bootstrap
narada sites init local-help --substrate windows-wsl --operation help@example.com

# 3. Credentials (WSL)
export NARADA_LOCAL_HELP_GRAPH_ACCESS_TOKEN="..."

# 4. Validate
narada doctor --site local-help

# 5. First Cycle
narada cycle --site local-help

# 6. Enable supervisor
narada sites enable local-help

# 7. Inspect
narada status --site local-help
narada ops --site local-help
```

### macOS

```bash
# 1. Operation bootstrap
narada init-repo ~/src/my-ops
cd ~/src/my-ops
narada want-mailbox help@example.com

# 2. Site bootstrap
narada sites init local-help --substrate macos --operation help@example.com

# 3. Credentials (macOS)
export NARADA_LOCAL_HELP_GRAPH_ACCESS_TOKEN="..."

# 4. Validate
narada doctor --site local-help

# 5. First Cycle
narada cycle --site local-help

# 6. Enable supervisor
narada sites enable local-help

# 7. Inspect
narada status --site local-help
narada ops --site local-help
```

### Linux (system mode)

```bash
# 1. Operation bootstrap
narada init-repo ~/src/my-ops
cd ~/src/my-ops
narada want-mailbox help@example.com

# 2. Site bootstrap (requires root for system mode)
sudo narada sites init local-help --substrate linux-system --operation help@example.com

# 3. Credentials (system mode)
sudo sh -c 'echo "NARADA_LOCAL_HELP_GRAPH_ACCESS_TOKEN=..." >> /var/lib/narada/local-help/.env'

# 4. Validate
sudo narada doctor --site local-help

# 5. First Cycle
sudo narada cycle --site local-help

# 6. Enable supervisor
sudo narada sites enable local-help

# 7. Inspect
sudo narada status --site local-help
sudo narada ops --site local-help
```

---

## 5. Site Config Format

Each Site has a `config.json` in its root directory. The shape is substrate-specific:

### Windows

```json
{
  "site_id": "local-help",
  "variant": "native",
  "locus": {
    "authority_locus": "user",
    "principal": {
      "windows_user_profile": "C:\\Users\\User",
      "username": "User"
    }
  },
  "site_root": "C:\\Users\\User\\.narada",
  "config_path": "C:\\Users\\User\\.narada\\config.json",
  "cycle_interval_minutes": 5,
  "lock_ttl_ms": 310000,
  "ceiling_ms": 300000
}
```

### macOS

```json
{
  "site_id": "local-help",
  "site_root": "/Users/user/Library/Application Support/Narada/local-help",
  "config_path": "/Users/user/Library/Application Support/Narada/local-help/config.json",
  "cycle_interval_minutes": 5,
  "lock_ttl_ms": 310000,
  "ceiling_ms": 300000
}
```

### Linux

```json
{
  "site_id": "local-help",
  "mode": "user",
  "site_root": "/home/user/.local/share/narada/local-help",
  "config_path": "/home/user/.local/share/narada/local-help/config.json",
  "cycle_interval_minutes": 5,
  "lock_ttl_ms": 310000,
  "ceiling_ms": 300000
}
```

---

## 6. What Must Not Be Claimed

| Claim | Status | Why |
|-------|--------|-----|
| Site bootstrap replaces operation bootstrap | **Forbidden** | They are separate, composable paths. Site bootstrap needs an operation to be meaningful, but does not create one. |
| `sites enable` auto-registers with host supervisor | **Forbidden** | `sites enable` generates files and prints activation commands. The operator must manually run the activation step to avoid unexpected privilege escalation. |
| Cloudflare first-run support | **Deferred** | Cloudflare Sites require `wrangler` deployment, Worker Secrets, and DO bindings. They are not a local-first-run path. |
| Generic Site abstraction | **Deferred** | Each substrate keeps its own package. No `@narada2/site-core` abstraction is introduced by this contract. |
| Auto-credential discovery | **Deferred** | Credentials must be explicitly set by the operator. No automatic keychain/systemd-credential probing during init. |

---

## 7. Cross-References

| Document | Relationship |
|----------|--------------|
| [`bootstrap-contract.md`](bootstrap-contract.md) | Operation bootstrap path — composes with Site bootstrap |
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Canonical definitions of Aim, Site, Cycle, Act, Trace |
| [`docs/deployment/windows-site-materialization.md`](../deployment/windows-site-materialization.md) | Windows Site substrate design |
| [`docs/deployment/macos-site-materialization.md`](../deployment/macos-site-materialization.md) | macOS Site substrate design |
| [`docs/deployment/linux-site-materialization.md`](../deployment/linux-site-materialization.md) | Linux Site substrate design |
| [`AGENTS.md`](../../AGENTS.md) | Agent navigation hub; CLI command reference |
