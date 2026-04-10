# AGENTS.md — exchange-fs-sync-root

> **Navigation Hub**: This file provides orientation. For detailed documentation, see the numbered guides in [`packages/exchange-fs-sync/docs/`](packages/exchange-fs-sync/docs/).

---

## Project Overview

A deterministic, replay-safe state compiler that transforms a remote Microsoft Graph/Exchange mailbox into a locally materialized filesystem state. Tolerates crashes at any point, handles re-fetching overlapping data, and converges to a correct state without coordination with the source.

**Core Identity**: This is NOT a sync client, cache, or mirror. It is a deterministic state compiler from remote mailbox deltas into local canonical state.

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
| Add a CLI command | [`src/cli/`](packages/exchange-fs-sync/src/cli/) + see [02-architecture.md](packages/exchange-fs-sync/docs/02-architecture.md) CLI section |
| Change Graph API handling | [`src/adapter/graph/`](packages/exchange-fs-sync/src/adapter/graph/) |
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

---

## Quick Commands

```bash
# Install dependencies
pnpm install

# Development (Rolldown watch)
pnpm dev

# Build (Rolldown bundle)
pnpm build

# Type check (tsc --noEmit)
pnpm typecheck

# Lint (oxlint - Rust-based)
pnpm lint

# Format (oxfmt - Rust-based, Prettier-compatible)
pnpm fmt

# Check all (typecheck + lint + format)
pnpm check

# Run all tests (Vitest)
pnpm test

# Run tests in watch mode
pnpm test:watch
```

**Tooling**: Full Ox stack (Rust-based) - Rolldown + oxlint + oxfmt + Vitest. See package AGENTS.md for details.

---

## Repository Layout

```
narada/
├── AGENTS.md                          # This file (navigation hub)
├── packages/
│   └── exchange-fs-sync/
│       ├── AGENTS.md                  # Package-specific agent guidance
│       ├── config.example.json        # Configuration template
│       ├── docs/                      # Numbered documentation
│       │   ├── 01-spec.md
│       │   ├── 02-architecture.md
│       │   └── ...
│       ├── src/
│       │   ├── adapter/graph/         # Microsoft Graph API client
│       │   ├── cli/                   # Command-line interfaces
│       │   ├── config/                # Configuration loading
│       │   ├── ids/                   # Event ID generation
│       │   ├── normalize/             # Graph → normalized conversion
│       │   ├── persistence/           # Filesystem storage
│       │   ├── projector/             # Event application
│       │   ├── recovery/              # Crash recovery
│       │   ├── runner/                # Sync orchestration
│       │   └── types/                 # TypeScript definitions
│       └── test/
│           ├── integration/           # End-to-end tests
│           └── unit/                  # Component tests
```

---

## Critical Invariants (Must Never Violate)

1. **No Loss After Commit**: `cursor = c` ⇒ all events ≤ c have been applied
2. **Replay Safety**: `apply(e)` multiple times ⇒ same final state
3. **Determinism**: `normalize(remote_data)` produces identical output for identical input
4. **Idempotency Boundary**: Enforced at `event_id` → `apply_log`
5. **Apply Ordering**: `apply(e)` → `mark_applied(e)` → `cursor_commit` (never reorder)

---

## Extension Points

**Allowed** (preserves invariants):
- Richer payload (attachments, html)
- Stronger integrity checks
- Multi-folder support (requires explicit redesign)
- Alternative projections (search index, analytics)

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

1. Create [`src/cli/{command}.ts`](packages/exchange-fs-sync/src/cli/)
2. Wire up in [`src/cli/main.ts`](packages/exchange-fs-sync/src/cli/main.ts) (when implemented)
3. Use [`loadConfig()`](packages/exchange-fs-sync/src/config/load.ts) for config handling

---

## Package-Specific Guidance

For detailed conventions, coding standards, and package-specific patterns, see [`packages/exchange-fs-sync/AGENTS.md`](packages/exchange-fs-sync/AGENTS.md).
