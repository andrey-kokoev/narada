# Control Plane v2 to Production Mailbox Agent — Gap Closure Plan

## 1. Current State Summary

### Already solved (buildable substrate)
- **Durable coordinator state**: `SqliteCoordinatorStore` persists conversations, revisions, work items, leases, execution attempts, evaluations, and tool call records.
- **Scheduler**: `SqliteScheduler` implements runnable work scanning, lease acquisition, execution lifecycle, retry/backoff, and stale-lease recovery.
- **Foreman**: `DefaultForemanFacade` implements work opening, supersession guards, evaluation validation, and atomic outbound handoff via `OutboundHandoff`.
- **Daemon dispatch**: `service.ts` now runs a dispatch phase after every successful single-mailbox sync, calling `foreman.onSyncCompleted()` and driving the scheduler quiescence loop with lease acquisition, charter execution, and work-item resolution.
- **Exports**: `exchange-fs-sync` exports the full control-plane surface (coordinator, foreman, scheduler, charter envelope builders, `Database`) as first-class modules.
- **Outbound workers**: `SendReplyWorker` and `NonSendWorker` exist for durable Graph-side effect execution.
- **Replay/recovery tests**: 35 integration tests verify idempotency, supersession, stale-lease recovery, crash-path idempotency, and quiescence semantics.

### Still missing
- **Real charter runtime wired by default**: `CodexCharterRunner` exists in `packages/charters/src/runtime/runner.ts` but the daemon still defaults to `MockCharterRunner`.
- **Live tool governance**: `buildInvocationEnvelope` hardcodes `available_tools: []`; the `resolveToolCatalog` function in `packages/charters` is not yet integrated into the daemon dispatch path.
- **Charter/policy routing**: `support_steward` is hardcoded as the primary charter in both foreman and envelope builders; there is no mailbox-level charter binding configuration wired into `exchange-fs-sync`.
- **Identity cleanup**: Legacy `thread_records` table still exists; `foreman_decisions`, `charter_outputs`, and outbound command schemas still reference `thread_id` while the v2 canonical object is `conversation_id`.
- **Multi-mailbox dispatch**: The daemon explicitly defers per-mailbox dispatch in `createMultiMailboxService` because `syncMultiple` does not expose per-mailbox changed-conversation metadata.
- **Outbound worker loop**: Outbound workers are implemented but not yet scheduled as a background loop in the daemon.
- **End-to-end live harness**: No automated test demonstrates a full flow from real Graph API sync → real charter runtime → real outbound command → real Graph API mutation.

---

## 2. Gap Register

| Gap | Current State | Target State | Priority | Blocking |
|-----|---------------|--------------|----------|----------|
| **Real charter runtime wiring** | Daemon defaults to `MockCharterRunner`; `CodexCharterRunner` exists but is isolated in `packages/charters` | Daemon uses `CodexCharterRunner` by default when `OPENAI_API_KEY` (or compatible config) is present; mock remains for test injection | P0 | **Blocking** — without this there is no real agent reasoning |
| **Live tool governance** | `available_tools: []` hardcoded in `buildInvocationEnvelope`; tool resolver exists in `charters` package but is not consumed | `buildInvocationEnvelope` populates `available_tools` from mailbox/charter bindings in a `CoordinatorConfig`; tool calls are durably recorded and governed by `requires_approval` and `read_only` flags | P0 | **Blocking** — a real charter cannot do useful work without tools |
| **Charter/policy routing** | `support_steward` hardcoded everywhere | Mailbox config can specify a primary charter and secondary charters; envelope builder reads from `conversation_record.primary_charter` or a config-driven binding | P1 | **Blocking** for multi-tenant deployments; non-blocking for a single default charter |
| **Identity cleanup** | `thread_id` columns in `foreman_decisions`, `charter_outputs`, and outbound schemas; `thread_records` migration logic runs on every schema init | All tables and code paths use `conversation_id` consistently; `thread_records` is removed or fully deprecated with a one-time migration | P1 | **Non-blocking** for function, but creates tech debt and confusion |
| **Multi-mailbox dispatch** | Explicitly deferred with a TODO in `createMultiMailboxService` | `syncMultiple` exposes per-mailbox changed-conversation metadata, or the daemon runs individual `DefaultSyncRunner` instances per mailbox so dispatch can run inline | P1 | **Blocking** for multi-mailbox production use; non-blocking for single-mailbox pilots |
| **Outbound worker loop** | `SendReplyWorker` and `NonSendWorker` exist as classes but are not invoked by the daemon | The daemon starts an outbound worker loop (or a separate lightweight worker process) that polls `SqliteOutboundStore` and drives commands through Graph API | P1 | **Blocking** — without this, approved actions never mutate the mailbox |
| **Arbitration refinement** | Single-evaluation path only; no multi-charter arbitration in the daemon | If secondary charters are configured, the daemon can run them and the foreman can arbitrate prior to resolution | P2 | **Non-blocking** for a single-charter deployment |
| **Replay/crash/e2e harness** | 35 integration tests simulate crashes via direct DB manipulation; no live Graph e2e | At least one live-mailbox integration test runs full sync → charter → outbound → Graph state verification against a test tenant | P1 | **Non-blocking** for code correctness, but blocking for production confidence |
| **Documentation realignment** | AGENTS.md and docs describe the substrate well | Docs describe the full end-to-end daemon loop, runtime wiring, tool binding config, and operational runbook | P2 | **Non-blocking** |

---

## 3. Three-Phase Plan

### Phase A — Make It Real
*Convert the scaffold into a real working mailbox-agent path.*

#### Scope (included)
1. **Wire `CodexCharterRunner` into the daemon**.
   - Add config loading for charter runtime (API key, base URL, model, timeout).
   - Change daemon `initDispatchDeps()` to instantiate `CodexCharterRunner` when configured, falling back to `MockCharterRunner` only when explicitly in test/mock mode.
2. **Integrate tool catalog resolution**.
   - Import `resolveToolCatalog` from `packages/charters` into the daemon dispatch path.
   - Add a minimal `CoordinatorConfig` loader (or inline config) so the daemon can resolve tools per mailbox + charter.
   - Replace the hardcoded `available_tools: []` in `buildInvocationEnvelope`.
3. **Start an outbound worker loop in the daemon**.
   - After dispatch quiescence, start (or wake) a lightweight outbound worker that processes `pending`/`draft_creating` commands from `SqliteOutboundStore`.
   - Use existing `SendReplyWorker` and `NonSendWorker` with a real or mock Graph client.
4. **End-to-end smoke test**.
   - Add an integration test that uses a mock Graph adapter for sync + a real or stubbed OpenAI-compatible client for the charter + asserts that an outbound command is created and the outbound worker transitions it.

#### Scope (excluded)
- Multi-mailbox dispatch (deferred to Phase C).
- Identity/schema cleanup (deferred to Phase B).
- Secondary charter arbitration.
- Advanced observability or analytics.

#### Dependencies
- `CodexCharterRunner` must be importable from `packages/charters` without circular dependencies (already true).
- Tool resolver must not depend on `packages/charters` test-only code.

#### Success Criteria
- [ ] Daemon dispatch uses `CodexCharterRunner` by default when API credentials are configured.
- [ ] `buildInvocationEnvelope` returns a non-empty `available_tools` array when tools are bound in config.
- [ ] Outbound worker loop is started by the daemon and processes at least one command in an integration test.
- [ ] A single integration test demonstrates: sync → work item → charter execution with tools → outbound command → outbound worker transition.

#### Exit Condition
> A configured daemon can run one full end-to-end cycle from mailbox sync to charter reasoning to outbound side effect without manual intervention.

---

### Phase B — Make It Safe
*Close semantic, replay, crash, and arbitration ambiguity.*

#### Scope (included)
1. **Identity cleanup**.
   - Rename `thread_id` → `conversation_id` in `foreman_decisions`, `charter_outputs`, and outbound schema where semantically correct.
   - Remove the legacy `thread_records` migration from `initSchema()` and replace it with a one-time migration script or versioned schema upgrade.
   - Update all foreign-key constraints and index definitions.
2. **Crash/replay e2e harness**.
   - Add live-mailbox integration tests that assert:
     - Process restart mid-execution recovers the same work item.
     - Duplicate sync signals do not create duplicate work items or duplicate outbound commands.
     - Lease expiry causes stale-lease recovery and safe re-execution.
3. **Arbitration refinement**.
   - Implement multi-evaluation arbitration in the foreman when a work item has evaluations from both a primary and secondary charter.
   - Add tests for conflicting recommendations and tool-request merging.
4. **Tool call durability & governance**.
   - Ensure every tool invocation writes a `tool_call_records` row before execution and updates it on completion.
   - Enforce `side_effect_budget` (max tool calls, max write tool calls, total timeout) in the charter runner or daemon dispatch wrapper.

#### Scope (excluded)
- Multi-mailbox dispatch (still deferred).
- New charters beyond `support_steward` and `obligation_keeper`.
- UI, dashboards, or trace browsing.

#### Dependencies
- Phase A must be complete so the e2e harness has a real runtime path to crash-test.

#### Success Criteria
- [ ] Schema uses `conversation_id` consistently; no runtime code references `thread_id` for new v2 objects.
- [ ] At least one live-mailbox crash-recovery test passes.
- [ ] Tool budgets are enforced and tested.
- [ ] Secondary-charter arbitration tests pass.

#### Exit Condition
> The system can survive process restart, duplicate signals, and lease expiry without creating duplicate or orphaned mailbox mutations.

---

### Phase C — Make It General
*Lift the system from one-mailbox/v1 assumptions to a reusable Narada platform.*

#### Scope (included)
1. **Multi-mailbox dispatch**.
   - Refactor `syncMultiple` or the daemon multi-mailbox service to expose per-mailbox `changed_conversations`.
   - Run the full dispatch + outbound worker loop per mailbox in `createMultiMailboxService`.
2. **Charter/policy routing**.
   - Make `primary_charter` and `secondary_charters_json` configurable per mailbox in `exchange-fs-sync` config.
   - Update `buildInvocationEnvelope` to resolve the correct charter ID from config rather than hardcoding `support_steward`.
3. **Documentation realignment**.
   - Update `AGENTS.md` and architecture docs to reflect the complete daemon loop, runtime wiring, tool binding config, and operational runbook.
   - Document the config schema for charter runtime credentials and tool bindings.

#### Scope (excluded)
- Analytics or reporting pipelines.
- Real-time web UI for conversation inspection.
- Support for non-Exchange mailboxes.

#### Dependencies
- Phase B must be complete so multi-mailbox dispatch is built on a crash-safe foundation.

#### Success Criteria
- [ ] Multi-mailbox daemon runs dispatch and outbound worker loops for every mailbox in the config.
- [ ] A config file can specify different primary charters for different mailboxes.
- [ ] Docs describe how to configure and operate the full system.

#### Exit Condition
> Narada can be deployed as a single process that manages multiple mailboxes, each with its own charter runtime, tool bindings, and outbound worker, with no hidden in-memory authority.

---

## 4. Ordering Constraints

| Question | Answer |
|----------|--------|
| Can real runtime wiring happen before identity cleanup? | **Yes.** The daemon dispatch and `CodexCharterRunner` do not depend on renaming `thread_id` to `conversation_id` in legacy tables. |
| Can tool governance happen before routing cleanup? | **Yes.** Tool catalog resolution is independent of which charter is primary; the resolver takes `(mailboxId, charterId)` as arguments already. |
| Can multi-mailbox dispatch happen before the single-mailbox runtime is real? | **No.** It is wasteful to build multi-mailbox dispatch around a mock runtime. The single-mailbox real path must be proven first. |
| Can docs lag implementation during this phase? | **Yes, but only slightly.** Docs should be updated at the end of each phase so they do not drift more than one phase behind. |

### Sequential chains
1. **Phase A → Phase B**: You cannot meaningfully crash-test a mock runtime; the real path must exist first.
2. **Phase B → Phase C**: Multi-mailbox dispatch multiplies the crash surface; the single-mailbox path must be safe first.

### Parallelizable work within Phase A
- Outbound worker loop wiring can proceed independently of charter runtime wiring, as long as both land before the smoke test.
- Tool catalog resolution can proceed in parallel with charter runner wiring, since they only meet at the invocation envelope.

---

## 5. Critical Path

### Highest-leverage next artifacts
1. **`exchange-fs-sync-daemon` config extension for charter runtime** — unblocks real runner injection.
2. **Tool catalog integration into `buildInvocationEnvelope`** — unblocks useful agent behavior.

### Work that would create the most rework if done prematurely
- **Multi-mailbox dispatch**: Building this before the single-mailbox real path is stable would require refactoring the dispatch loop twice.
- **Advanced arbitration**: Adding multi-charter arbitration before the primary charter path is end-to-end would add complexity without a working baseline.

### Work that is safe to defer
- Documentation realignment (can lag by one phase).
- Analytics/observability beyond structured logging.
- Trace store UI or reasoning-log browsing.
- Policy override UI or human-approval web interface.

### Immediate next tasks (in order)
1. Add charter-runtime config schema to `exchange-fs-sync` and load it in the daemon.
2. Wire `CodexCharterRunner` into `initDispatchDeps()` with config-driven instantiation.
3. Integrate `resolveToolCatalog` into the dispatch path and pass `available_tools` into the envelope.
4. Add an outbound worker polling loop to the daemon that drives `SendReplyWorker` and `NonSendWorker`.
5. Write one integration test that exercises the full real path (mock sync + real/stubbed charter + outbound worker).

---

## 6. Terminal Readiness Statement

> Narada reaches the terminal mailbox-agent objective when a single daemon process can continuously sync one or more mailboxes, open durable work items for changed conversations, invoke a bounded Codex-based charter runtime with governed tools and mailbox-specific policy, materialize approved side effects only through the outbound worker, survive crashes and duplicate signals without duplicate mutations, and operate with no hidden in-memory authority.
