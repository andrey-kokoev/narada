# Site Bootstrap Contract

> Canonical first-run path for creating a Narada **Site** realization where bounded Cycles execute.
>
> For the operation bootstrap path (expressing intent and configuring work objectives), see [`bootstrap-contract.md`](bootstrap-contract.md).
>
> This document uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.
>
> For governed Site clone, fork, split, absorb, migrate, re-instantiate, and archive semantics, see [`site-lifecycle-transformations.md`](site-lifecycle-transformations.md).
> For the durable provenance substrate behind those transformations, see [`site-provenance-lineage.md`](site-provenance-lineage.md).
> For the user-locus directory of known Sites, see [`user-site-awareness-registry.md`](user-site-awareness-registry.md).
> For the factorization of Site authority object, realization, interface, projection, crossing, and lineage, see [`site-factorization.md`](site-factorization.md).
> For explicit Site-level law source, authority locus, embodiment, evidence, capability, readiness, and federation coordinates, see [`site-governance-coordinates.md`](site-governance-coordinates.md).
> For the maturation phase after first-run setup, see [`inhabited-onboarding.md`](inhabited-onboarding.md).
> For the complete first-time Operator route across Operation, Site, role identity, Operator Surface, inbox intake, work-next, and readiness proof, see [`first-time-operator-success-path.md`](first-time-operator-success-path.md).

---

## 1. Overview

A Narada **Site** is a governed authority object with one or more concrete realizations and declared interfaces for admissible crossings. A runtime locus is one realization: the place where bounded Cycles execute and substrate bindings live. A Site is not an operation, not merely a deployment target, not a vertical, and not identical to its filesystem root.

The Site bootstrap path is **separate from and composes with** the operation bootstrap path:

| Concern | Operation Bootstrap | Site Bootstrap |
|---------|--------------------|----------------|
| **What it creates** | Configured work objective (mailbox, workflow) | Site realization/runtime locus (filesystem, scheduler, credentials) |
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

After bootstrap, a Site enters **Inhabited Onboarding** before operational steady state:

```text
bootstrap -> inhabited onboarding -> operational steady state
```

Bootstrap proves the substrate exists. Inhabited Onboarding proves real or representative situations can pass through the Site's authority boundaries, intake routes, operation charters, effect policies, and trace surfaces. See [`inhabited-onboarding.md`](inhabited-onboarding.md).

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
| `user` | `%USERPROFILE%\Narada` |
| `pc` | `%ProgramData%\Narada\sites\pc\{site_id}` |

The user-locus Site is the operator's personal working memory and control surface. The PC-locus Site is the machine/session memory and recovery surface.

Windows User Sites also carry a sync posture. This is separate from authority locus:

| Sync posture | Meaning |
|--------------|---------|
| `local_only` | User Site remains local to one profile |
| `cloud_synced_folder` | User Site is synced by an external profile-sync layer such as OneDrive |
| `git_backed` | User Site is a Git repository |
| `hybrid` | Durable text/config/KB are Git-friendly while local runtime state remains ignored |
| `hybrid_capable_plain_folder` | Default bootstrap posture: not a Git repo yet, but shaped so Git or external sync can be added later |

`sites init` should record this posture instead of inferring it from the presence of `.git` or a cloud-sync path.

Site bootstrap also records an **execution surface**. This is separate from the target authority locus:

| Execution surface | Meaning |
|-------------------|---------|
| `windows_native` | Command runs on native Windows against a Windows Site |
| `wsl_assisted` | Command runs inside WSL while mutating a Windows user-locus or PC-locus Site root |
| `wsl_native` | Command runs inside WSL against WSL/Linux-owned state |
| `linux_user` | Command runs as a Linux user process |
| `linux_system` | Command runs as a Linux system/service process |
| `macos_native` | Command runs on macOS |

`wsl_assisted` is inferred only from both facts together: the executor runtime is WSL, and the target authority locus is Windows user or Windows PC. WSL detection alone is insufficient, because WSL may also host WSL/Linux Sites that own Linux-side state. Ambiguous or cross-host plans should pass `--execution-surface` explicitly.

A WSL-assisted plan must record the Windows target root, the executor root, path translation, permission posture, and mutation-evidence locus. For drive-qualified Windows paths, the dry-run plan includes the translated `/mnt/<drive>/...` path. For PC-locus roots under ProgramData, the permission posture must state that PC-locus ProgramData write access is required.

### Step 2: Create Site root

```bash
narada sites init <site-id> --substrate <substrate> [--operation <operation-id>] [--authority-locus user|pc] [--sync <posture>] [--execution-surface <surface>]
```

This creates:
- The Site root directory (substrate-specific path)
- A minimal Site `config.json` with metadata
- A `governance` coordinate object declaring law source, authority locus, embodiments, participant roles, mutation evidence locus, intake/outbox posture, effect authority policy, readiness phase, and agent/operator identity contract
- Standard subdirectories (`state/`, `messages/`, `db/`, `logs/`, `traces/`)
- For Windows: a registry entry in the Site registry
- An `execution` record containing `surface`, `executor_runtime`, `target_authority_locus`, `target_root`, `executor_root`, `path_translation`, `permission_posture`, `mutation_evidence_locus`, and inference rationale

Use `--dry-run` to preview without filesystem mutation.

For a Windows operator machine, the paired first-run path is:

```bash
narada sites bootstrap-windows [--user-site-id <id>] [--pc-site-id <id>] [--sync <posture>] [--execution-surface <surface>]
```

`bootstrap-windows` is dry-run by default. It plans the user-locus Site and the PC-locus Site together, records the same execution-surface coordinates as `sites init`, and prints the validation commands for both loci. Use `--execute` only when the target Windows roots and required permissions are intentionally available.

The paired command is two-phase:

1. Preflight both the Windows User Site and Windows PC Site with no mutation.
2. If `--execute` is present and both preflights pass, create the User Site and then the PC Site through the normal `sites init` path.

If PC Site execution fails after User Site creation, the command returns explicit `partial_state` evidence and repair guidance. It does not pretend the pair is complete.

The command also returns `lifecycle_schema`, `lifecycle_state`, and
`lifecycle_history` under `narada.site_registry_bootstrap.lifecycle_state.v1`.
The normal dry-run state is `planned`; an executed pair reaches `verified` only
after both Site creations and the `paired` boundary are confirmed. A User Site
created before PC failure is `partial`, not `success`.

Related registry management commands expose the same lifecycle evidence for
their `planned`, `applied`, `advisory`, and `refused` outcomes. The complete
state contract is [`Narada FSM Contracts`](../concepts/nars-fsm-contracts.md).

Default identities:

| Site | Default |
|------|---------|
| User Site | `current-user` |
| PC Site | `%COMPUTERNAME%` lowercased, falling back to host name |

The paired command exists because a Windows Narada installation normally needs two different authority loci: the User Site for operator memory and personal control, and the PC Site for machine/session recovery. Creating them together prevents accidental collapse of user authority into PC authority, or PC recovery state into user memory.

For a client-service workspace, the contained first-run path is:

```bash
narada sites bootstrap-client --workspace <client-workspace> [--site-id <id>] [--sync onedrive_non_git|local_non_git]
narada sites bootstrap-project --workspace <project-repo> [--site-id <id>] [--sync git_backed_project_repo]
```

`bootstrap-client` is dry-run by default and requires `--execute` to create files. It preserves the visible client workspace and places Narada governance under `<client-workspace>/.narada`.

`bootstrap-project` is also dry-run by default and requires `--execute`. It is for existing Git-backed project repositories where Narada governance should live under `<project-repo>/.narada` while project source code remains project-owned.

For client, business, document, or OneDrive folders, this containment is the default rule:

```text
workspace_root = visible client/business folder
site_root = workspace_root/.narada
```

Client artifacts at `workspace_root` are outside Narada unless explicitly admitted. Narada governance files at the visible workspace root are treated as placement drift unless the Operator explicitly chooses root-level Site materialization.

For project repositories:

```text
workspace_root = existing project Git repo
site_root = workspace_root/.narada
sync.posture = git_backed_project_repo
site_kind = project
```

The project Site owns project-local governance, construction memory, inbox intake, observations, decisions, tasks, chapters, KB, and requests. It does not own Narada proper doctrine, User Site memory, PC recovery authority, or external capabilities unless those are explicitly admitted through governed crossings.

The created client Site includes:

| Path | Purpose |
|------|---------|
| `.narada/config.json` | Client Site identity, visible workspace root, sync posture, and inbox paths |
| `.narada/README.md` | Operator-facing Site orientation |
| `.narada/AGENTS.md` | Site-local fresh architect execution contract: `architect` / `Operator` identity, target locus, authority boundaries, and standing Narada-law rules |
| `.narada/.ai/inbox-drop/` | Human-authored file-drop intake |
| `.narada/.ai/inbox-envelopes/` | Exported canonical inbox envelopes |
| `.narada/chapters`, `.narada/tasks`, `.narada/decisions`, `.narada/kb`, `.narada/observations`, `.narada/friction`, `.narada/requests` | Durable Site-local governance surfaces |

Validate a client Site with:

```bash
narada sites doctor <site-id> --kind client --root <client-workspace>
```

Client Site doctor checks config parse, site identity, site kind, workspace root, non-Git durability posture, OneDrive-safe posture when applicable, required governance folders, canonical inbox drop/export folders, and empty-directory markers.

Generated `AGENTS.md` is the stable way to orient a fresh AI thread inside the Site. The Operator should not need to repeat the full standing instruction in chat. The generated contract includes separate admitted thread contracts for Architect and Builder, following [`Inhabited Evolution`](../concepts/inhabited-evolution.md).

Site bootstrap also declares Site participant roles. The default active roles are:

| Role | Purpose |
| --- | --- |
| `resident` | The value-producing inhabitant/user of the Site: the participant who lives in or uses the Site to produce the Site's intended value and surface lived friction. |
| `architect` | The construction-design role for topology, doctrine fit, governed work packages, acceptance criteria, and review posture. |
| `builder` | The construction-execution role for approved work packages and verification evidence. |

`resident` is intentionally distinct from `Operator`. Operator names the authority principal. Resident names the value-producing inhabitant. The same human may occupy both roles, but Site config must not collapse them by vocabulary.

The compact thread bootstrap form is:

```text
You are `<architect|builder|observer>`.
The human is `Operator`.
This Site is governed by Narada law.
```

and binds that identity to the declared `workspace_root`, `site_root`, `site_kind`, authority locus, sync posture, canonical intake paths, and no-direct-authority rules.

If the fresh thread is inhabiting an Operator Surface, its first bounded runtime action is:

```bash
narada operator-surface bind-focused --as self
```

If that returns a runtime-locus deferral, the thread routes the deferred binding to the owning User/PC/runtime Site. It does not guess volatile window, process, terminal, API-thread, or MCP-client identity.

Architect thread default:

```text
Read AGENTS.md, identify the target locus, inspect current task/inbox/evidence posture, interpret Operator pressure into governed work, preserve doctrine/topology, draft or refine specs and acceptance criteria, and review/admit only through the configured evidence path.
```

Builder thread default:

```text
Read AGENTS.md, confirm the assigned task and acceptance criteria, inspect the minimum implementation context needed, execute the approved work package, run verification, and report changed files, verification, residuals, and blockers.
```

Observer thread default:

```text
Read AGENTS.md, identify the target locus, inspect current inbox/workboard/coherence posture in read-only mode, observe whether work preserves Narada law, Aim, authority boundaries, and inhabited-evolution discipline, and report or route bounded findings without lifecycle-reviewing tasks.
```

The Operator can extract the bounded bootstrap text for a fresh thread without opening the full contract:

```bash
narada operator-surface agent instantiate --site <site-id-or-root> --role architect --agent-kind codex_cli --by <principal>
narada operator-surface agent instantiate --site <site-id-or-root> --role builder --agent-kind codex_cli --by <principal>
narada operator-surface agent instantiate --site <site-id-or-root> --role observer --agent-kind codex_cli --by <principal>
narada sites agent-bootstrap <site-id-or-root> --role architect
narada sites agent-bootstrap <site-id-or-root> --role builder
narada sites agent-bootstrap <site-id-or-root> --role observer
```

`operator-surface agent instantiate` is the Operator-facing path when a durable role identity should be admitted or reused before copy/paste bootstrap. Its copyable text names the role-specific duties, boundaries, self-bind instruction, binding verification command, and the rule that `next` triggers that role's normal duty loop. `sites agent-bootstrap` remains the read-only primitive: it reads the generated Site `AGENTS.md` and `config.json`, rejects roles other than `architect`, `builder`, or `observer`, and emits only the selected role section so it can be copied into a fresh AI thread without widening the active role set.

Neither contract admits additional AI roles. Operator remains the owner/client authority. The trace substrate records evidence and constrains future work; it is not a thinking role.

### Windows 11 First-Time Path

The Windows 11 front door composes paired User/PC Site bootstrap, substrate readiness, and Operator Surface adapter planning:

This is the currently proven Operator-substrate path. Windows 11 with WSL, Windows Terminal, PowerShell carrier scripts, local Git, Node tooling, and paired User/PC Site coordination is where Narada's inhabited Operator Surface loop has been intensively exercised. Core Site bootstrap concepts and CLI surfaces remain portable, but non-Windows substrates should not be presented as equally proven for window labeling, focused input, runtime binding, PC-locus messaging, or multi-agent ergonomics until they have comparable evidence.

```bash
narada sites bootstrap-windows --format json
narada sites bootstrap-windows --execute --format json
```

The command is dry-run by default. Its output includes:

- `preflight.user` and `preflight.pc` Site bootstrap plans;
- `user` and `pc` Site execution results when `--execute` is used;
- `substrate_readiness` for Windows Terminal, Komorebi, YASB, PowerShell, execution policy posture, WSL path translation, and Narada CLI readiness;
- `adapter_plan` entries for Windows Terminal profile, Komorebi focus rule, YASB focus affordance, and Operator Surface runtime binding;
- exact unblock commands for missing Windows Terminal, Komorebi, YASB, PowerShell, WSL/native execution mismatch, and stale CLI readiness;
- bounded `evidence` naming Site creation/readiness, adapter plan/read-back requirements, residual manual steps, and authority locus for every adapter mutation.

`adapter_plan` is planned-only. `narada sites bootstrap-windows --execute` creates the paired Sites; it does not execute adapter mutations. Each adapter entry must remain `execution_state: "planned_only"`, `dry_run: true`, `mutation_performed: false`, and `site_bootstrap_execute_affects_adapter: false` until a separate owning-locus command executes the adapter mutation and records read-back evidence.

Windows Terminal and YASB adapter writes belong to the Windows User Site. Komorebi machine/session behavior belongs to the PC Site. Narada proper may plan and report this topology, but adapter mutation still requires a separate explicit execute path at the owning locus plus read-back evidence.

Current adapter command posture:

| Adapter | Authority locus | Command posture |
| --- | --- | --- |
| Windows Terminal profile | Windows User Site | `narada operator-surface agent instantiate --site <user-site> --role builder --agent-kind codex_cli --by <principal>` is the current higher-level surface-instantiation command; direct Terminal profile materialization remains residual until an owning-locus materializer exists. |
| Komorebi focus rule | Windows PC Site | `narada command-exec request --site <pc-site> --intent komorebi.focus-rule --format json` is an intended CEIZ route and is residual until that intent/materializer exists. |
| YASB focus affordance | Windows User Site | `narada command-exec request --site <user-site> --intent yasb.focus-affordance --format json` is an intended CEIZ route and is residual until that intent/materializer exists. |
| Operator Surface runtime binding | Windows User/runtime locus | `narada operator-surface bind-focused --as self` exists; Narada proper may return a runtime-locus deferral that must be routed to the owning locus. |

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

Credentials are capability-bearing secrets, not ordinary Site knowledge. Site config should prefer references, capability metadata, and retrieval policy; raw values belong in the locus-appropriate secret store. See [`../concepts/capability-governed-secret-management.md`](../concepts/capability-governed-secret-management.md).

**Windows native:**
1. Windows Credential Manager (`keytar`)
2. Environment variable (`SITE_{SITE_ID}_{SECRET_NAME}`)
3. `.env` file in Site root
4. Config file value

**WSL / Linux / macOS:**
1. Environment variable (`SITE_{SITE_ID}_{SECRET_NAME}`)
2. `.env` file in Site root
3. Config file value

Linux system-mode v1 will add systemd `LoadCredential=`. Linux user-mode v1 will add Secret Service / `pass`. macOS v1 will add Keychain.

### Step 5: Validate readiness

```bash
narada doctor --site <site-id>
narada sites doctor <site-id>
```

Checks:
- Site directory exists and is writable
- Coordinator database is readable
- Lock is not stuck
- Supervisor unit is registered (if applicable)
- Health status is not critical

For Windows User Sites, `narada sites doctor <site-id>` also validates the Site root posture, `locus.authority_locus`, `sync.posture`, user/PC registry path, registry entry, and `.ai/tasks/task-lifecycle.db`. For `git_backed` User Sites it also checks the Git work tree, upstream branch, origin URL, configured remote status, and private GitHub repo reachability when `sync.git.remote_kind` is `github`.

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
  "site_root": "C:\\Users\\User\\Narada",
  "config_path": "C:\\Users\\User\\Narada\\config.json",
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
