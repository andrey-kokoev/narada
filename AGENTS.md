# AGENTS.md — narada-root

> **Navigation Hub**: This file provides orientation. For the canonical kernel lawbook, see [`packages/layers/control-plane/docs/00-kernel.md`](packages/layers/control-plane/docs/00-kernel.md). For detailed documentation, see the numbered guides in [`packages/layers/control-plane/docs/`](packages/layers/control-plane/docs/).

---

## Project Overview

Narada is a generalized, deterministic kernel for turning remote source deltas into locally materialized state and durable side-effect intents. It tolerates crashes at any point, handles re-fetching overlapping data, and converges to correct state without coordination with the source.

**Core Identity**: This is NOT a sync client, cache, or mirror. It is a deterministic state compiler from remote deltas into local canonical state, with a durable control plane for action governance.

**Mailbox as One Vertical**: The Microsoft Graph/Exchange mailbox integration is the first vertical built on the kernel. It uses:
- `ExchangeSource` as one `Source` implementation
- `mail.*` fact types as one fact family
- Mailbox policy/charters as one policy family
- `mail.*` intents as one intent/executor family

**Peer Verticals**: `TimerSource`, `WebhookSource`, `process.run`, and future automations are first-class peers that travel through the same kernel pipeline (Source → Fact → Policy → Intent → Execution → Observation).

**Fact Boundary**: Facts are the first canonical durable boundary. All replay determinism derives from fact identity. No kernel section may assume mailbox, conversation, or message semantics.

**Intent Boundary**: `Intent` is the universal durable effect boundary. All side effects (mail sends, process spawns, future automations) must be represented as an Intent before execution. Idempotency is enforced at `idempotency_key`.

**Control Plane v2**: Above the compiler, a control plane manages first-class generalized work objects (`work_item`, `execution_attempt`, `outbound_command`). Work is derived from `PolicyContext` via `ContextFormationStrategy`, making mailbox one vertical among many (timer, process, etc.). For the integrated end-to-end model, see [`.ai/tasks/20260414-011-chief-integration-control-plane-v2.md`](.ai/tasks/20260414-011-chief-integration-control-plane-v2.md).

> **Note on physical packaging**: The control plane's logical layers (foreman, scheduler, outbound worker, charter runtime) currently all live inside `packages/layers/control-plane/`. They are decomposed by directory and interface, not by separate packages. Extraction will happen only when a layer meets the stability and deployability criteria documented in [`packages/layers/control-plane/docs/02-architecture.md`](packages/layers/control-plane/docs/02-architecture.md).

**Terminology**: See [`TERMINOLOGY.md`](TERMINOLOGY.md) for the user-facing vocabulary guide, and [`SEMANTICS.md`](SEMANTICS.md) for the complete system ontology (identity lattice, core abstractions, invariant derivations). In short: users set up and run **operations**; Narada compiles each **operation** into exactly one internal **scope**.

---

## Documentation Index

| Doc | Topic | Read If You... |
|-----|-------|----------------|
| [SEMANTICS.md](SEMANTICS.md) | **Canonical ontology** — single source of truth for all terms | Need a definition, identity format, or invariant |
| [00-kernel.md](packages/layers/control-plane/docs/00-kernel.md) | **Irreducible kernel spec** — the canonical lawbook | Need the vertical-agnostic normative core |
| [01-spec.md](packages/layers/control-plane/docs/01-spec.md) | Dearbitrized formal specification (mailbox vertical) | Need to understand the mailbox-specific theoretical model |
| [02-architecture.md](packages/layers/control-plane/docs/02-architecture.md) | Component layers, data flow, interfaces | Want to understand how the system is organized |
| [03-persistence.md](packages/layers/control-plane/docs/03-persistence.md) | Filesystem layout, atomic writes, crash recovery | Need to understand storage or debug data issues |
| [04-identity.md](packages/layers/control-plane/docs/04-identity.md) | Event IDs, stable serialization, content hashing | Are working with event identity or deduplication |
| [05-testing.md](packages/layers/control-plane/docs/05-testing.md) | Test strategy, patterns, crash simulation | Are writing or debugging tests |
| [06-configuration.md](packages/layers/control-plane/docs/06-configuration.md) | Schema, auth methods, environment variables | Need to configure or deploy the system |
| [07-graph-adapter.md](packages/layers/control-plane/docs/07-graph-adapter.md) | Microsoft Graph API integration | Are working with the Graph API layer |
| [08-quickstart.md](packages/layers/control-plane/docs/08-quickstart.md) | Setup and first sync | Are setting up for the first time |
| [09-troubleshooting.md](packages/layers/control-plane/docs/09-troubleshooting.md) | Common issues and solutions | Are debugging a problem |
| [10-ui-read-model-audit.md](packages/layers/control-plane/docs/10-ui-read-model-audit.md) | UI read surfaces, gaps, and authority rules | Are building operator UI |

---

## Where to Find Things

### By Task

| I want to... | Look In |
|--------------|---------|
| Change event ID computation | [`src/ids/event-id.ts`](packages/layers/control-plane/src/ids/event-id.ts) |
| Add a new persistence store | [`src/persistence/`](packages/layers/control-plane/src/persistence/) + see [03-persistence.md](packages/layers/control-plane/docs/03-persistence.md) |
| Modify the sync loop | [`src/runner/sync-once.ts`](packages/layers/control-plane/src/runner/sync-once.ts) |
| Add a CLI command | [`packages/layers/cli/src/commands/`](packages/layers/cli/src/commands/) |
| Change Graph API handling | [`src/adapter/graph/`](packages/layers/control-plane/src/adapter/graph/) |
| Change coordinator SQLite schema | [`src/coordinator/store.ts`](packages/layers/control-plane/src/coordinator/store.ts) |
| Modify work item lifecycle | [`src/scheduler/scheduler.ts`](packages/layers/control-plane/src/scheduler/scheduler.ts) |
| Modify foreman work opening | [`src/foreman/facade.ts`](packages/layers/control-plane/src/foreman/facade.ts) |
| Modify outbound handoff | [`src/foreman/handoff.ts`](packages/layers/control-plane/src/foreman/handoff.ts) |
| Change outbound command state machine | [`src/outbound/types.ts`](packages/layers/control-plane/src/outbound/types.ts) |
| Add an outbound command | [`src/outbound/store.ts`](packages/layers/control-plane/src/outbound/store.ts) |
| Modify send-reply worker | [`src/outbound/send-reply-worker.ts`](packages/layers/control-plane/src/outbound/send-reply-worker.ts) |
| Modify reconciler | [`src/outbound/reconciler.ts`](packages/layers/control-plane/src/outbound/reconciler.ts) |
| Modify non-send worker | [`src/outbound/non-send-worker.ts`](packages/layers/control-plane/src/outbound/non-send-worker.ts) |
| Add a new vertical source | [`src/sources/{vertical}-source.ts`](packages/layers/control-plane/src/sources/) |
| Add a context strategy | [`src/foreman/context.ts`](packages/layers/control-plane/src/foreman/context.ts) |
| Add a generic webhook HTTP server | [`packages/layers/daemon/src/generic-webhook-server.ts`](packages/layers/daemon/src/generic-webhook-server.ts) |
| Change charter runtime envelope | [`packages/domains/charters/src/runtime/envelope.ts`](packages/domains/charters/src/runtime/envelope.ts) |
| Add a charter runner | [`packages/domains/charters/src/runtime/runner.ts`](packages/domains/charters/src/runtime/runner.ts) |
| Add a tool catalog entry | [`packages/domains/charters/src/tools/resolver.ts`](packages/domains/charters/src/tools/resolver.ts) |
| Modify tool validation rules | [`packages/domains/charters/src/tools/validation.ts`](packages/domains/charters/src/tools/validation.ts) |
| Add a new field to messages | [`src/types/normalized.ts`](packages/layers/control-plane/src/types/normalized.ts) + [`src/normalize/message.ts`](packages/layers/control-plane/src/normalize/message.ts) |
| Modify config schema | [`src/config/types.ts`](packages/layers/control-plane/src/config/types.ts) + [`src/config/load.ts`](packages/layers/control-plane/src/config/load.ts) |
| Write integration tests | [`test/integration/`](packages/layers/control-plane/test/integration/) + see [05-testing.md](packages/layers/control-plane/docs/05-testing.md) |

### By Concept

| Concept | Definition | Primary Location |
|---------|------------|------------------|
| **Delta Token** | URL/cursor from Graph API indicating sync position | [`src/persistence/cursor.ts`](packages/layers/control-plane/src/persistence/cursor.ts) |
| **Apply-Log** | Set of applied event IDs for idempotency | [`src/persistence/apply-log.ts`](packages/layers/control-plane/src/persistence/apply-log.ts) |
| **Tombstone** | Deletion marker for audit trails | [`src/persistence/tombstones.ts`](packages/layers/control-plane/src/persistence/tombstones.ts) |
| **Normalized Event** | Canonical representation of a Graph change | [`src/types/normalized.ts`](packages/layers/control-plane/src/types/normalized.ts) |
| **Stable Stringify** | Deterministic JSON serialization | [`src/ids/event-id.ts`](packages/layers/control-plane/src/ids/event-id.ts) |
| **Secure Storage** | OS keychain credential storage | [`src/auth/secure-storage.ts`](packages/layers/control-plane/src/auth/secure-storage.ts) |
| **Batch Sync** | Memory-efficient streaming sync | [`src/runner/batch-sync.ts`](packages/layers/control-plane/src/runner/batch-sync.ts) |
| **Circuit Breaker** | Failure rate protection | [`src/retry.ts`](packages/layers/control-plane/src/retry.ts) |
| **Health File** | Sync status persistence | [`src/health.ts`](packages/layers/control-plane/src/health.ts) |
| **conversation_id** | v2 canonical thread identifier (legacy `thread_id` exists in rollback tables only) | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **work_item** | Terminal schedulable unit of control work | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **execution_attempt** | Bounded charter invocation record | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **session** | `AgentSession` — operator-facing session with `resume_hint` | [`src/coordinator/types.ts`](packages/layers/control-plane/src/coordinator/types.ts) |
| **evaluation** | Persisted charter output for foreman governance | [`src/foreman/types.ts`](packages/layers/control-plane/src/foreman/types.ts) |
| **Lease** | Execution authority record for a work item | [`src/scheduler/scheduler.ts`](packages/layers/control-plane/src/scheduler/scheduler.ts) |
| **Foreman Decision** | Outbound proposal record | [`src/foreman/facade.ts`](packages/layers/control-plane/src/foreman/facade.ts) |
| **outbound command** | Durable mailbox mutation intent | [`src/outbound/types.ts`](packages/layers/control-plane/src/outbound/types.ts) |
| **ManagedDraft** | Graph draft bound to a command version | [`src/outbound/store.ts`](packages/layers/control-plane/src/outbound/store.ts) |
| **trace** | Commentary record (non-authoritative) anchored to `execution_id` | [`src/agent/traces/types.ts`](packages/layers/control-plane/src/agent/traces/types.ts) |
| **runtime policy** | Charter routing, allowed actions, and tool catalog binding | [`src/config/types.ts`](packages/layers/control-plane/src/config/types.ts) |
| **SendReplyWorker** | Draft creation, reuse, and send | [`src/outbound/send-reply-worker.ts`](packages/layers/control-plane/src/outbound/send-reply-worker.ts) |
| **OutboundReconciler** | Submitted → confirmed binding | [`src/outbound/reconciler.ts`](packages/layers/control-plane/src/outbound/reconciler.ts) |
| **CharterInvocationEnvelope** | Runtime envelope for charter evaluation | [`packages/domains/charters/src/runtime/envelope.ts`](packages/domains/charters/src/runtime/envelope.ts) |
| **ToolRunner** | Subprocess/HTTP tool execution | [`packages/domains/charters/src/tools/runner.ts`](packages/domains/charters/src/tools/runner.ts) |

---

## Quick Commands

```bash
# Install dependencies
pnpm install

# Build all packages (tsc)
pnpm build

# Type check (tsc --noEmit)
pnpm typecheck

# Fast local verification (typecheck + fast package tests, ~8 sec)
pnpm verify

# Unit tests across all packages
pnpm test:unit

# Integration tests only
pnpm test:integration

# Package-scoped tests
pnpm test:control-plane
pnpm test:daemon

# Full recursive test suite (requires explicit opt-in)
ALLOW_FULL_TESTS=1 pnpm test:full

# Run benchmarks
pnpm benchmark

# Compare benchmarks with baseline
pnpm benchmark:compare

# Pre-publish checks
pnpm prepublish-check
```

---

## Agent Verification Policy

When verifying changes, follow the **escalation ladder** — never jump to the most expensive command first.

### Verification Ladder

| Step | Command | When to use | Approx. time |
|------|---------|-------------|--------------|
| 1 | `pnpm verify` | Default after any local change | ~8 sec |
| 2 | `pnpm test:control-plane` | Change touches control-plane internals | ~5 sec |
| 3 | `pnpm test:daemon` | Change touches daemon or integration surface | ~90 sec |
| 4 | `ALLOW_FULL_TESTS=1 pnpm test:full` | Final CI-like check or user explicitly asks | ~2 min |

### Rules

1. **Do not run the full suite unless the user explicitly asks.** `pnpm test` at the root is intentionally blocked.
2. **Start with `pnpm verify`.** It runs typecheck + fast package tests (kernel, charters, ops-kit, cli). This catches most issues.
3. **Escalate only when needed.** If a change is in the daemon, run `pnpm test:daemon`. If it's in the control-plane, run `pnpm test:control-plane`.
4. **Full suite requires `ALLOW_FULL_TESTS=1`.** This guard prevents accidental expensive runs.
5. **Package-scoped is preferred.** Use `pnpm --filter <pkg> test` when the change is isolated to one package.

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
│   ├── layers/control-plane/          # Core library (control plane)
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
│   ├── layers/cli/                    # Command-line interface
│   │   └── src/
│   │       ├── commands/              # CLI commands
│   │       ├── lib/                   # Shared utilities
│   │       └── main.ts                # Entry point
│   │
│   ├── layers/daemon/                 # Long-running daemon
│   ├── verticals/search/              # Full-text search (FTS5)
│   └── charters/                      # Charter definitions and policy types
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
6. **Foreman owns work opening**: Only `DefaultForemanFacade.onSyncCompleted()` (or `onFactsAdmitted()`) may insert `work_item` rows. Both delegate to a private `onContextsAdmitted()` that performs the actual insert.
7. **Foreman owns evaluation resolution**: Only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to `resolved` based on charter output and policy governance. It does not handle runtime or execution failures.
8. **Foreman owns failure classification**: Only `DefaultForemanFacade.failWorkItem()` may transition a `work_item` to `failed_retryable` or `failed_terminal`. The scheduler releases leases and marks execution attempts crashed; the foreman classifies the semantic failure and applies retry backoff.
9. **Scheduler owns leases and mechanical lifecycle**: Only `SqliteScheduler` may insert/release `work_item_leases` and transition a work item into `leased` or `executing`. The scheduler may mark execution attempts as crashed/abandoned and release leases, but it does **not** semantically classify work-item failure status.
10. **IntentHandoff owns intent creation**: Only `IntentHandoff.admitIntentFromDecision()` may create `intent` rows. It is called from within the foreman's atomic decision transaction.
11. **OutboundHandoff owns command creation**: All `outbound_commands` + `outbound_versions` must be created inside `OutboundHandoff.createCommandFromDecision()` (atomic with decision insert).
12. **Outbound workers own mutation**: Only the outbound worker layer may call Graph API to create drafts / send messages / move items.
13. **Charter runtime is read-only sandbox**: It may only read the `CharterInvocationEnvelope` and produce a `CharterOutputEnvelope`. It must NOT write to coordinator or outbound stores directly.
14. **Work Object Authority**: A `work_item` is the terminal generalized schedulable unit (kernel fields: `context_id`, `scope_id`); at most one non-terminal work item per context may be `leased` or `executing`
15. **Lease Uniqueness**: A work item has at most one unreleased, unexpired lease at any time
16. **Bounded Evaluation**: Charters run inside frozen `CharterInvocationEnvelope`s with immutable capability envelopes
17. **Decision Before Command**: `foreman_decision` is append-only; `outbound_command` is worker-mutable; one decision produces at most one command

### Observation / UI
18. **Observation is read-only projection**: `layers/control-plane/src/observability/` must never contain writes (`.run(`, `.exec(`, direct mutation calls). It derives its data exclusively from durable stores.
19. **Control surface is explicitly separated**: Operator actions are mounted under `/control/scopes/:scope_id/actions`. The observation namespace (`/scopes/...`) is strictly GET-only.
20. **UI cannot become hidden authority**: The operator console (`layers/daemon/src/ui/`) may only mutate through the audited, safelisted `executeOperatorAction()` path in `operator-actions.ts`. Every action is logged to `operator_action_requests`. Direct store mutations from the observation API are forbidden.
21. **Observation API uses view types**: `ObservationApiScope` exposes only `*View` / `*OperatorView` store interfaces, removing named mutation methods at the type level.
22. **All UI data sources are classified**: Every observation type is marked as `authoritative` (mirrors one durable row), `derived` (computed from multiple sources), or `decorative` (presentational only).

### Do Not Regress These Boundaries (Task 085)
23. **No mailbox leakage into generic observation**: `conversation_id` and `mailbox_id` must not appear in generic observability types/queries. They are allowed only inside mail-specific types (`MailExecutionDetail`, `MailboxVerticalView`) and mail-specific query functions (`getMailboxVerticalView`, `getMailExecutionDetails`).
24. **Observation queries are SELECT-only**: Files in `layers/control-plane/src/observability/` must not contain `.run(` or `.exec(`. Only `.all(`, `.get(`, and `.pluck(` are permitted.
25. **Control endpoints stay in `/control/`**: No POST route may be registered under `/scopes/...` in the observation namespace. The action route must remain under `/control/scopes/:scope_id/actions`.
26. **UI shell stays vertical-neutral**: The top-level nav menu must not contain mail-specific labels (e.g., "Mailbox"). Mail-specific views must live under the "Verticals" page, not as primary navigation.

### Kernel Substrate vs Mailbox Vertical Boundary (Task 087)
27. **Neutral tables are the kernel substrate**: `context_records`, `context_revisions`, and `outbound_handoffs` are the canonical durable base tables. All generic writes and generic reads must target them directly.
28. **Mailbox-era schema is vertical-local compatibility only**: `conversation_records`, `conversation_revisions`, and `outbound_commands` are compatibility views projecting mailbox-era column names (`conversation_id`, `mailbox_id`) from the neutral tables. They may only be referenced inside mailbox-vertical modules (`adapter/graph/`, `normalize/`, `projector/`, `foreman/`, `outbound/` worker code) or explicit migration/compatibility adapters.
29. **Generic modules must not query mailbox-era views**: Control-plane modules (`scheduler/`, `facts/`, `intent/`, `sources/`, `executors/`, `charter/`, `observability/`) must not contain SQL references to `conversation_records`, `conversation_revisions`, or `outbound_commands`. CI enforces this via `scripts/control-plane-lint.ts`.
30. **Mailbox compatibility is additive, not foundational**: New verticals must build against `context_id`/`scope_id` and `outbound_handoffs`. They must never depend on mailbox-era naming or views.

### Outbound
31. **Draft-First Delivery**: Agents and workers never send directly; they always create a draft first
32. **Two-Stage Completion**: A command reaches `submitted` when Graph accepts it, and `confirmed` only after inbound reconciliation observes the result
33. **No External Draft Mutation**: Modification of a managed draft by anything other than the outbound worker is a hard failure
34. **Worker Exclusivity**: Only the outbound worker may create or mutate managed drafts

---

## Secret Resolution Precedence

Configuration values that involve secrets follow a deterministic precedence:

1. **Environment variables** (highest precedence)
2. **Secure storage references** (`{ "$secure": "key" }`)
3. **Config file values** (lowest precedence)

### Graph API Credentials
| Source | Env Var | Config Key |
|--------|---------|------------|
| Access token | `GRAPH_ACCESS_TOKEN` | `graph.access_token` (via secure ref) |
| Tenant ID | `GRAPH_TENANT_ID` | `graph.tenant_id` |
| Client ID | `GRAPH_CLIENT_ID` | `graph.client_id` |
| Client Secret | `GRAPH_CLIENT_SECRET` | `graph.client_secret` |

Resolved in `buildGraphTokenProvider()`.

### Charter Runtime API Key
| Source | Env Var | Config Key |
|--------|---------|------------|
| OpenAI API key | `NARADA_OPENAI_API_KEY` or `OPENAI_API_KEY` | `charter.api_key` |

Resolved in `validateCharterRuntimeConfig()`.

### Secure Storage
- `loadConfig()` and `loadMultiMailboxConfig()` accept an optional `storage: SecureStorage` parameter.
- If `{ "$secure": "key" }` references exist and no storage is provided, loading throws before any side effects.
- The CLI and daemon currently do not wire secure storage automatically; callers must explicitly provide it.

---

## Extension Points

**Allowed** (preserves invariants):
- New vertical sources (filesystem, webhook, API)
- New fact types
- New context formation strategies
- New executor families
- Richer payloads (attachments, html)
- Stronger integrity checks
- Multi-folder support (requires explicit redesign)
- Alternative projections (search index, analytics)
- New outbound actions via the durable intent pipeline

**Disallowed** without full redesign:
- Implicit deletes
- Cursor-first commit
- Non-deterministic normalization
- Externalized apply-log
- Direct writes to `work_item`, `work_item_leases`, or `execution_attempts` from outside `ForemanFacade` / `Scheduler`
- Bypassing `OutboundHandoff` to create `outbound_command` rows
- Charter runtimes that mutate coordinator or outbound stores directly

---

## Common Modifications

### 1. Add a New Field to NormalizedMessage

1. Add field to [`NormalizedPayload`](packages/layers/control-plane/src/types/normalized.ts)
2. Extract/transform in [`src/normalize/message.ts`](packages/layers/control-plane/src/normalize/message.ts)
3. Update [`FileMessageStore.upsertFromPayload()`](packages/layers/control-plane/src/persistence/messages.ts) if persistence needs change
4. Add test in [`test/unit/normalize/message.test.ts`](packages/layers/control-plane/test/unit/normalize/message.test.ts)

### 2. Add a New Persistence Store

1. Define interface in [`src/types/runtime.ts`](packages/layers/control-plane/src/types/runtime.ts) (if not existing)
2. Implement in [`src/persistence/{name}.ts`](packages/layers/control-plane/src/persistence/)
3. Follow atomic write pattern (write to tmp, rename)
4. Add unit tests in [`test/unit/persistence/{name}.test.ts`](packages/layers/control-plane/test/unit/)

### 3. Handle a New Graph API Error

1. Add error classification in [`src/adapter/graph/client.ts`](packages/layers/control-plane/src/adapter/graph/client.ts)
2. Map to `retryable_failure` or `fatal_failure` in [`src/runner/sync-once.ts`](packages/layers/control-plane/src/runner/sync-once.ts)
3. Add test case in [`test/integration/`](packages/layers/control-plane/test/integration/)

### 4. Add a CLI Command

1. Create [`packages/layers/cli/src/commands/{command}.ts`](packages/layers/cli/src/commands/)
2. Wire up in [`packages/layers/cli/src/main.ts`](packages/layers/cli/src/main.ts)
3. Export types from [`packages/layers/cli/src/index.ts`](packages/layers/cli/src/index.ts)
3. Use [`loadConfig()`](packages/layers/control-plane/src/config/load.ts) for config handling

### 5. Add a New Non-Mail Vertical

The kernel supports arbitrary verticals through the same Source → Fact → Policy → Intent → Execution spine. To add one (e.g., filesystem, webhook, API):

1. Implement `Source` in [`src/sources/{vertical}-source.ts`](packages/layers/control-plane/src/sources/)
2. Add fact type to [`src/facts/types.ts`](packages/layers/control-plane/src/facts/types.ts) and mapping in [`src/facts/record-to-fact.ts`](packages/layers/control-plane/src/facts/record-to-fact.ts)
3. Add `ContextFormationStrategy` in [`src/foreman/context.ts`](packages/layers/control-plane/src/foreman/context.ts)
4. Provide a projector (may be no-op for non-filesystem verticals)
5. Wire executor family in intent handoff if the vertical produces effects
6. Add unit + integration tests proving replay safety and idempotency
7. Update this AGENTS.md to list the new vertical as a peer

### 6. Change Policy Binding

Runtime policy determines charter routing, allowed actions, and tool catalog for a scope. To modify:

1. Update [`RuntimePolicy`](packages/layers/control-plane/src/config/types.ts) type
2. Update parsing/defaults in [`src/config/load.ts`](packages/layers/control-plane/src/config/load.ts) and [`src/config/defaults.ts`](packages/layers/control-plane/src/config/defaults.ts)
3. Update consumers: [`DefaultForemanFacade`](packages/layers/control-plane/src/foreman/facade.ts), [`buildInvocationEnvelope`](packages/layers/control-plane/src/charter/envelope.ts), and daemon [`service.ts`](packages/layers/daemon/src/service.ts)
4. Update [`config.example.json`](packages/layers/control-plane/config.example.json)
5. Add tests in [`test/unit/config/load.test.ts`](packages/layers/control-plane/test/unit/config/load.test.ts) and [`test/integration/policy-routing.test.ts`](packages/layers/daemon/test/integration/policy-routing.test.ts)

---

## Review Checklist for Future Architecture Changes

When proposing changes that touch public types, docs, or package surfaces, verify:

- [ ] **Kernel-first framing**: Docs and comments describe the generalized behavior first, vertical specifics second.
- [ ] **No mailbox-default types**: Generic interfaces use `scope_id` / `context_id`, not `mailbox_id` / `conversation_id`.
- [ ] **Vertical parity**: New features for one vertical have a plausible path for peers (timer, webhook, filesystem, process).
- [ ] **Authority boundaries preserved**: No new write paths bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, or `OutboundHandoff`.
- [ ] **Observation remains read-only**: No UI-facing code mutates durable state directly.
- [ ] **Control-plane lint passes**: `pnpm control-plane-lint` reports zero violations.

---

## Agent Verification Policy

**Do not run the full test suite unless the user explicitly asks for it.**

When verifying changes, follow this escalation ladder:

1. **Fast default**: `pnpm verify` — typecheck + build + unit tests. This is the routine command after local changes.
2. **Package-scoped**: `pnpm --filter=<pkg> test` — when you know exactly which package you touched.
3. **Unit-only**: `pnpm test:unit` — when you want tests without the heavier integration suite.
4. **Full suite**: `ALLOW_FULL_TESTS=1 pnpm test:full` — only when the user explicitly requests complete verification or when preparing a release.

**Why**: The full suite includes integration tests that exercise SQLite, file I/O, and subprocesses. It is materially slower and can produce `better-sqlite3` segfaults on cleanup that are harmless but noisy. The fast commands catch type errors, build breaks, and unit-test regressions in seconds.

**Root `pnpm test` is disabled** to prevent accidental full-suite execution. Use the commands above instead.

---

## Task File Policy (Hard Rule)

Files in `.ai/tasks/*.md` are **durable task artifacts**, not execution-log variants. The original task file is the single canonical source of truth for a task.

### Forbidden

Agents **must not** create derivative status files unless the user explicitly asks for one. Specifically forbidden suffixes:

- `-EXECUTED.md`
- `-DONE.md`
- `-RESULT.md`
- `-FINAL.md`
- `-SUPERSEDED.md`

### Required

- Task completion evidence belongs **in the original task file**, in a bounded section such as `## Execution Notes`, `## Verification`, or `## Outcome`.
- If a task is obsolete or superseded, mark that status **in the original task file** rather than creating a sibling status file.
- Do not leave stale or contradictory task state scattered across multiple files.

### Enforcement

The guard script `scripts/task-file-guard.ts` runs as part of `pnpm verify`. It fails the build if any forbidden derivative filename is present in `.ai/tasks/`.

---

## Package-Specific Guidance

For detailed conventions, coding standards, and package-specific patterns, see [`packages/layers/control-plane/AGENTS.md`](packages/layers/control-plane/AGENTS.md).
