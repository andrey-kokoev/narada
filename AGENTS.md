# AGENTS.md — exchange-fs-sync-root

> **Navigation Hub**: This file provides orientation. For detailed documentation, see the numbered guides in [`packages/exchange-fs-sync/docs/`](packages/exchange-fs-sync/docs/).

---

## Project Overview

A deterministic, replay-safe state compiler that transforms a remote Microsoft Graph/Exchange mailbox into a locally materialized filesystem state. Tolerates crashes at any point, handles re-fetching overlapping data, and converges to a correct state without coordination with the source.

**Core Identity**: This is NOT a sync client, cache, or mirror. It is a deterministic state compiler from remote mailbox deltas into local canonical state.

**Control Plane v2**: Above the compiler, a control plane manages first-class work objects (`work_item`, `execution_attempt`, `outbound_command`). For the integrated end-to-end model, see [`.ai/tasks/20260414-011-chief-integration-control-plane-v2.md`](.ai/tasks/20260414-011-chief-integration-control-plane-v2.md).

---

## Documentation Index

| Doc | Topic | Read If You... |
|-----|-------|----------------|
| [01-spec.md](packages/exchange-fs-sync/docs/01-spec.md) | Dearbitrized formal specification | Need to understand the theoretical model and invariants |
| [02-architecture.md](packages/exchange-fs-sync/docs/02-architecture.md) | Component layers, data flow, interfaces | Want to understand how the system is organized |
| [03-persistence.md](packages/exchange-fs-sync/docs/03-persistence.md) | Filesystem layout, atomic writes, crash recovery | Need to understand storage or debug data issues |
| [04-identity.md](packages/exchange-fs-sync/docs/04-identity.md) | Event IDs, stable serialization, content hashing | Are working with event identity or deduplication |
| [05-testing.md](packages/exchange-fs-sync/docs/05-testing.md) | Test strategy, patterns, crash simulation | Are writing or debugging tests |
| [06-configuration.md](packages/exchange-fs-sync/docs/06-configuration.md) | Schema, auth methods, environment variables | Need to configure or deploy the system |
| [07-graph-adapter.md](packages/exchange-fs-sync/docs/07-graph-adapter.md) | Microsoft Graph API integration | Are working with the Graph API layer |
| [08-quickstart.md](packages/exchange-fs-sync/docs/08-quickstart.md) | Setup and first sync | Are setting up for the first time |
| [09-troubleshooting.md](packages/exchange-fs-sync/docs/09-troubleshooting.md) | Common issues and solutions | Are debugging a problem |

---

## Where to Find Things

### By Task

| I want to... | Look In |
|--------------|---------|
| Change event ID computation | [`src/ids/event-id.ts`](packages/exchange-fs-sync/src/ids/event-id.ts) |
| Add a new persistence store | [`src/persistence/`](packages/exchange-fs-sync/src/persistence/) + see [03-persistence.md](packages/exchange-fs-sync/docs/03-persistence.md) |
| Modify the sync loop | [`src/runner/sync-once.ts`](packages/exchange-fs-sync/src/runner/sync-once.ts) |
| Add a CLI command | [`packages/exchange-fs-sync-cli/src/commands/`](packages/exchange-fs-sync-cli/src/commands/) |
| Change Graph API handling | [`src/adapter/graph/`](packages/exchange-fs-sync/src/adapter/graph/) |
| Change coordinator SQLite schema | [`src/coordinator/store.ts`](packages/exchange-fs-sync/src/coordinator/store.ts) |
| Modify work item lifecycle | [`src/scheduler/scheduler.ts`](packages/exchange-fs-sync/src/scheduler/scheduler.ts) |
| Modify foreman work opening | [`src/foreman/facade.ts`](packages/exchange-fs-sync/src/foreman/facade.ts) |
| Modify outbound handoff | [`src/foreman/handoff.ts`](packages/exchange-fs-sync/src/foreman/handoff.ts) |
| Change outbound command state machine | [`src/outbound/types.ts`](packages/exchange-fs-sync/src/outbound/types.ts) |
| Add an outbound command | [`src/outbound/store.ts`](packages/exchange-fs-sync/src/outbound/store.ts) |
| Modify send-reply worker | [`src/outbound/send-reply-worker.ts`](packages/exchange-fs-sync/src/outbound/send-reply-worker.ts) |
| Modify reconciler | [`src/outbound/reconciler.ts`](packages/exchange-fs-sync/src/outbound/reconciler.ts) |
| Modify non-send worker | [`src/outbound/non-send-worker.ts`](packages/exchange-fs-sync/src/outbound/non-send-worker.ts) |
| Change charter runtime envelope | [`packages/charters/src/runtime/envelope.ts`](packages/charters/src/runtime/envelope.ts) |
| Add a charter runner | [`packages/charters/src/runtime/runner.ts`](packages/charters/src/runtime/runner.ts) |
| Add a tool catalog entry | [`packages/charters/src/tools/resolver.ts`](packages/charters/src/tools/resolver.ts) |
| Modify tool validation rules | [`packages/charters/src/tools/validation.ts`](packages/charters/src/tools/validation.ts) |
| Add a new field to messages | [`src/types/normalized.ts`](packages/exchange-fs-sync/src/types/normalized.ts) + [`src/normalize/message.ts`](packages/exchange-fs-sync/src/normalize/message.ts) |
| Modify config schema | [`src/config/types.ts`](packages/exchange-fs-sync/src/config/types.ts) + [`src/config/load.ts`](packages/exchange-fs-sync/src/config/load.ts) |
| Write integration tests | [`test/integration/`](packages/exchange-fs-sync/test/integration/) + see [05-testing.md](packages/exchange-fs-sync/docs/05-testing.md) |

### By Concept

| Concept | Definition | Primary Location |
|---------|------------|------------------|
| **Delta Token** | URL/cursor from Graph API indicating sync position | [`src/persistence/cursor.ts`](packages/exchange-fs-sync/src/persistence/cursor.ts) |
| **Apply-Log** | Set of applied event IDs for idempotency | [`src/persistence/apply-log.ts`](packages/exchange-fs-sync/src/persistence/apply-log.ts) |
| **Tombstone** | Deletion marker for audit trails | [`src/persistence/tombstones.ts`](packages/exchange-fs-sync/src/persistence/tombstones.ts) |
| **Normalized Event** | Canonical representation of a Graph change | [`src/types/normalized.ts`](packages/exchange-fs-sync/src/types/normalized.ts) |
| **Stable Stringify** | Deterministic JSON serialization | [`src/ids/event-id.ts`](packages/exchange-fs-sync/src/ids/event-id.ts) |
| **Secure Storage** | OS keychain credential storage | [`src/auth/secure-storage.ts`](packages/exchange-fs-sync/src/auth/secure-storage.ts) |
| **Batch Sync** | Memory-efficient streaming sync | [`src/runner/batch-sync.ts`](packages/exchange-fs-sync/src/runner/batch-sync.ts) |
| **Circuit Breaker** | Failure rate protection | [`src/retry.ts`](packages/exchange-fs-sync/src/retry.ts) |
| **Health File** | Sync status persistence | [`src/health.ts`](packages/exchange-fs-sync/src/health.ts) |
| **Work Item** | Terminal schedulable unit of control work | [`src/coordinator/types.ts`](packages/exchange-fs-sync/src/coordinator/types.ts) |
| **Lease** | Execution authority record for a work item | [`src/scheduler/scheduler.ts`](packages/exchange-fs-sync/src/scheduler/scheduler.ts) |
| **Foreman Decision** | Outbound proposal record | [`src/foreman/facade.ts`](packages/exchange-fs-sync/src/foreman/facade.ts) |
| **OutboundCommand** | Durable mailbox mutation intent | [`src/outbound/types.ts`](packages/exchange-fs-sync/src/outbound/types.ts) |
| **ManagedDraft** | Graph draft bound to a command version | [`src/outbound/store.ts`](packages/exchange-fs-sync/src/outbound/store.ts) |
| **SendReplyWorker** | Draft creation, reuse, and send | [`src/outbound/send-reply-worker.ts`](packages/exchange-fs-sync/src/outbound/send-reply-worker.ts) |
| **OutboundReconciler** | Submitted → confirmed binding | [`src/outbound/reconciler.ts`](packages/exchange-fs-sync/src/outbound/reconciler.ts) |
| **CharterInvocationEnvelope** | Runtime envelope for charter evaluation | [`packages/charters/src/runtime/envelope.ts`](packages/charters/src/runtime/envelope.ts) |
| **ToolRunner** | Subprocess/HTTP tool execution | [`packages/charters/src/tools/runner.ts`](packages/charters/src/tools/runner.ts) |

---

## Quick Commands

```bash
# Install dependencies
pnpm install

# Build all packages (tsc)
pnpm build

# Type check (tsc --noEmit)
pnpm typecheck

# Run all tests (Vitest)
pnpm test

# Run benchmarks
pnpm benchmark

# Compare benchmarks with baseline
pnpm benchmark:compare

# Pre-publish checks
pnpm prepublish-check
```

**Package Management**: Uses [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# Add a changeset
pnpm changeset

# Version packages  
pnpm version-packages

# Publish (CI handles this)
pnpm release
```

---

## Repository Layout

```
narada/
├── AGENTS.md                          # This file (navigation hub)
├── packages/
│   ├── exchange-fs-sync/              # Core library
│   │   ├── AGENTS.md                  # Package-specific agent guidance
│   │   ├── config.example.json        # Configuration template
│   │   ├── docs/                      # Numbered documentation
│   │   │   ├── 01-spec.md
│   │   │   ├── 02-architecture.md
│   │   │   └── ...
│   │   ├── src/
│   │   │   ├── adapter/graph/         # Microsoft Graph API client
│   │   │   ├── auth/                  # Secure credential storage
│   │   │   ├── config/                # Configuration loading
│   │   │   ├── ids/                   # Event ID generation
│   │   │   ├── logging/               # Structured logging
│   │   │   ├── normalize/             # Graph → normalized conversion
│   │   │   ├── persistence/           # Filesystem storage
│   │   │   ├── projector/             # Event application
│   │   │   ├── recovery/              # Crash recovery
│   │   │   ├── runner/                # Sync orchestration
│   │   │   └── types/                 # TypeScript definitions
│   │   └── test/
│   │       ├── benchmarks/            # Performance benchmarks
│   │       ├── integration/           # End-to-end tests
│   │       ├── unit/                  # Component tests
│   │       └── windows/               # Windows-specific tests
│   │
│   ├── exchange-fs-sync-cli/          # Command-line interface
│   │   └── src/
│   │       ├── commands/              # CLI commands
│   │       ├── lib/                   # Shared utilities
│   │       └── main.ts                # Entry point
│   │
│   ├── exchange-fs-sync-daemon/       # Long-running daemon
│   ├── exchange-fs-sync-search/       # Full-text search (FTS5)
│   └── charters/                      # Mailbox charter definitions and policy types
│
├── scripts/                           # Build and utility scripts
└── .github/workflows/                 # CI/CD pipelines
```

---

## Critical Invariants (Must Never Violate)

### Inbound
1. **No Loss After Commit**: `cursor = c` ⇒ all events ≤ c have been applied
2. **Replay Safety**: `apply(e)` multiple times ⇒ same final state
3. **Determinism**: `normalize(remote_data)` produces identical output for identical input
4. **Idempotency Boundary**: Enforced at `event_id` → `apply_log`
5. **Apply Ordering**: `apply(e)` → `mark_applied(e)` → `cursor_commit` (never reorder)

### Control Plane
6. **Work Object Authority**: A `work_item` is the terminal schedulable unit; at most one non-terminal work item per conversation may be `leased` or `executing`
7. **Lease Uniqueness**: A work item has at most one unreleased, unexpired lease at any time
8. **Bounded Evaluation**: Charters run inside frozen `CharterInvocationEnvelope`s with immutable capability envelopes
9. **Decision Before Command**: `foreman_decision` is append-only; `outbound_command` is worker-mutable; one decision produces at most one command

### Outbound
10. **Draft-First Delivery**: Agents and workers never send directly; they always create a draft first
11. **Two-Stage Completion**: A command reaches `submitted` when Graph accepts it, and `confirmed` only after inbound reconciliation observes the result
12. **No External Draft Mutation**: Modification of a managed draft by anything other than the outbound worker is a hard failure
13. **Worker Exclusivity**: Only the outbound worker may create or mutate managed drafts

---

## Extension Points

**Allowed** (preserves invariants):
- Richer payload (attachments, html)
- Stronger integrity checks
- Multi-folder support (requires explicit redesign)
- Alternative projections (search index, analytics)
- New outbound actions (e.g., set flags, move messages) via the durable command pipeline

**Disallowed** without full redesign:
- Implicit deletes
- Cursor-first commit
- Non-deterministic normalization
- Externalized apply-log

---

## Common Modifications

### 1. Add a New Field to NormalizedMessage

1. Add field to [`NormalizedPayload`](packages/exchange-fs-sync/src/types/normalized.ts)
2. Extract/transform in [`src/normalize/message.ts`](packages/exchange-fs-sync/src/normalize/message.ts)
3. Update [`FileMessageStore.upsertFromPayload()`](packages/exchange-fs-sync/src/persistence/messages.ts) if persistence needs change
4. Add test in [`test/unit/normalize/message.test.ts`](packages/exchange-fs-sync/test/unit/normalize/message.test.ts)

### 2. Add a New Persistence Store

1. Define interface in [`src/types/runtime.ts`](packages/exchange-fs-sync/src/types/runtime.ts) (if not existing)
2. Implement in [`src/persistence/{name}.ts`](packages/exchange-fs-sync/src/persistence/)
3. Follow atomic write pattern (write to tmp, rename)
4. Add unit tests in [`test/unit/persistence/{name}.test.ts`](packages/exchange-fs-sync/test/unit/)

### 3. Handle a New Graph API Error

1. Add error classification in [`src/adapter/graph/client.ts`](packages/exchange-fs-sync/src/adapter/graph/client.ts)
2. Map to `retryable_failure` or `fatal_failure` in [`src/runner/sync-once.ts`](packages/exchange-fs-sync/src/runner/sync-once.ts)
3. Add test case in [`test/integration/`](packages/exchange-fs-sync/test/integration/)

### 4. Add a CLI Command

1. Create [`packages/exchange-fs-sync-cli/src/commands/{command}.ts`](packages/exchange-fs-sync-cli/src/commands/)
2. Wire up in [`packages/exchange-fs-sync-cli/src/main.ts`](packages/exchange-fs-sync-cli/src/main.ts)
3. Export types from [`packages/exchange-fs-sync-cli/src/index.ts`](packages/exchange-fs-sync-cli/src/index.ts)
3. Use [`loadConfig()`](packages/exchange-fs-sync/src/config/load.ts) for config handling

---

## Package-Specific Guidance

For detailed conventions, coding standards, and package-specific patterns, see [`packages/exchange-fs-sync/AGENTS.md`](packages/exchange-fs-sync/AGENTS.md).
