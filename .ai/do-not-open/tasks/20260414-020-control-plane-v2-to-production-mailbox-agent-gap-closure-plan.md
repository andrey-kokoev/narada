# Control Plane v2 to Production Mailbox Agent — Gap Closure Plan

## Mission

Define the remaining work required to turn Narada’s newly implemented control-plane v2 substrate into the production mailbox agent system we actually want.

This is a planning and sequencing task. It is not an implementation task.

## Current Assessment

Narada now has a real control-plane substrate:

- durable coordinator state for conversations, revisions, work items, leases, execution attempts, evaluations, and tool call records exists in `SqliteCoordinatorStore`
- a real scheduler exists for runnable work scanning, lease acquisition, execution lifecycle, retry, and stale lease recovery
- a real foreman exists for work opening, supersession, evaluation validation, and outbound handoff
- the daemon now performs a dispatch phase after sync and drives foreman + scheduler + charter execution in-process
- the package exports now expose coordinator, foreman, scheduler, charter, and trace surfaces as first-class runtime modules

However, the current system is still not the terminal production mailbox agent:

- daemon dispatch still defaults to `MockCharterRunner` unless a real runner is injected
- the real Codex-capable charter runner is API-based, not CLI-based, and is not yet wired into the daemon dispatch path by default
- invocation envelopes still expose no actual runtime tools (`available_tools: []`)
- charter routing is still hardcoded around `support_steward` in core foreman/envelope flows
- multi-mailbox dispatch remains explicitly deferred in the daemon service
- identity remains partly transitional because v2 `conversation_id` objects coexist with legacy `thread_id` surfaces and migration logic

## Terminal Objective

Narada must become:

> a background mailbox operating substrate that continuously syncs mailbox state, opens durable work items for changed conversations, invokes a real bounded Codex-based charter runtime with governed tools and mailbox-specific policy, and materializes approved side effects only through the outbound worker, with crash-safe re-entry and no hidden in-memory authority.

## Planning Goal

Produce the normative phase plan from the current implemented substrate to the terminal objective.

The result must answer:

1. What is already solved well enough to build upon?
2. What remains missing?
3. What must happen first?
4. What can be deferred?
5. What are the exact success conditions for each phase?

## Core Invariants

1. Remote mailbox truth remains outside Narada.
2. `exchange-fs-sync` remains the deterministic compiler of mailbox state.
3. The control plane remains driven by durable work items, not traces or chat history.
4. Outbound worker remains the sole authority over mailbox mutations.
5. Agent runtime remains bounded and re-entrant.
6. Commentary, traces, and reasoning logs must never become correctness state.

---

## Runtime Decision Gate

This plan assumes a real production charter runtime will replace the daemon’s current `MockCharterRunner` default. Before implementation begins, Narada must explicitly choose whether the production runtime is:

- **Codex/OpenAI-compatible API runner** — network call to OpenAI/Codex API; requires `OPENAI_API_KEY`; fast to implement; depends on external service availability
- **Codex CLI runner in local workspace** — spawns local `codex` CLI process; depends on local installation and workspace context; may offer better locality and auditability
- **Dual-runtime abstraction with config-driven selection** — `CharterRunner` interface backed by either API or CLI depending on config; most flexible but requires unifying secrets, timeouts, and observability surfaces

This decision is first-order because it affects:
- **workspace semantics** — where reasoning context and file attachments live
- **tool integration** — whether tools are in-process (API) or subprocess (CLI)
- **secrets/config handling** — API key vs. CLI auth session
- **observability** — HTTP tracing vs. process stdout capture
- **operator model** — headless daemon vs. interactive developer loop

**No Phase A implementation tasks should begin until this choice is made.**

---

## Current State Summary

**Solved well enough to build upon:**

- **Control-plane durable substrate**: SQLite coordinator schema (`conversation_records`, `revisions`, `work_items`, `execution_attempts`, `evaluations`, `tool_call_records`) is implemented, with existing test coverage in `test/unit/coordinator/store.test.ts`.
- **Scheduler mechanics**: Lease acquisition, renewal, stale-lease recovery, execution lifecycle (`active` → `succeeded`/`crashed`), and retry backoff are implemented, with existing test coverage in `test/unit/scheduler/scheduler.test.ts`.
- **Foreman lifecycle**: `onSyncCompleted()` opens/supersedes work items; `resolveWorkItem()` validates charter output and atomically commits `foreman_decision` + `outbound_command` via `OutboundHandoff`, with existing test coverage in `test/unit/foreman/facade.test.ts` and `test/unit/foreman/handoff.test.ts`.
- **Crash recovery**: Replay and recovery behaviors are validated by the integration suite in `test/integration/control-plane/replay-recovery.test.ts`.
- **Outbound pipeline**: `SqliteOutboundStore`, send-reply worker, reconciler, and non-send worker exist and operate on durable commands.
- **Daemon dispatch (single-mailbox)**: After a successful sync cycle, the daemon builds a `SyncCompletionSignal`, calls the foreman, and drives the scheduler quiescence loop with lease heartbeats.

**Still missing:**

- The daemon dispatch path defaults to `MockCharterRunner` instead of a real Codex/OpenAI runtime.
- `buildInvocationEnvelope` currently injects an empty `available_tools` array, so no live tool governance is exercised during charter execution.
- Charter selection is hardcoded to `support_steward`; there is no mailbox-level policy router.
- Multi-mailbox dispatch is explicitly deferred behind a `TODO` in `createMultiMailboxService`.
- Legacy `thread_id` columns and naming still coexist with v2 `conversation_id` semantics, creating friction in SQL queries and type boundaries.
- No end-to-end integration test exercises the full path from sync → real charter evaluation → tool call → outbound command creation in the daemon process.

---

## Gap Register

| Gap | Current State | Target State | Priority | Blocking / Non-blocking | Classification |
|-----|--------------|--------------|----------|------------------------|----------------|
| **Real charter runtime wiring** | Daemon defaults to `MockCharterRunner`; `CodexCharterRunner` exists but is opt-in via injection | Daemon uses a configurable real runner (API, CLI, or dual) by default; `MockCharterRunner` is dev/test-only | P0 | **Blocking** — without this, no real agent evaluation happens | blocks first real mailbox |
| **Live tool governance** | `available_tools: []` in invocation envelope; `ToolRunner` exists but is not invoked from daemon dispatch | Envelope populates actual tool catalog; daemon dispatch executes approved tool calls via `ToolRunner` and persists `tool_call_records` | P0 | **Blocking** — a real charter cannot do useful work without tools | blocks first real mailbox |
| **Mailbox charter/policy routing** | Hardcoded `support_steward` in foreman/envelope flows | Configurable per-mailbox charter selection (e.g., `mailbox.charter_id`) with fallback policy | P1 | **Non-blocking** for first real mailbox, but blocking for multi-tenant generalization | blocks platform generalization |
| **Identity cleanup** | `thread_id` columns and naming persist alongside `conversation_id` semantics | All control-plane surfaces use `conversation_id`; legacy migration code removed | P1 | **Non-blocking** for functionality, but blocking for long-term maintainability | does not block usefulness |
| **Arbitration refinement** | Foreman validates output envelope structurally; limited action-class governance | Richer validation (action-class allowlists, payload schema guards, escalation heuristics) | P1 | **Non-blocking** for happy path, but blocking for safe unattended operation | blocks unattended safety |
| **Multi-mailbox dispatch completion** | Deferred `TODO` in `createMultiMailboxService`; `syncMultiple` does not expose per-mailbox changed conversations | Per-mailbox dispatch loop after `syncMultiple`, or inline individual runners with conversation tracking | P1 | **Blocking** for multi-mailbox production deployment, but not for single-mailbox validation | blocks platform generalization |
| **End-to-end daemon test harness** | Daemon dispatch tested only with mock runner; no test covers tool execution or real runtime path | Integration test exercises full daemon cycle: sync → real runner → charter evaluation → outbound command, plus crash replay | P0 | **Blocking** — without this, we cannot claim the system is verified | blocks first real mailbox |
| **Documentation realignment** | Docs updated for control-plane v2 structure | Docs refreshed to describe real runtime wiring, tool governance, and multi-mailbox dispatch | P2 | **Non-blocking** but must be synchronized before any phase exit | does not block usefulness |

---

## Three-Phase Plan

### Phase A — Make It Real

**Scope:** Convert the daemon dispatch scaffold into an actual working mailbox-agent path for a single mailbox.

**Included workstreams:**
- Wire the chosen real charter runtime as the default daemon runner (configurable via `config.json` or env vars).
- Populate `available_tools` in `buildInvocationEnvelope` based on a tool catalog (start with a small, governed set).
- Connect `ToolRunner` into the daemon dispatch loop so approved tool requests are executed and recorded.
- Add an end-to-end daemon integration test that uses the real runtime path and results in an `outbound_command`.
- Add configuration schema support for charter runtime credentials and selection.

**Excluded workstreams:**
- Multi-mailbox dispatch
- Identity cleanup (`thread_id` → `conversation_id`)
- Advanced arbitration heuristics
- New outbound action types beyond `send_reply` / `create_draft`

**Dependencies:** The Runtime Decision Gate must be resolved.

**Deliverables:**
- `service.ts` instantiates the chosen real runner by default with config-driven secrets.
- `buildInvocationEnvelope` receives a non-empty tool catalog.
- Daemon dispatch loop executes tool calls via `ToolRunner` and persists records.
- New integration test in `exchange-fs-sync-daemon/test/integration/dispatch-real.test.ts` passes.

**Exit criteria:**
- A single-mailbox daemon, started with valid mailbox credentials and a real charter runtime, can sync a changed conversation, open a work item, acquire a lease, produce a real evaluation, and materialize a valid outbound command without human intervention.
- Live tool execution is in Phase A scope, but is not required for Phase A exit if it delays the first real runtime proof.
- `pnpm test` passes with no regressions.

---

### Phase B — Make It Safe

**Scope:** Close semantic, replay, crash, and arbitration ambiguity so the system can run unattended.

**Included workstreams:**
- **Crash/replay test harness**: Extend replay-recovery tests to cover daemon dispatch path (kill daemon mid-charter-execution, restart, verify deterministic recovery via lease staleness + attempt abandonment).
- **Arbitration refinement**: Add action-class allowlists to the foreman; reject or escalate charter outputs that propose disallowed actions; tighten payload schema validation.
- **Tool governance hardening**: Enforce tool-level permissions (e.g., read-only vs. mutating), timeout budgets, and idempotency keys for HTTP tools.
- **Identity cleanup**: Rename legacy `thread_id` columns to `conversation_id` in SQL schemas and TypeScript types; remove migration scaffolding if safely deprecated.

**Excluded workstreams:**
- Multi-mailbox dispatch
- Charter routing/policy engine
- Observability/tracing productization

**Dependencies:** Phase A must be complete so that the safety tests exercise the real runtime path.

**Deliverables:**
- New crash-replay integration tests covering daemon mid-execution restart.
- Foreman rejects disallowed actions with explicit `validation_failed` outcome.
- `tool_call_records` include permission level and timeout budget.
- Zero remaining `thread_id` references in first-class control-plane tables.

**Exit criteria:**
- The daemon can be killed at any point during dispatch and, upon restart, resume or correctly supersede in-flight work without duplicate outbound commands.
- The foreman will never allow a tool call or outbound action that violates the configured allowlist.

---

### Phase C — Make It General

**Scope:** Lift Narada from a single-mailbox agent to a reusable multi-mailbox platform.

**Included workstreams:**
- **Multi-mailbox dispatch completion**: Refactor `syncMultiple` to expose per-mailbox changed conversations (or run individual `DefaultSyncRunner`s inline), then run the full dispatch phase per mailbox.
- **Charter routing / policy engine**: Replace hardcoded `support_steward` with mailbox-level charter configuration; support multiple charters in the same deployment.
- **Documentation realignment**: Update all architecture, quickstart, and AGENTS docs to reflect real runtime wiring, tool governance, and multi-mailbox dispatch.
- **Packaging & config schema**: Ensure `config.example.json` and validation support multi-charter, multi-mailbox, and runtime credential configuration.

**Excluded workstreams:**
- New projection types (analytics, search indexing)
- Non-Graph adapter backends
- Speculative AI capabilities (multi-turn chat, plan-act loops)

**Dependencies:** Phase B must be complete so that generalization does not multiply unsafe behavior.

**Deliverables:**
- `createMultiMailboxService` runs foreman + scheduler dispatch for every mailbox in the config.
- Per-mailbox `charter_id` configuration drives envelope building and foreman validation.
- Docs describe the full 11-layer architecture with real runtime and multi-mailbox dispatch.

**Exit criteria:**
- A single daemon process can sync and evaluate multiple independent mailboxes, each with its own charter policy, without cross-mailbox state leakage.
- All tests pass and documentation is current with the implementation.

---

## Ordering Constraints

| Question | Answer |
|----------|--------|
| Can real runtime wiring happen before identity cleanup? | **Yes.** The runtime path and the naming cleanup are orthogonal. Runtime wiring touches the daemon and envelope builder; identity cleanup touches schemas and types. |
| Can tool governance happen before routing cleanup? | **Yes.** Tools are generic capabilities (e.g., `search_messages`, `create_draft`). Which charter is invoked is a separate concern. Tools should be governed before they are used, regardless of charter selection. |
| Can multi-mailbox dispatch happen before the single-mailbox runtime is real? | **No.** Building multi-mailbox dispatch on top of a mock-only runtime would multiply test debt and delay the first real end-to-end proof. Single-mailbox must be real first. |
| Can docs lag implementation during this phase? | **Partially.** Internal refactor docs may lag by a few commits, but user-visible config schema, architecture invariants, and AGENTS docs must stay synchronized before each phase exit. |

---

## Critical Path

The shortest path that preserves de-arbitrarization:

1. **Resolve the Runtime Decision Gate.**
   - Choose API, CLI, or dual runtime before any implementation begins.
   - This forces secrets, config, and observability models to become concrete.

2. **Wire the chosen real charter runner as the daemon default.**
   - This unblocks the first real end-to-end evaluation.

3. **Populate `available_tools` and connect `ToolRunner` in daemon dispatch.**
   - Without this, the runner produces proposals that cannot be grounded in mailbox state.
   - This is the second half of “making it real.”

**Work that would create the most rework if done prematurely:**
- **Multi-mailbox dispatch**: Doing this before the single-mailbox path is proven real would spread mock-runtime assumptions across multiple mailboxes and make debugging harder.
- **Identity cleanup across all packages**: If done while the envelope and foreman interfaces are still changing, the renames would need to be repeated.

**Work that is safe to defer:**
- Advanced arbitration heuristics (escalation scoring, sentiment analysis).
- Trace/observability productization beyond structured logging.
- New outbound action types (move, flag, categorize) beyond reply/draft.
- Non-Graph adapter backends.

---

## Success Metrics

### Phase A — Make It Real
- Daemon `service.ts` uses the chosen real runtime by default when configured.
- `buildInvocationEnvelope` passes at least one real tool definition into `available_tools`.
- At least one integration test demonstrates: sync changed conversation → scheduler lease → charter evaluation → foreman resolution → `outbound_command` row created. (Tool execution is highly desirable but not required for Phase A exit.)
- `pnpm test` and `pnpm typecheck` pass with no regressions.

### Phase B — Make It Safe
- New integration tests demonstrate crash recovery during daemon dispatch (mid-execution restart).
- Foreman rejects a charter output proposing a disallowed action class.
- All first-class control-plane SQL schemas use `conversation_id` exclusively.
- `pnpm test` passes; segfaults (if any) are confirmed as `better-sqlite3` cleanup artifacts only.

### Phase C — Make It General
- Multi-mailbox daemon test verifies that two mailboxes each produce independent `work_item` + `outbound_command` flows.
- Config schema supports `mailboxes[].charter_id` and validates it.
- `docs/02-architecture.md` and both `AGENTS.md` files describe the real runtime and multi-mailbox dispatch accurately.
- All replay/recovery tests plus all daemon tests pass.

---

## Deferred Work (Intentionally Not on the Critical Path)

- **Trace/commentary productization**: `agent_traces` and evaluation reasoning logs are soft commentary. They can be enriched later but must never become required for correctness.
- **Analytics projections**: Search index, conversation analytics, or dashboard views are non-authoritative and can be rebuilt at any time.
- **Non-reply outbound actions**: Moving messages, setting flags, or applying categories via the outbound worker are valuable but not required for the first real mailbox agent.
- **Alternative AI backends**: Anthropic, local LLaMA, or other adapters can be added behind the `CharterRunner` interface after the OpenAI/Codex path is stable.
- **Interactive CLI chat mode**: A human-in-the-loop review mode is a product feature, not a substrate requirement.

---

## Terminal Readiness Statement

> Narada reaches the terminal mailbox-agent objective when a changed conversation in a synced mailbox automatically flows through foreman work opening, scheduler lease acquisition, real charter evaluation with governed tools, and foreman resolution into an outbound command, all without human intervention and with deterministic crash recovery.

---

## Definition of Done

- [x] Current implemented substrate is accurately summarized
- [x] Remaining gaps are explicitly categorized
- [x] The plan is organized into three phases
- [x] Ordering constraints are explicit
- [x] Critical path is explicit
- [x] Exit criteria are concrete enough to drive follow-on tasks
