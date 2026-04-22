# @narada2/windows-site

> Windows Site materialization for Narada — native Windows and WSL Cycle runner.

## Overview

This package provides a bounded Cycle runner for Narada Sites on Windows substrates:

- **Native Windows** — PowerShell + Task Scheduler + NTFS + Windows Credential Manager
- **WSL** — shell + systemd/timer or cron + ext4 + environment/`.env`

Both variants share the same core code. The variant is selected at runtime by `detectVariant()`.

## WSL Boundaries

### Filesystem

All Site state lives inside the WSL ext4 filesystem:

```text
/var/lib/narada/{site_id}/
  ├── config.json
  ├── coordinator.db           # SQLite: health, traces, control state
  ├── .env                     # Optional fallback secrets
  ├── logs/cycles/             # Structured JSON log lines
  ├── traces/                  # Cycle trace artifacts
  ├── snapshots/               # Raw sync snapshots
  └── messages/                # Message payloads per context
```

**What lives in ext4 vs NTFS:**
- **ext4 only**: `coordinator.db`, `config.json`, SQLite WAL files, log files, trace artifacts. These must stay in WSL-native storage for POSIX permission semantics and SQLite reliability.
- **NTFS access**: Not required in v0. All secrets are resolved from Linux-native env/`.env`. No cross-boundary file sharing.

### Credentials

WSL Sites use the **Linux-native credential resolution chain**:

1. Environment variables (`NARADA_{site_id}_{secret_name}`)
2. `.env` file in the Site root directory
3. Config file values (lowest precedence)

**Windows Credential Manager is NOT accessed from WSL in v0.** The WSL variant is self-contained and does not cross the Windows-host boundary for secrets. If Credential Manager access is needed in v1, it must be explicitly declared as an interop boundary.

### Network

- `localhost` is shared between Windows host and WSL 2 by default.
- An optional HTTP operator surface bound to `localhost` is reachable from both Windows and WSL.
- The Cycle runner does not open any listening ports by default.

### Interop

**v0 rule: No Windows-native tool calls from WSL.**

The WSL Site runs entirely within the Linux userspace. It does not:
- Call Windows executables (`cmd.exe`, `powershell.exe`)
- Access Windows registry
- Use Windows filesystem paths (`C:\...`)
- Access Windows Credential Manager

If future versions need cross-boundary interop (e.g., calling a Windows-only Graph API tool), the call site must be explicitly documented and the dependency must be optional with a clear fallback.

## Usage

### Run a single Cycle manually

```bash
narada cycle --site {site_id}
```

### Register a systemd timer (WSL)

```bash
# Generate unit files
node -e "
const { writeSystemdUnits } = require('@narada2/windows-site');
writeSystemdUnits({
  site_id: 'my-site',
  variant: 'wsl',
  site_root: '/var/lib/narada/my-site',
  config_path: '/var/lib/narada/my-site/config.json',
  cycle_interval_minutes: 5,
  lock_ttl_ms: 35000,
  ceiling_ms: 30000,
}).then(console.log);
"

# Install and enable
sudo systemctl enable /var/lib/narada/my-site/systemd/narada-my-site.timer
sudo systemctl start narada-my-site.timer
```

### Cron fallback (WSL without systemd)

```bash
# Generate cron entry
node -e "
const { generateCronEntry } = require('@narada2/windows-site');
console.log(generateCronEntry({
  site_id: 'my-site',
  variant: 'wsl',
  site_root: '/var/lib/narada/my-site',
  config_path: '/var/lib/narada/my-site/config.json',
  cycle_interval_minutes: 5,
  lock_ttl_ms: 35000,
  ceiling_ms: 30000,
}));
"

# Add to crontab
crontab -e
# Paste the generated line
```

## Architecture

```
DefaultWindowsSiteRunner
  ├── FileLock (from @narada2/control-plane) — cross-platform lock
  ├── SqliteSiteCoordinator — health/trace persistence
  ├── computeHealthTransition (from @narada2/control-plane) — state machine
  └── Steps 2-6: fixture stubs (deferred to Tasks 346-348, 366)
```

## Testing

```bash
pnpm test
```

Tests cover:
- Path resolution and variant detection
- SQLite coordinator (health/trace CRUD)
- Runner (cycle execution, lock acquisition, health transitions)
- Supervisor templates (systemd, cron, shell script generation)
