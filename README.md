# Narada

A generalized, deterministic kernel for turning remote source deltas into locally materialized state and durable side-effect intents.

> **How to read this repo**: Start with the [kernel lawbook](packages/layers/control-plane/docs/00-kernel.md), then treat the Microsoft Graph/Exchange mailbox integration as the *first vertical* built on that kernel—not the essence of the system. Timer, webhook, filesystem, and process automations are first-class peers.

For a compact system diagram, see [docs/system.md](docs/system.md).

## What this is

Narada is **not** a sync client, cache, or email tool. It is a deterministic state compiler from remote deltas into local canonical state, with a durable control plane for governed side-effects.

- **Generalized kernel** — The core pipeline (`Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation → Observation`) is vertical-agnostic.
- **Mailbox as one vertical** — The Exchange/Graph integration is the first `Source` implementation and the first set of charter policies. It is not privileged in the kernel.
- **Peer verticals** — `TimerSource`, `WebhookSource`, `FilesystemSource`, and `process.run` execute through the exact same control plane.

## The Ops-Repo Model

Narada is designed around **ops repos** — private repositories that contain one or more operations, plus their knowledge, scenarios, and local configuration.

```bash
narada init-repo ~/src/my-ops
cd ~/src/my-ops
pnpm install
```

An ops repo is where you:

- **Declare operations** (`want-mailbox`, `want-workflow`) — tell Narada what you want to run
- **Apply safety postures** (`want-posture`) — set boundaries on what an operation can do
- **Scaffold runtime directories** (`setup`) — create the data and log paths each operation needs
- **Verify readiness** (`preflight`) — check credentials, connectivity, and policy before going live
- **Understand behavior** (`explain`) — see what an operation will do and why it might be blocked
- **Activate** (`activate`) — mark an operation as ready for the daemon to process
- **Run** (`pnpm daemon`) — start the control plane that compiles deltas and executes governed side-effects

Operations live in `config/config.json`. Logs, state, and backups live under the repo. The repo is yours — version it, branch it, share it within your team.

## Installation

### CLI (Recommended)

```bash
npm install -g @narada2/cli
# or
pnpm add -g @narada2/cli
```

The single `narada` CLI surfaces every command: runtime, backup, operation shaping, and repo bootstrapping.

### Daemon

```bash
npm install -g @narada2/daemon
# or
pnpm add -g @narada2/daemon
```

The daemon is typically started from inside an ops repo via `pnpm daemon`.

### Library

```bash
npm install @narada2/control-plane
# or
pnpm add @narada2/control-plane
```

## First-Run Paths

Narada offers three entry paths, ordered from safest to live:

| Path | Command | What it gives you |
|------|---------|-------------------|
| **Show me** | `narada demo` | Zero-setup taste with synthetic data. No credentials, no config, no files created. |
| **Try safely** | `narada init-repo --demo ~/src/my-tryout` | A non-live trial repo with a mock-backed operation. Explore the full shaping workflow without touching any external system. |
| **Go live** | `narada init-repo ~/src/my-ops` | A real ops repo. Declare a mailbox, add credentials, preflight, activate, and run. |

See [QUICKSTART.md](QUICKSTART.md) for the full gold-path guide.

## CLI Commands

### Operation Shaping (ops-kit)

These commands shape what the daemon will do when it runs. They are safe to run at any time — they change configuration, not live state.

| Command | Description |
|---------|-------------|
| `init-repo <path>` | Bootstrap a private ops repo |
| `init-repo --demo <path>` | Bootstrap a non-live trial repo |
| `want-mailbox <id>` | Declare a mailbox operation |
| `want-workflow <id>` | Declare a timer workflow operation |
| `want-posture <target> <preset>` | Apply a safety posture to an operation (`observe-only`, `draft-only`, `review-required`, `autonomous`) |
| `setup [target]` | Scaffold directories for configured operations |
| `preflight <operation>` | Verify operation readiness (credentials, connectivity, policy) |
| `inspect <operation>` | Show operation configuration |
| `explain <operation>` | Explain what an operation will do and why it may be blocked |
| `activate <operation>` | Mark an operation as live for daemon processing |

### Runtime & Data

These commands operate on live state and data.

| Command | Description |
|---------|-------------|
| `sync` | Run a single synchronization cycle |
| `status` | Show sync status and health |
| `integrity` | Check data integrity |
| `rebuild-views` | Rebuild all derived views |
| `init` | Create a new configuration file |
| `cleanup` | Run data lifecycle cleanup operations |
| `demo` | Zero-setup taste with synthetic data |

### Backup & Restore

| Command | Description |
|---------|-------------|
| `backup -o <path>` | Create a backup of sync data |
| `restore -i <path>` | Restore data from backup |
| `backup-verify -i <path>` | Verify backup integrity without extracting |
| `backup-ls -i <path>` | List backup contents |

### Global Options

These options are available on every command:

```bash
-f, --format <format>       Output format: json, human, or auto (default: auto)
--log-level <level>         Log level: debug, info, warn, error (default: info)
--log-format <format>       Log format: pretty, json, or auto (default: auto)
--metrics-output <file>     Write metrics to file on exit
```

Most runtime and data commands also accept:

```bash
-c, --config <path>         Config file path (default: ./config.json)
-v, --verbose               Enable verbose output
```

The `init` command uses `-o, --output <path>` instead of `-c, --config`. The `demo` command does not accept `-c, --config`.

## Architecture

The system is organized in five layers above six deterministic compiler layers:

1. **Inbound Compiler** — `packages/layers/control-plane` compiles remote source deltas into locally materialized state. It knows nothing of agents, charters, or control decisions.
2. **Control Plane** — Manages first-class work objects (`work_item`, `execution_attempt`, `intent`) above the compiler. The daemon schedules work; the foreman decides it.
3. **Charter Runtime** — Vertical-specific policy definitions (`packages/domains/charters`) that guide bounded agent evaluation inside frozen capability envelopes.
4. **Tool Runner** — Executes validated tool calls with timeout enforcement and durable `tool_call_records` logging.
5. **Effect Workers** — Durable execution pipelines for each vertical: outbound worker for mail mutations, `ProcessExecutor` for subprocesses, and future workers for API automations.

## Verification Ladder

After making changes, verify using the appropriate level:

| Command | What it does | When to use |
|---------|--------------|-------------|
| `pnpm verify` | Typecheck + build + fast packages (~15 sec) | **Default** — reliable baseline without heavy suites |
| `pnpm test:focused "<cmd>"` | Run a specific test command with telemetry | When you know exactly which file(s) to test |
| `pnpm test:unit` | Unit tests across all packages | When you want tests without integration overhead |
| `pnpm test:integration` | Integration tests only | When you changed durable-state or I/O logic |
| `pnpm test:control-plane` | Control-plane tests only (~60+ sec) | When you changed control-plane internals |
| `pnpm test:daemon` | Daemon tests only (~90 sec) | When you changed daemon or integration surface |
| `ALLOW_FULL_TESTS=1 pnpm test:full` | Full recursive suite (~2 min) | Explicit full verification (CI, release prep) |

Root `pnpm test` is disabled to prevent accidental full-suite runs. Use `pnpm verify` for the fast default, or `pnpm test:focused` for targeted verification.

## Documentation

- **[00-kernel.md](packages/layers/control-plane/docs/00-kernel.md)** — The canonical, vertical-agnostic kernel lawbook
- **[02-architecture.md](packages/layers/control-plane/docs/02-architecture.md)** — Component layers and data flow
- **[QUICKSTART.md](QUICKSTART.md)** — Gold-path first-run guide
- **[SEMANTICS.md](SEMANTICS.md)** — Canonical ontology and vocabulary (single source of truth for all terms)
- **[TERMINOLOGY.md](TERMINOLOGY.md)** — User-facing words for talking about Narada
- **[AGENTS.md](AGENTS.md)** — Navigation hub for contributors and agents
- **[RELEASE.md](RELEASE.md)** — Local and CI publishing flow for `@narada2/*` packages
- **[.ai/tasks/](.ai/tasks/)** — Design tasks and specifications

## Review Checklist for Future Architecture Changes

When proposing changes that touch public types, docs, or package surfaces, verify:

- [ ] **Kernel-first framing**: Docs and comments describe the generalized behavior first, vertical specifics second.
- [ ] **No mailbox-default types**: Generic interfaces use `scope_id` / `context_id`, not `mailbox_id` / `conversation_id`.
- [ ] **Vertical parity**: New features for one vertical have a plausible path for peers (timer, webhook, filesystem, process).
- [ ] **Authority boundaries preserved**: No new write paths bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, or `OutboundHandoff`.
- [ ] **Observation remains read-only**: No UI-facing code mutates durable state directly.
- [ ] **Control-plane lint passes**: `pnpm control-plane-lint` reports zero violations.

## License

MIT
