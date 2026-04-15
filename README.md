# Exchange FS Sync

A deterministic, replay-safe state compiler that transforms a remote Microsoft Graph/Exchange mailbox into a locally materialized filesystem state.

## Architecture

The system is organized in five layers:

1. **Inbound Compiler** — `exchange-fs-sync` compiles remote mailbox deltas into a locally materialized filesystem state. It knows nothing of agents, charters, or control decisions.
2. **Control Plane** — Manages first-class work objects (`work_item`, `execution_attempt`, `outbound_command`) above the compiler. The daemon schedules work; the foreman decides it.
3. **Charter Runtime** — Mailbox-specific policy definitions (`packages/charters`) that guide bounded agent evaluation inside frozen capability envelopes.
4. **Tool Runner** — Executes validated tool calls with timeout enforcement and durable `tool_call_records` logging.
5. **Outbound Worker** — Durable command pipeline for drafts, replies, and mailbox mutations. Only the outbound worker may create Graph drafts or mutate mailbox state.

## Features

- **🔒 Secure by Default** - Credentials encrypted with OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret)
- **💾 Backup & Restore** - Full data backup with integrity verification and encryption
- **🪟 Cross-Platform** - Native Windows, macOS, and Linux support
- **⚡ High Performance** - Batch processing, memory-efficient streaming, 500+ messages/sec
- **📊 Observable** - Structured logging, metrics, health checks, OpenTelemetry tracing
- **🔧 Resilient** - Automatic retry with exponential backoff, circuit breakers, crash recovery
- **📦 Multi-Mailbox** - Sync multiple mailboxes with resource management
- **📤 Outbound Worker** - Durable command pipeline for replies, drafts, and mailbox mutations

## Installation

### CLI (Recommended)

```bash
npm install -g @narada/exchange-fs-sync-cli
# or
pnpm add -g @narada/exchange-fs-sync-cli
```

### Daemon

```bash
npm install -g @narada/exchange-fs-sync-daemon
# or
pnpm add -g @narada/exchange-fs-sync-daemon
```

### Library

```bash
npm install @narada/exchange-fs-sync
# or
pnpm add @narada/exchange-fs-sync
```

## Quick Start

```bash
# Interactive configuration (recommended)
exchange-sync init --interactive

# Or manual configuration
exchange-sync init

# Edit config.json with your Graph API credentials
# Then run sync
exchange-sync sync

# Check status
exchange-sync status

# Create backup
exchange-sync backup -o backup-$(date +%Y%m%d).tar.gz --encrypt
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Create configuration file |
| `init --interactive` | Interactive setup with prompts |
| `sync` | Run synchronization |
| `status` | Show sync status and health |
| `integrity` | Check data integrity |
| `rebuild-views` | Rebuild derived views |
| `backup` | Create encrypted backup |
| `restore` | Restore from backup |
| `backup-verify` | Verify backup integrity |
| `backup-ls` | List backup contents |

### Global Options

```bash
-f, --format <format>       Output: json, human, auto (default: auto)
--log-level <level>         Log level: debug, info, warn, error (default: info)
--log-format <format>       Log format: pretty, json, auto (default: auto)
--metrics-output <file>     Write metrics to file on exit
```

## Security

Credentials are automatically encrypted using your OS keychain:
- **macOS**: Keychain Access
- **Windows**: Credential Manager
- **Linux**: libsecret (GNOME Keyring, KWallet)

Fallback to AES-256-GCM encrypted file storage if keychain unavailable.

## Configuration

```json
{
  "mailbox_id": "user@example.com",
  "root_dir": "./data",
  "graph": {
    "user_id": "user@example.com",
    "prefer_immutable_ids": true
  },
  "scope": {
    "included_container_refs": ["inbox"],
    "included_item_kinds": ["message"]
  }
}
```

Set credentials via environment variables:
```bash
export GRAPH_TENANT_ID="your-tenant.onmicrosoft.com"
export GRAPH_CLIENT_ID="your-app-id"
export GRAPH_CLIENT_SECRET="your-app-secret"
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run benchmarks
pnpm benchmark

# Type check
pnpm typecheck
```

## Monorepo Structure

- `packages/exchange-fs-sync/` - Core sync library
- `packages/exchange-fs-sync-cli/` - Command-line interface
- `packages/exchange-fs-sync-daemon/` - Long-running daemon
- `packages/exchange-fs-sync-search/` - Full-text search (SQLite FTS5)
- `packages/charters/` - Mailbox charter definitions and coordinator policy types

## Documentation

See `packages/exchange-fs-sync/docs/` for detailed documentation:
- [01-spec.md](packages/exchange-fs-sync/docs/01-spec.md) - Formal specification
- [02-architecture.md](packages/exchange-fs-sync/docs/02-architecture.md) - System architecture
- [06-configuration.md](packages/exchange-fs-sync/docs/06-configuration.md) - Configuration reference
- [09-troubleshooting.md](packages/exchange-fs-sync/docs/09-troubleshooting.md) - Common issues

## Publishing

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# Add a changeset
pnpm changeset

# Version packages
pnpm version-packages

# Publish (CI handles automatically)
pnpm release
```