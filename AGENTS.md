# AGENTS.md — narada-root

> **Navigation Hub**: This file provides orientation for AI coding agents. For the canonical kernel lawbook, see [`packages/layers/control-plane/docs/00-kernel.md`](packages/layers/control-plane/docs/00-kernel.md). For the system ontology and vocabulary, see [`SEMANTICS.md`](SEMANTICS.md). Task execution is governed by [`.ai/task-contracts/agent-task-execution.md`](.ai/task-contracts/agent-task-execution.md).
>
> **Project language**: All code, comments, docs, and CLI output are in English. Agents must use English when editing project files.

---

## Project Overview

Narada is a composed topology of authority-homogeneous zones connected by governed crossings.

- A **zone** is a region in which one authority grammar remains invariant.
- A **governed crossing** is the durable, admissible transfer from one zone to another.
- A crossing is not separate from its regime: each crossing edge carries its own admissibility regime, crossing artifact, and confirmation law.
- Narada preserves correctness by preventing illicit shortcuts across zones and by requiring every meaningful crossing to produce a durable artifact under an explicit regime.

Viewed operationally, Narada is a generalized, deterministic kernel for turning remote source deltas into locally materialized state and durable side-effect intents. It tolerates crashes at any point, handles re-fetching overlapping data, and converges to correct state without coordination with the source.

**Primary Shape**: Narada is not best understood as a bag of modules or only as a pipeline. Its primary explanatory shape is:

- a composed topology of authority-homogeneous zones,
- connected by governed crossings.

From that primary shape, the familiar Narada readings follow:

- **state compiler**: what the topology does;
- **nine-layer pipeline**: one canonical traversal through the topology;
- **Aim / Site / Cycle / Act / Trace**: operator/runtime view of the same topology;
- **Intelligence-Authority Separation**: one core invariant of the topology;
- **crossing regime**: the local law governing each crossing.

**Core Identity**: This is NOT a sync client, cache, or mirror. It is a deterministic state compiler from remote deltas into local canonical state, with a durable control plane for action governance. That compiler reading is derived from the deeper zone-and-crossing structure above.

**Mailbox as One Vertical**: The Microsoft Graph/Exchange mailbox integration is the first vertical built on the kernel. It uses:

- `ExchangeSource` as one `Source` implementation
- `mail.*` fact types as one fact family
- Mailbox policy/charters as one policy family
- `mail.*` intents as one intent/executor family

**Peer Verticals**: `TimerSource`, `WebhookSource`, `FilesystemSource`, `InboxDropSource`, and `process.run` are first-class peers that travel through the same kernel pipeline (Source → Fact → Policy → Intent → Execution → Observation).

**Fact Boundary**: Facts are the first canonical durable boundary. All replay determinism derives from fact identity. No kernel section may assume mailbox, conversation, or message semantics.

**Intent Boundary**: `Intent` is the universal durable effect boundary. All side effects (mail sends, process spawns, future automations) must be represented as an Intent before execution. Idempotency is enforced at `idempotency_key`.

**Terminology**: See [`TERMINOLOGY.md`](TERMINOLOGY.md) for the user-facing vocabulary guide, and [`SEMANTICS.md`](SEMANTICS.md) for the complete system ontology. In short: users set up and run **operations**; Narada compiles each **operation** into exactly one internal **scope**.

---

## Technology Stack and Runtime

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.3+ |
| Runtime | Node.js 18+ (ES modules, `"type": "module"`) |
| Package manager | pnpm 8+ workspace monorepo |
| Module system | ESM (`NodeNext` module resolution) |
| Compiler | `tsc` (authoritative); `oxbuild` available as a faster non-authoritative probe |
| Test runner | Vitest 1.x |
| Property testing | `fast-check` (control-plane) |
| Mock filesystem | `memfs` |
| Schema validation | Zod |
| Persistent state | SQLite via `node:sqlite` (Node.js built-in) |
| FTS search | SQLite FTS5 (`packages/verticals/search`) |
| CLI framework | `commander` + `@clack/prompts` + `chalk` |
| Versioning / release | Changesets CLI (`@changesets/cli`) |
| TypeScript loader for scripts | `tsx` |

All packages declare `"type": "module"` and compile to `./dist/` with declaration maps. The authoritative build is `tsc`; `oxbuild` is only a probe and must not be treated as the canonical compiler.

---

## Monorepo Layout

The workspace is declared in [`pnpm-workspace.yaml`](pnpm-workspace.yaml). It includes:

- `packages/*`
- `packages/layers/*`
- `packages/verticals/*`
- `packages/domains/*`
- `packages/sites/*`
- External sibling repositories (when present):
  - `../narada-core/packages/*`
  - `../mcp-surfaces/packages/*`
  - `../agent-cli`
  - `../agent-tui`

### Principal Packages

| Package | Path | Responsibility |
|---------|------|----------------|
| `@narada2/control-plane` | `packages/layers/control-plane` | Deterministic compiler, control plane, coordinator, foreman, scheduler, outbound workers, persistence, Graph adapter, observability, configuration, secure storage |
| `@narada2/cli` | `packages/layers/cli` | `narada` and `narada-mcp` binaries; all CLI commands |
| `@narada2/daemon` | `packages/layers/daemon` | Long-running polling loop, HTTP observation UI, webhook server |
| `@narada2/charters` | `packages/domains/charters` | Charter contracts, policy types, tool catalog, knowledge sources |
| `@narada2/search` | `packages/verticals/search` | SQLite FTS5 search index |
| `@narada2/mailbox` | `packages/verticals/mailbox` | Mailbox vertical specifics |
| `@narada2/ops-kit` | `packages/ops-kit` | Operation shaping, repo bootstrapping, preflight |
| `@narada2/site-config` | `packages/site-config` | Site configuration contracts |
| `@narada2/site-task-lifecycle` | `packages/site-task-lifecycle` | Task lifecycle bindings for Sites |
| `@narada2/task-lifecycle-kernel` | `packages/task-lifecycle-kernel` | Lightweight MCP-style task lifecycle kernel (`.mjs`) |
| `@narada2/task-governance` / `@narada2/task-governance-core` | `packages/task-governance`, `packages/task-governance-core` | Task governance primitives |
| `@narada2/agent-context-memory` | `packages/agent-context-memory` | Agent checkpoint memory contracts |
| `@narada2/narada-proper-mcp` | `packages/narada-proper-mcp` | Target-local Narada MCP facade |
| `@narada2/mcp-fabric` / `@narada2/typed-mcp-surface` | `packages/mcp-fabric`, `packages/typed-mcp-surface` | MCP surface plumbing |
| `@narada2/windows-site` / `@narada2/macos-site` / `@narada2/linux-site` / `@narada2/cloudflare-site` | `packages/sites/*` | Per-substrate Site materialization |
| `@narada2/cloudflare-site-registry` / `@narada2/cloudflare-carrier` | `packages/cloudflare-site-registry`, `packages/cloudflare-carrier` | Cloudflare carrier/registry support |
| `@narada2/operator-surface-carriers` / `@narada2/window-surface-overlay` / `@narada2/windows-operator-surface` | `packages/operator-surface-carriers`, `packages/window-surface-overlay`, `packages/windows-operator-surface` | Windows operator-surface machinery |
| `@narada2/mcp-shell-windows` | `packages/mcp-shell-windows` | Packaged shell MCP server |

Archived, contract, and carrier packages live under `packages/_archive/`, `packages/carrier-*`, `packages/mcp-*`, etc. Treat each as a focused package with its own `package.json`, `tsconfig.json`, and `vitest.config.ts` where present.

### Key Directories

```
narada/
├── AGENTS.md                          # This file
├── package.json                       # Root scripts and workspace deps
├── pnpm-workspace.yaml                # Workspace definition
├── .ai/                               # Agent context, tasks, inbox, learning
│   ├── agents/                        # Roster and agent records
│   ├── chapters/                      # Chapter indexes
│   ├── do-not-open/tasks/             # Task specifications
│   ├── inbox-envelopes/               # Canonical inbox records
│   ├── task-contracts/                # Execution contracts
│   └── ...
├── packages/
│   ├── layers/
│   │   ├── control-plane/             # Kernel + control plane
│   │   │   ├── src/
│   │   │   │   ├── adapter/graph/     # Microsoft Graph client
│   │   │   │   ├── auth/              # Secure credential storage
│   │   │   │   ├── charter/           # Charter runtime integration
│   │   │   │   ├── config/            # Config loading and validation
│   │   │   │   ├── coordinator/       # SQLite work-item store
│   │   │   │   ├── executors/         # Process / deliverable / confirmation executors
│   │   │   │   ├── facts/             # Fact store and mapping
│   │   │   │   ├── foreman/           # Work opening, evaluation, decisions
│   │   │   │   ├── ids/               # Event and fact ID generation
│   │   │   │   ├── intent/            # Intent handoff and registry
│   │   │   │   ├── logging/           # Structured logging + sanitization
│   │   │   │   ├── normalize/         # Graph → canonical normalization
│   │   │   │   ├── observability/     # Read-only observation queries
│   │   │   │   ├── operator-actions/  # Audited operator action executor
│   │   │   │   ├── outbound/          # Draft/send/reconcile workers
│   │   │   │   ├── persistence/       # Filesystem stores
│   │   │   │   ├── principal-runtime/ # Principal/session runtime
│   │   │   │   ├── projector/         # Event application
│   │   │   │   ├── recovery/          # Crash recovery helpers
│   │   │   │   ├── runner/            # Sync orchestration
│   │   │   │   ├── scheduler/         # Lease and execution lifecycle
│   │   │   │   ├── sources/           # Timer, webhook, filesystem, inbox-drop sources
│   │   │   │   ├── types/             # TypeScript definitions
│   │   │   │   └── utils/             # Shared utilities
│   │   │   ├── test/
│   │   │   │   ├── unit/              # Component tests
│   │   │   │   ├── integration/       # End-to-end tests
│   │   │   │   ├── benchmarks/        # Performance benchmarks
│   │   │   │   └── windows/           # Windows-specific tests
│   │   │   └── docs/                  # Numbered kernel docs
│   │   ├── cli/                       # CLI entry points and commands
│   │   └── daemon/                    # Long-running daemon
│   ├── domains/charters/              # Charter contracts and policies
│   ├── verticals/search/              # FTS5 search
│   └── verticals/mailbox/             # Mailbox vertical
├── scripts/                           # Build, test, lint, and utility scripts
├── tools/                             # Agent TUI, native carrier, site init
├── docs/                              # Product, architecture, and concept docs
├── operator-surfaces/                 # Runtime identity and binding projections
└── .github/workflows/                 # CI/CD pipelines
```

---

## Build, Typecheck, and Verification

### Install

```bash
pnpm install
```

### Fast verification (default)

```bash
pnpm verify
```

Runs:
1. Task file guard (`scripts/task-file-guard.ts`)
2. CLI output admission guard (`scripts/cli-output-admission-guard.mjs`)
3. Typecheck (`pnpm typecheck`)
4. Build (`pnpm build`)
5. Task lifecycle snapshot guard (`pnpm narada:guard-task-db`)
6. Task-governance smoke tests
7. Charters tests
8. Ops-kit tests

This is the reliable ~15-second default after local changes.

### Build and typecheck

```bash
pnpm build            # tsc across all packages
pnpm typecheck        # tsc --noEmit across all packages
```

Control-plane build also regenerates `config.schema.json`:

```bash
pnpm --filter @narada2/control-plane generate:config-schema
```

### Testing

Root `pnpm test` is intentionally disabled. Use the escalation ladder:

| Command | What it does | When to use |
|---------|--------------|-------------|
| `pnpm verify` | Fast guard + typecheck + build + fast tests | **Default** |
| `pnpm test:focused "<cmd>"` | Run one focused command with telemetry | Single file or small bounded run |
| `pnpm test:unit` | Unit tests across all packages | Heavy suites included |
| `pnpm test:integration` | Integration tests only | Durable-state or I/O changes |
| `pnpm test:control-plane` | Control-plane tests only | Control-plane internals |
| `pnpm test:daemon` | Daemon tests only | Daemon or integration surface |
| `ALLOW_FULL_TESTS=1 pnpm test:full` | Full recursive suite | CI, release prep, explicit request |

Focused test examples:

```bash
# Single control-plane test file
pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/ids/event-id.test.ts"

# Single CLI test file
pnpm --dir packages/layers/cli exec vitest run test/commands/task-report.test.ts

# Inbox tests (integration-heavy; keep bounded)
pnpm --dir packages/layers/cli exec vitest run test/commands/inbox.test.ts test/commands/inbox-mutation-evidence.test.ts
```

`pnpm test:focused` records timing and classification to `.ai/metrics/test-runtimes.json`.

### Known test teardown noise

The project uses `node:sqlite`, the Node.js built-in SQLite binding. Unlike the previous `better-sqlite3` dependency, `node:sqlite` does not rely on a native add-on whose destructors can race V8 garbage collection. An exit code 133 / SIGTRAP after tests complete should therefore be treated as `infrastructure-failure` and investigated, not dismissed as harmless teardown noise.

### Lint

```bash
pnpm control-plane-lint   # Enforces vertical-neutrality in kernel modules
```

This script (`scripts/control-plane-lint.ts`) scans `packages/layers/control-plane/src/{scheduler,facts,intent,sources,executors,charter,foreman,coordinator,observability}/` and fails if mailbox-specific terms (`conversation_id`, `thread_id`, `mailbox_id`, mailbox-era table names, or mail-vertical imports) leak into generic kernel modules. CI runs this.

**Note**: Some CI workflow files reference `pnpm lint` and `pnpm fmt --check`. These scripts are not defined in the current root `package.json`. Use `pnpm control-plane-lint` for the active invariant lint. The formatter configuration lives at `packages/layers/control-plane/.oxfmtrc.jsonc` (oxfmt style). Use `pnpm toolchain:oxbuild-probe` to probe the alternate oxbuild toolchain.

---

## Code Style and Conventions

### TypeScript posture

- All packages use `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`.
- ESM only. Import paths include `.js` extensions for compiled outputs; source uses TypeScript paths.
- Prefer explicit return types on public package exports.
- Dependency injection via constructor/options objects.

### Naming grammar

| Pattern | Example | Use For |
|---------|---------|---------|
| `lower_snake_case` | `source_adapter`, `foreman_decision` | Code identifiers, config keys, fact predicates |
| `kebab-case` | `crossing-regime`, `task-attachment` | File names, CLI commands, URL paths |
| `PascalCase` | `CrossingRegime`, `TaskAssignment` | TypeScript types, interfaces, classes |
| `SCREAMING_SNAKE_CASE` | `CROSSING_REGIME_INVENTORY` | Constants, enums, environment variables |
| `lower.kind:id` | `mail:thread_abc123` | Subject identifiers in facts |

Past tense for predicates (`order_created`, not `create_order`). Specific verbs (`shipped`, `confirmed`, not `updated`). Stable once deployed.

Names identify; they do not mean. String names may be used as stable identifiers for exact lookup, routing to explicitly declared objects, correlation, logging, and display. They must not be parsed to infer authority, capability, effect, domain, policy, type, or behavior. Put those semantics in explicit schema/config/registry metadata. See [`docs/concepts/names-identify-do-not-mean.md`](docs/concepts/names-identify-do-not-mean.md).

### Formatter configuration

`packages/layers/control-plane/.oxfmtrc.jsonc`:

- printWidth: 100
- tabWidth: 2, spaces
- singleQuote: true
- trailingComma: `all`
- endOfLine: `lf`

Other packages follow the same style by convention; no root formatter config is present.

### Module boundaries

- `packages/layers/control-plane/src/types/` is a leaf module.
- Generic control-plane modules must use `context_id` / `scope_id`, never `conversation_id` / `mailbox_id`.
- Mail-specific logic belongs in `adapter/graph/`, `normalize/`, `projector/`, `persistence/messages`, `foreman/mailbox/`, `coordinator/mailbox-*`, or `observability/mailbox.ts`.
- New verticals build against `context_id` / `scope_id` and `outbound_handoffs`.

---

## Testing Strategy

- **Focused first**: Prefer `pnpm test:focused` with a single test file. Do not run the full suite unless explicitly requested.
- **Suggestion surface**: Before deciding verification manually, run `narada verify suggest --files <changed-files>`.
- **Fixtures prove boundaries**: A fixture must show that useful behavior passes through the claimed structure without bypassing authority boundaries.
- **Coverage thresholds** (control-plane): lines 70%, functions 70%, branches 60%, statements 70%. CLI thresholds: lines 60%, functions 60%, branches 50%, statements 60%.
- **Telemetry**: `scripts/test-telemetry.ts` records run classification (`success`, `assertion-failure`, `infrastructure-failure`, `known-teardown-noise`).
- **Test databases**: `packages/layers/control-plane/test/db-lifecycle.ts` provides `createTestDb()` and `closeAllTestDatabases()`. Many existing tests still use raw `new Database(":memory:")`; new/refactored tests should prefer the helper.

---

## Deployment and Release

### Versioning

Uses Changesets:

```bash
pnpm changeset              # Add a changeset
pnpm version-packages       # Bump versions and generate changelog
```

### Release

```bash
pnpm release                # Runs scripts/publish-local.ts
```

The release script:
1. Verifies a clean git worktree.
2. Verifies npm authentication.
3. Runs `pnpm prepublish-check`.
4. Runs `pnpm version-packages`.
5. Rebuilds (`pnpm build`).
6. Runs `pnpm pack:check`.
7. Publishes with `changeset publish`.

### CI/CD

- `.github/workflows/test.yml` — typecheck, tests, coverage, control-plane lint on push/PR.
- `.github/workflows/test-cross-platform.yml` — Node 18/20/22 on Ubuntu, Windows, macOS; Windows-specific and path tests.
- `.github/workflows/release.yml` — build, full tests, and Changesets release on `main`.
- `.github/workflows/benchmark.yml` — benchmark runs.

### CLI shim installation

```bash
pnpm narada:install-shim    # bash scripts/install-narada-shim.sh
```

Installs the `narada` CLI shim so the binary is available on PATH.

---

## Security and Secret Handling

### Secret resolution precedence

1. Environment variables (highest)
2. Secure storage references (`{ "$secure": "key" }`)
3. Config file values (lowest)

### Graph API credentials

| Source | Env Var | Config Key |
|--------|---------|------------|
| Access token | `GRAPH_ACCESS_TOKEN` | `graph.access_token` (via secure ref) |
| Tenant ID | `GRAPH_TENANT_ID` | `graph.tenant_id` |
| Client ID | `GRAPH_CLIENT_ID` | `graph.client_id` |
| Client Secret | `GRAPH_CLIENT_SECRET` | `graph.client_secret` |

### Charter runtime API key

| Source | Env Var | Config Key |
|--------|---------|------------|
| OpenAI API key | `OPENAI_API_KEY` | `charter.api_key` |

### Secure storage

`SecureStorage` implementations: `KeychainStorage`, `FileSecureStorage`, `InMemorySecureStorage`. If `{ "$secure": "key" }` references exist and no storage is provided, config loading throws before side effects.

### Operational security rules

- Do not commit secrets, credentials, tokens, private mailbox contents, or private operational data to the repo.
- Use `sanitizeForLogging` and related helpers in `packages/layers/control-plane/src/logging/sanitize.js` before logging.
- Email-originated operator requests may only create pending audited `operator_action_requests`; no `From:` header or message body may directly approve an action.
- The operator console mutates only through `executeOperatorAction()` with a safelisted action set.

---

## Task and Agent Execution Contract

This is a summary. The full contract is in [`.ai/task-contracts/agent-task-execution.md`](.ai/task-contracts/agent-task-execution.md).

- **Artifact discipline**: Update the original task file; do not create derivative status files (`-EXECUTED.md`, `-DONE.md`, `-RESULT.md`, `-FINAL.md`, `-SUPERSEDED.md`).
- **Task numbers**: Never allocate by filename sorting. Use `scripts/task-reserve.ts` or scan `# Task NNN` headings in `.ai/do-not-open/tasks/*.md`.
- **Target locus before mutation**: Identify the target Site/locus/path before mutating task, inbox, roster, lifecycle, or publication state. `/home/andrey/src/narada` defaults to read-only doctrine inspection unless Narada proper is explicitly named as the mutation target.
- **Completion**: Submit a WorkResultReport with `narada task report` or `narada task finish`. Chat "done" is not lifecycle authority.
- **Closure invariants**: A task may close only when all acceptance criteria are checked, execution notes exist, verification notes exist, and no derivative status files exist.
- **Authority boundaries**: Do not bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, `OutboundHandoff`, outbound workers, or observation/control separation.

---

## Critical Invariants (Must Never Violate)

### Inbound / compiler

1. **No Loss After Commit**: `cursor = c` ⇒ all events ≤ c have been applied.
2. **Replay Safety**: `apply(e)` multiple times ⇒ same final state.
3. **Determinism**: `normalize(remote_data)` produces identical output for identical input.
4. **Idempotency Boundary**: Enforced at `event_id` → `apply_log`.
5. **Apply Ordering**: `apply(e)` → `mark_applied(e)` → `cursor_commit` (never reorder).

### Control plane

6. **Foreman owns work opening**: Only `DefaultForemanFacade.onSyncCompleted()` / `onFactsAdmitted()` may insert `work_item` rows. Both delegate to a private `onContextsAdmitted()`.
7. **Foreman owns evaluation resolution**: Only `DefaultForemanFacade.resolveWorkItem()` may transition a `work_item` to `resolved`.
8. **Foreman owns failure classification**: Only `DefaultForemanFacade.failWorkItem()` may transition a `work_item` to `failed_retryable` or `failed_terminal`.
9. **Scheduler owns leases and mechanical lifecycle**: Only `SqliteScheduler` may insert/release `work_item_leases` and transition items to `leased` or `executing`.
10. **IntentHandoff owns intent creation**: Only `IntentHandoff.admitIntentFromDecision()` may create `intent` rows.
11. **OutboundHandoff owns command creation**: All `outbound_commands` + `outbound_versions` must be created inside `OutboundHandoff.createCommandFromDecision()`.
12. **Outbound workers own mutation**: Only outbound workers may call the source adapter to create drafts / send messages / move items.
13. **Charter runtime is read-only sandbox**: It may only read the `CharterInvocationEnvelope` and produce a `CharterOutputEnvelope`.
14. **Decision Before Command**: `foreman_decision` is append-only; one decision produces at most one command.
15. **No automatic replay on startup**: Replay, preview, recovery, rebuild, and confirm operators require explicit trigger.

### Observation / UI

16. **Observation is read-only projection**: `layers/control-plane/src/observability/` derives data exclusively from durable stores.
17. **Control surface separated**: Operator actions mount under `/control/scopes/:scope_id/actions`. The observation namespace (`/scopes/...`) is GET-only.
18. **UI cannot become hidden authority**: The operator console mutates only through audited `executeOperatorAction()`.
19. **No mailbox leakage into generic observation**: `conversation_id` and `mailbox_id` must not appear in generic observability types/queries.

### Outbound

20. **Draft-First Delivery**: Agents and workers never send directly; they create a draft first.
21. **Two-Stage Completion**: A command reaches `submitted` when Graph accepts it, and `confirmed` only after inbound reconciliation observes the result.
22. **Worker Exclusivity**: Only the outbound worker may create or mutate managed drafts.

### Crossing regime

23. **No crossing without regime**: Every zone-to-zone boundary crossing that produces a durable artifact must have an explicit crossing regime.
24. **Authority changes at boundaries**: If a transition does not change authority owner, it is an internal state transition, not a boundary crossing.
25. **Regimes are not transitive shortcuts**: `Source → Fact → Context → Work` is valid; `Source → Work` is an authority collapse.

### Advisory signals

26. **Advisory signals are non-authoritative**: Removing every advisory signal must leave all durable boundaries intact.
27. **Advisory signals are overrideable**: Consumers must have a sensible fallback when a signal is absent, contradictory, or stale.
28. **Advisory signals have no lifecycle side effect**: Emitting or consuming one must not transition the lifecycle state of a durable object.

---

## Where to Find Things

### By Task

| I want to... | Look In |
|--------------|---------|
| Change event ID computation | `packages/layers/control-plane/src/ids/event-id.ts` |
| Add a new persistence store | `packages/layers/control-plane/src/persistence/` + docs/03-persistence.md |
| Modify the sync loop | `packages/layers/control-plane/src/runner/sync-once.ts` |
| Add a CLI command | `packages/layers/cli/src/commands/` + `packages/layers/cli/src/main.ts` |
| Change Graph API handling | `packages/layers/control-plane/src/adapter/graph/` |
| Change coordinator SQLite schema | `packages/layers/control-plane/src/coordinator/store.ts` |
| Recover control plane from facts | `packages/layers/cli/src/commands/recover.ts` + `packages/layers/control-plane/src/foreman/facade.ts` |
| Modify work item lifecycle | `packages/layers/control-plane/src/scheduler/scheduler.ts` |
| Modify foreman work opening | `packages/layers/control-plane/src/foreman/facade.ts` |
| Modify outbound handoff | `packages/layers/control-plane/src/foreman/handoff.ts` |
| Change outbound command state machine | `packages/layers/control-plane/src/outbound/types.ts` |
| Modify send-reply worker | `packages/layers/control-plane/src/outbound/send-reply-worker.ts` |
| Modify reconciler | `packages/layers/control-plane/src/outbound/reconciler.ts` |
| Rebuild projections | `packages/layers/control-plane/src/observability/rebuild.ts` + `packages/layers/cli/src/commands/rebuild-projections.ts` |
| Add a new vertical source | `packages/layers/control-plane/src/sources/{vertical}-source.ts` |
| Add a context strategy | `packages/layers/control-plane/src/foreman/context.ts` |
| Add a generic webhook HTTP server | `packages/layers/daemon/src/generic-webhook-server.ts` |
| Change charter runtime envelope | `packages/domains/charters/src/runtime/envelope.ts` |
| Add a charter runner | `packages/domains/charters/src/runtime/runner.ts` |
| Add a tool catalog entry | `packages/domains/charters/src/tools/resolver.ts` |
| Modify tool validation rules | `packages/domains/charters/src/tools/validation.ts` |
| Add a new field to messages | `packages/layers/control-plane/src/types/normalized.ts` + `packages/layers/control-plane/src/normalize/message.ts` |
| Modify config schema | `packages/layers/control-plane/src/config/types.ts` + `packages/layers/control-plane/src/config/load.ts` |
| Modify crossing regime declaration | `packages/layers/control-plane/src/types/crossing-regime.ts` + `SEMANTICS.md §2.15` |
| Modify zone template taxonomy | `packages/layers/control-plane/src/types/zone-template.ts` + `SEMANTICS.md §2.17` |
| Bootstrap a new operation | `docs/product/bootstrap-contract.md` + `packages/ops-kit/src/commands/init-repo.ts` |
| Bootstrap a new Site | `docs/product/site-bootstrap-contract.md` + `packages/layers/cli/src/commands/sites.ts` |
| Run the canonical product proof | `docs/product/first-operation-proof.md` + `packages/layers/control-plane/test/integration/live-operation/smoke-test.test.ts` |
| Run the operator daily loop | `docs/product/operator-loop.md` + `packages/layers/cli/src/commands/ops.ts` |

### By Concept

| Concept | Definition | Primary Location |
|---------|------------|------------------|
| **Delta Token** | URL/cursor from Graph API indicating sync position | `src/persistence/cursor.ts` |
| **Apply-Log** | Set of applied event IDs for idempotency | `src/persistence/apply-log.ts` |
| **Tombstone** | Deletion marker for audit trails | `src/persistence/tombstones.ts` |
| **Normalized Event** | Canonical representation of a Graph change | `src/types/normalized.ts` |
| **Stable Stringify** | Deterministic JSON serialization | `src/ids/event-id.ts` |
| **Secure Storage** | OS keychain / file credential storage | `src/auth/secure-storage.ts` |
| **conversation_id** | v2 canonical thread identifier (legacy `thread_id` in rollback tables only) | `src/coordinator/types.ts` |
| **work_item** | Terminal schedulable unit of control work | `src/coordinator/types.ts` |
| **execution_attempt** | Bounded charter invocation record | `src/coordinator/types.ts` |
| **Lease** | Execution authority record for a work item | `src/scheduler/scheduler.ts` |
| **Foreman Decision** | Outbound proposal record | `src/foreman/facade.ts` |
| **outbound command** | Durable mailbox mutation intent | `src/outbound/types.ts` |
| **crossing regime** | Explicit rules governing a zone boundary crossing | `src/types/crossing-regime.ts` + `SEMANTICS.md §2.15` |
| **zone template** | Reusable pattern for authority-homogeneous zones | `src/types/zone-template.ts` + `SEMANTICS.md §2.17` |

(Paths above are relative to `packages/layers/control-plane/` where not absolute.)

---

## Common Modifications

### 1. Add a New Field to NormalizedMessage

1. Add field to `packages/layers/control-plane/src/types/normalized.ts`.
2. Extract/transform in `packages/layers/control-plane/src/normalize/message.ts`.
3. Update `FileMessageStore.upsertFromPayload()` if persistence needs change.
4. Add test in `packages/layers/control-plane/test/unit/normalize/message.test.ts`.

### 2. Add a New Persistence Store

1. Define interface in `packages/layers/control-plane/src/types/runtime.ts` if not existing.
2. Implement in `packages/layers/control-plane/src/persistence/{name}.ts`.
3. Follow atomic write pattern (write to tmp, rename).
4. Add unit tests in `packages/layers/control-plane/test/unit/persistence/{name}.test.ts`.

### 3. Handle a New Graph API Error

1. Add error classification in `packages/layers/control-plane/src/adapter/graph/client.ts`.
2. Map to `retryable_failure` or `fatal_failure` in `packages/layers/control-plane/src/runner/sync-once.ts`.
3. Add test case in `packages/layers/control-plane/test/integration/`.

### 4. Add a CLI Command

1. Create `packages/layers/cli/src/commands/{command}.ts`.
2. Register it in `packages/layers/cli/src/main.ts` (or the appropriate `*-register.ts`).
3. Export types from `packages/layers/cli/src/index.ts`.
4. Use `loadConfig()` from `@narada2/control-plane` for config handling.

### 5. Add a New Non-Mail Vertical

1. Implement `Source` in `packages/layers/control-plane/src/sources/{vertical}-source.ts`.
2. Add fact type to `packages/layers/control-plane/src/facts/types.ts` and mapping in `packages/layers/control-plane/src/facts/record-to-fact.ts`.
3. Add `ContextFormationStrategy` in `packages/layers/control-plane/src/foreman/context.ts`.
4. Provide a projector (may be no-op for non-filesystem verticals).
5. Wire executor family in intent handoff if the vertical produces effects.
6. Add unit + integration tests proving replay safety and idempotency.
7. Update this AGENTS.md to list the new vertical as a peer.

### 6. Change Policy Binding

1. Update `RuntimePolicy` in `packages/layers/control-plane/src/config/types.ts`.
2. Update parsing/defaults in `packages/layers/control-plane/src/config/load.ts` and `packages/layers/control-plane/src/config/defaults.ts`.
3. Update consumers: `DefaultForemanFacade`, `buildInvocationEnvelope`, and daemon `service.ts`.
4. Update `packages/layers/control-plane/config.example.json`.
5. Add tests in `packages/layers/control-plane/test/unit/config/load.test.ts` and `packages/layers/daemon/test/integration/policy-routing.test.ts`.

---

## Review Checklist for Future Architecture Changes

When proposing changes that touch public types, docs, or package surfaces, verify:

- [ ] **Kernel-first framing**: Docs and comments describe the generalized behavior first, vertical specifics second.
- [ ] **No mailbox-default types**: Generic interfaces use `scope_id` / `context_id`, not `mailbox_id` / `conversation_id`.
- [ ] **Vertical parity**: New features for one vertical have a plausible path for peers (timer, webhook, filesystem, process).
- [ ] **Authority boundaries preserved**: No new write paths bypass `ForemanFacade`, `Scheduler`, `IntentHandoff`, or `OutboundHandoff`.
- [ ] **Observation remains read-only**: No UI-facing code mutates durable state directly.
- [ ] **Control-plane lint passes**: `pnpm control-plane-lint` reports zero violations.
- [ ] **Fixture discipline defined**: Before implementing a component that crosses an integration boundary, define the fixture shape that will prove the boundary works.

---

## Documentation Index

| Doc | Topic | Read If You... |
|-----|-------|----------------|
| [`SEMANTICS.md`](SEMANTICS.md) | Canonical ontology | Need a definition, identity format, or invariant |
| [`packages/layers/control-plane/docs/00-kernel.md`](packages/layers/control-plane/docs/00-kernel.md) | Irreducible kernel spec | Need the vertical-agnostic normative core |
| [`packages/layers/control-plane/docs/02-architecture.md`](packages/layers/control-plane/docs/02-architecture.md) | Component layers and data flow | Want to understand how the system is organized |
| [`packages/layers/control-plane/docs/03-persistence.md`](packages/layers/control-plane/docs/03-persistence.md) | Filesystem layout, atomic writes, crash recovery | Need storage/debug details |
| [`packages/layers/control-plane/docs/05-testing.md`](packages/layers/control-plane/docs/05-testing.md) | Test strategy and patterns | Are writing or debugging tests |
| [`packages/layers/control-plane/docs/06-configuration.md`](packages/layers/control-plane/docs/06-configuration.md) | Config schema and auth | Need to configure or deploy |
| [`QUICKSTART.md`](QUICKSTART.md) | Gold-path first-run guide | Are setting up for the first time |
| [`docs/product/bootstrap-contract.md`](docs/product/bootstrap-contract.md) | Operation bootstrap path | Bootstrapping an ops repo |
| [`docs/product/site-bootstrap-contract.md`](docs/product/site-bootstrap-contract.md) | Site first-run path | Setting up a local Site |
| [`docs/concepts/canonical-mutation-evidence.md`](docs/concepts/canonical-mutation-evidence.md) | SQLite/Git authority posture | Deciding what evidence a SQLite mutation must emit |
| [`docs/concepts/inhabited-evolution.md`](docs/concepts/inhabited-evolution.md) | Self-build doctrine | Lifting operational friction into durable form |
| [`docs/concepts/authority-revealing-inversion.md`](docs/concepts/authority-revealing-inversion.md) | Authority-revealing review lens | Reviewing artifact-first proposals |
| [`docs/concepts/capa-operation.md`](docs/concepts/capa-operation.md) | Corrective/preventive action | Handling recurrence-risk incidents |
| [`docs/concepts/agent-carrier.md`](docs/concepts/agent-carrier.md) | Agent Carrier concept and launch packet contract | Understanding how carriers embody agents without owning authority |
| [`docs/concepts/nars-runtime-contract.md`](docs/concepts/nars-runtime-contract.md) | NARS runtime contract | Implementing or verifying runtime-server package authority, canonical entrypoint, compatibility shims, lifecycle hooks, and carrier adapters |
| [`docs/concepts/launcher-session-dashboard.md`](docs/concepts/launcher-session-dashboard.md) | Launcher Session Dashboard target | Implementing or verifying persistent browser launcher UI, launch-attempt records, handoff evidence, runtime/projection observations, and lifecycle actions |
| [`docs/concepts/site-operating-loop-runtime-contract.md`](docs/concepts/site-operating-loop-runtime-contract.md) | Site Operating Loop runtime contract | Implementing or verifying generic Site loop runtime hosting, triggers, control, event subscription, and Site-owned loop module boundaries |
| [`docs/concepts/reactor-pattern.md`](docs/concepts/reactor-pattern.md) | Reactor pattern for chat/agent reactions | Designing a component that evaluates facts and proposes effects |

---

## License

MIT
