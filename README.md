# Narada

A generalized, deterministic kernel for turning remote source deltas into locally materialized state and durable side-effect intents.

> **How to read this repo**: Start with the [kernel lawbook](packages/exchange-fs-sync/docs/00-kernel.md), then treat the Microsoft Graph/Exchange mailbox integration as the *first vertical* built on that kernel—not the essence of the system. Timer, webhook, filesystem, and process automations are first-class peers.

## What this is

Narada is **not** a sync client, cache, or email tool. It is a deterministic state compiler from remote deltas into local canonical state, with a durable control plane for governed side-effects.

- **Generalized kernel** — The core pipeline (`Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation → Observation`) is vertical-agnostic.
- **Mailbox as one vertical** — The Exchange/Graph integration is the first `Source` implementation and the first set of charter policies. It is not privileged in the kernel.
- **Peer verticals** — `TimerSource`, `WebhookSource`, `FilesystemSource`, and `process.run` execute through the exact same control plane.

## Architecture

The system is organized in five layers above six deterministic compiler layers:

1. **Inbound Compiler** — `exchange-fs-sync` compiles remote source deltas into locally materialized state. It knows nothing of agents, charters, or control decisions.
2. **Control Plane** — Manages first-class work objects (`work_item`, `execution_attempt`, `intent`) above the compiler. The daemon schedules work; the foreman decides it.
3. **Charter Runtime** — Vertical-specific policy definitions (`packages/charters`) that guide bounded agent evaluation inside frozen capability envelopes.
4. **Tool Runner** — Executes validated tool calls with timeout enforcement and durable `tool_call_records` logging.
5. **Effect Workers** — Durable execution pipelines for each vertical: outbound worker for mail mutations, `ProcessExecutor` for subprocesses, and future workers for API automations.

## Features

- **🔒 Secure by Default** - Credentials encrypted with OS keychain (macOS Keychain, Windows Credential Manager, Linux libsecret)
- **💾 Backup & Restore** - Full data backup with integrity verification and encryption
- **🪟 Cross-Platform** - Native Windows, macOS, and Linux support
- **⚡ High Performance** - Batch processing, memory-efficient streaming, 500+ records/sec
- **📊 Observable** - Structured logging, metrics, health checks, OpenTelemetry tracing
- **🔧 Resilient** - Automatic retry with exponential backoff, circuit breakers, crash recovery
- **📦 Multi-Scope** - Sync multiple scopes with resource management
- **🔌 Multi-Vertical** - Timer, webhook, filesystem, and process automations are first-class peers to mailbox sync

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

## Quick Start (Mailbox Vertical)

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

## Documentation

- **[00-kernel.md](packages/exchange-fs-sync/docs/00-kernel.md)** — The canonical, vertical-agnostic kernel lawbook
- **[02-architecture.md](packages/exchange-fs-sync/docs/02-architecture.md)** — Component layers and data flow
- **[AGENTS.md](AGENTS.md)** — Navigation hub for contributors and agents
- **[.ai/tasks/](.ai/tasks/)** — Design tasks and specifications

## Review Checklist for Future Architecture Changes

When proposing changes that touch public types, docs, or package surfaces, verify:

- [ ] **Kernel-first framing**: Docs and comments describe the generalized behavior first, vertical specifics second.
- [ ] **No mailbox-default types**: Generic interfaces use `scope_id` / `context_id`, not `mailbox_id` / `conversation_id`.
- [ ] **Vertical parity**: New features for one vertical have a plausible path for peers (timer, webhook, filesystem, process).
- [ ] **Authority boundaries preserved**: No new write paths bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, or `OutboundHandoff`.
- [ ] **Observation remains read-only**: No UI-facing code mutates durable state directly.
- [ ] **Kernel lint passes**: `pnpm kernel-lint` reports zero violations.

## License

MIT
