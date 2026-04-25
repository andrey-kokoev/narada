# Assignment — Agent E — Replay and Recovery Tests

## Role

You are the state-machine and resilience test engineer.

Your job is to define the mandatory replay, recovery, and crash-semantics test matrix for the new Narada control plane so that implementation teams cannot hand-wave correctness under re-entry.

## Scope

Primary target:
- `.ai/do-not-open/tasks/20260414-009-assignment-agent-e-replay-and-recovery-tests.md`

Read first:
- `.ai/do-not-open/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`
- `.ai/do-not-open/tasks/20260414-003-identity-lattice-and-canonical-keys.md`
- `.ai/do-not-open/tasks/20260414-004-coordinator-durable-state-v2.md`

Then consume outputs from:
- Agent A — Scheduler and Leases
- Agent B — Charter Invocation v2
- Agent D — Outbound Handoff v2
- Agent F — Daemon-Foreman Dispatch

Also inspect existing repo test patterns under `test/` and `.ai/do-not-open/tasks/20260410-*`.

## Mission

Produce the normative correctness test matrix for replay, retry, supersession, and crash safety.

## Core Invariants

1. Re-entry over durable state must be correct.
2. Duplicate external stimuli must not imply duplicate side effects.
3. Supersession must not leave ambiguous runnable truth.
4. Stale execution attempts must not retain authority.
5. Tests must distinguish commentary from correctness state.

---

## Test Matrix

### Task 1 — Work Item Replay

| # | Scenario | Preconditions | Action | Expected Durable End State | Critical Assertions |
|---|----------|---------------|--------|---------------------------|---------------------|
| W1 | Same work item replayed | `work_item.status = 'resolved'`, `outbound_command` exists | Scheduler wakes and scans runnable set | Work item remains `resolved`; no new lease acquired; no duplicate command | `SELECT count(*) FROM work_item_leases WHERE work_item_id = ?` = 0; `work_item.status` unchanged |
| W2 | Replay after partial execution | `execution_attempt.status = 'active'`, lease record exists but runner died 30s ago (lease expired) | Recovery scanner runs, then scheduler re-evaluates | Lease marked `abandoned`; attempt marked `abandoned`; `work_item.status = 'failed_retryable'`; `retry_count = 1` | Lease `release_reason = 'abandoned'`; no `foreman_decision` row for this work item |
| W3 | Replay after process restart | Process crashed during execution of `wi_123`; SQLite DB intact | New process starts, recovery scanner runs, scheduler resumes | Stale lease released; work item either `failed_retryable` or `opened` (depending on retry policy) | Only one non-stale lease exists; `work_item.status` is deterministic from DB alone |
| W4 | Replay after stale lease expiry | Lease `expires_at` is 5 minutes in the past; no heartbeat | Recovery scanner detects stale lease | Lease `released_at` set; `work_item.status` transitions from `leased`/`executing` to `failed_retryable` | No active execution attempts for this work item remain |

### Task 2 — Revision Supersession

| # | Scenario | Preconditions | Action | Expected Durable End State | Critical Assertions |
|---|----------|---------------|--------|---------------------------|---------------------|
| R1 | New revision before work lease | `conversation_rev = 3`, `wi_A` opened for rev 3; compiler observes rev 4 | Scheduler selects `wi_A`, foreman checks latest revision | `wi_A` is still valid (rev 4 does not automatically supersede unless new work item created); OR foreman creates `wi_B` and marks `wi_A` superseded before lease | Exactly one non-superseded work item per conversation is runnable |
| R2 | New revision during execution | `wi_A` is `executing`; compiler observes rev 5 | Foreman tries to commit decision at end of execution | Transaction checks latest non-terminal work item; if `wi_B` now exists for rev 5, commit aborts, `wi_A` marked `superseded` | No `foreman_decision` or `outbound_command` created for superseded `wi_A` |
| R3 | New revision after accepted evaluation but before command creation | Evaluation succeeded, foreman has `foreman_decision` row in memory but not yet committed | Foreman attempts to write decision + command in transaction | Transaction sees new revision → new work item exists → rolls back; `wi_A` superseded; `wi_B` opened | `foreman_decisions` row count for `wi_A` = 0 |
| R4 | No-op supersession | `wi_A` opened; new revision observed but foreman determines no action needed | Foreman creates `wi_B` with immediate `resolved` (no-op) and marks `wi_A` superseded | `wi_A.status = 'superseded'`; `wi_B.status = 'resolved'`; no outbound command for either | No lease ever acquired for `wi_A` or `wi_B` |

### Task 3 — Outbound Idempotency

| # | Scenario | Preconditions | Action | Expected Durable End State | Critical Assertions |
|---|----------|---------------|--------|---------------------------|---------------------|
| O1 | Duplicate command creation attempts | `wi_A` resolved, `outbound_command` `ob_001` already committed | Scheduler or foreman retries command creation for same work item | Second attempt detects existing `outbound_command` (by `work_item_id` or `decision_id` uniqueness) and aborts silently | Exactly one `outbound_command` row for `wi_A`; no duplicate versions |
| O2 | Repeated evaluation producing same proposed action | `wi_A` crashed, retried as `wi_A'`; charter produces identical payload | Foreman resolves `wi_A'` | New `foreman_decision` row may be created, but if it points to same effective command, `outbound_command` is not duplicated (either updated or superseded) | `outbound_commands` count for conversation does not increase unnecessarily |
| O3 | Command exists but scheduler state missing | `outbound_command` committed, but `work_item` row was lost (simulated) | Scheduler/compiler state reconstruction | System must still reconcile inbound to confirm the command. The missing work item does not block outbound worker. | Outbound worker continues independently; no orphan command panic |
| O4 | Scheduler thinks work unresolved but outbound command already exists | `work_item.status = 'executing'` due to crash, but foreman had already committed decision + command before crash | Recovery scanner resumes | Command remains valid; work item may be marked `resolved` if foreman can reconcile, or `failed_retryable` and then rediscovered as already satisfied | No duplicate command created on retry |

### Task 4 — Tool/Runtime Failure

| # | Scenario | Preconditions | Action | Expected Durable End State | Critical Assertions |
|---|----------|---------------|--------|---------------------------|---------------------|
| T1 | Charter timeout | `execution_attempt` active for 10 minutes; charter lease heartbeat stopped | Runner/scheduler detects timeout | Attempt marked `crashed` or `abandoned`; lease released; `work_item.status = 'failed_retryable'` | No `foreman_decision` created; no outbound command |
| T2 | Tool denial | Charter requests forbidden tool `bad_tool` | Foreman validation rejects | `tool_call_record` (if any) shows `permission_denied`; charter receives error result; execution may continue or fail depending on resilience | Execution does not crash solely due to tool denial |
| T3 | Tool timeout | Charter requests `sentry_query` with `timeout_ms = 1000`; runner hangs for 5s | Tool runner kills process after 1s | `tool_call_record.exit_status = 'timeout'`; execution continues with partial/empty result; no work item failure | Runner exit code / kill signal recorded |
| T4 | Missing binding | Knowledge source `playbook_x` bound in config but file deleted | Foreman constructs envelope | Unreachable source omitted from envelope; execution proceeds; no crash | Warning logged, but `work_item` does not fail |
| T5 | Transient runtime crash | Charter runtime throws uncaught exception mid-evaluation | Execution wrapper catches error | `execution_attempt.status = 'crashed'`; `work_item.status = 'failed_retryable'`; trace may be partial | No `foreman_decision` or outbound command committed |

### Task 5 — Commentary Separation

| # | Scenario | Preconditions | Action | Expected Durable End State | Critical Assertions |
|---|----------|---------------|--------|---------------------------|---------------------|
| C1 | Traces deleted before work resolution | `wi_A` is `executing`; all traces for this execution are deleted | Execution succeeds, foreman commits decision | Decision and command committed normally; system does not need traces to resolve | `work_item.status = 'resolved'`; traces may be missing |
| C2 | Traces deleted before outbound dedupe | `ob_001` confirmed; all traces referencing it are pruned | Scheduler scans for work items needing confirmation | Confirmation proceeds from `outbound_commands` + inbound compiler state; no trace query needed | `outbound_command.status` transitions to `confirmed` |
| C3 | Traces deleted before mailbox truth reconstruction | Compiler rebuilds views from `messages/` and `apply-log/` | All traces deleted | Views rebuild correctly; thread state reconstructs from `thread_records` and `charter_outputs` | No dependency on trace store for correctness |
| C4 | No trace store exists | System initialized without trace store enabled | Full sync + work item execution cycle | All scheduler, foreman, and outbound decisions are correct without any trace writes | `work_item` and `outbound_command` state sufficient for all operations |

### Task 6 — Daemon/Wake Duplication

| # | Scenario | Preconditions | Action | Expected Durable End State | Critical Assertions |
|---|----------|---------------|--------|---------------------------|---------------------|
| D1 | Duplicate wake signals | `wi_A` is `opened`; two webhook notifications arrive 100ms apart | Scheduler processes both wakes | First wake leases `wi_A`; second wake finds no runnable work items and returns to sleep | Exactly one lease for `wi_A`; exactly one execution attempt |
| D2 | Wake during active execution | `wi_A` is `executing`; inbound sync finishes and triggers wake | Scheduler scans runnable set | `wi_A` is filtered out (already active); scheduler may pick `wi_B` if available | No interruption of `wi_A`'s execution attempt |
| D3 | Wake after crash recovery | Process crashed; new process starts and receives webhook wake before recovery scanner finishes | Scheduler must run recovery scanner before or atomically with selection | No lease attempted on stale `wi_A` until scanner has released it | Lease acquisition only happens after `expires_at > now()` OR scanner release |
| D4 | Quiescent loop with no runnable work | All work items are terminal or retry timers are in the future | Scheduler polls / wakes repeatedly | No leases acquired; no execution attempts started; CPU remains low | `SELECT count(*) FROM work_item_leases WHERE released_at IS NULL` = 0 after each cycle |

---

## Minimal Harness Guidance

### SQLite-Only Harness
Most tests can be implemented with:
1. An in-memory or temp-file SQLite database
2. The coordinator store (`SqliteCoordinatorStore`)
3. The outbound store (`SqliteOutboundStore`)
4. A mock foreman that implements the decision/commit logic
5. A mock scheduler that runs selection + lease acquisition

### Crash Simulation
Do not use actual process kills for most tests. Instead:
- **Transaction rollback**: Simulate crash by rolling back the transaction before commit.
- **Lease expiry**: Manually set `expires_at` in the past and run the recovery scanner.
- **State truncation**: Delete in-memory state and rehydrate from SQLite to prove re-entry correctness.

### Temporal Control
- Use injected clocks (`Date` providers) rather than real time for lease expiry and backoff tests.
- This avoids flaky timeouts and allows deterministic stale-lease tests.

### Isolation
- Each test should use a fresh SQLite database or a rolled-back transaction.
- Do not share scheduler runner instances across tests.

---

## Critical Assertions List

These assertions must appear in the corresponding tests:

1. **Lease uniqueness**: `count(active_leases for work_item_id) <= 1`
2. **Active execution bounded by lease**: `work_item.status IN ('leased', 'executing')` implies `exists(valid_unreleased_lease)`
3. **No decision without work item**: `foreman_decisions.work_item_id` references an existing `work_item`
4. **No duplicate commands**: `count(outbound_commands for same decision_id) = 1`
5. **Superseded is terminal**: `work_item.status = 'superseded'` implies no future status change
6. **Stale lease recovery**: `expires_at <= now()` AND `released_at IS NULL` must be recovered within one scheduler cycle
7. **Trace independence**: Deleting all traces does not change `work_item.status` or `outbound_command.status`
8. **Duplicate wake idempotency**: Multiple wakes with no state change between them produce identical end state
9. **Tool call durability**: Every executed tool call has a `tool_call_record` row (not just a trace)
10. **Backoff enforcement**: `failed_retryable` work item is not selected as runnable until `next_retry_at <= now()`

---

## Gap Report

### Gaps Dependent on Implementation Details

| Gap | Why It Is a Gap | What Must Be Resolved Before Implementation |
|-----|-----------------|---------------------------------------------|
| G1 | `work_item` table schema not yet created | Agent D (Outbound Handoff) and Agent F (Daemon-Foreman Dispatch) must finalize the SQLite schema for `work_items`, `execution_attempts`, and `work_item_leases` |
| G2 | Foreman transaction boundary is not specified in code | The exact list of tables written in a single SQLite transaction during foreman resolution must be documented in Agent B or Agent F |
| G3 | Retry policy defaults (max retries, backoff base) are not yet in config schema | Agent A specified retry semantics, but the config loader/schema must be updated to accept them |
| G4 | Recovery scanner frequency and threading model undefined | Agent F must specify whether the recovery scanner runs inline with scheduler selection or on a separate timer |
| G5 | Tool runner process model undefined | Agent C specified tool runner behavior, but whether it is in-process library call or out-of-process worker affects crash-test harness design |
| G6 | `conversation_revision` ordinal counter storage not defined | Agent D or Agent F must specify whether revision ordinals are stored in SQLite or derived from filesystem state at runtime |

### Gaps That Are NOT Blockers

- Analytics/observability query patterns: out of scope for correctness tests.
- UI behavior for approval-gated tools: not a state-machine correctness concern.
- Log message exact text: only the durable state matters.

---

## Deliverables Checklist

- [x] Test matrix with scenario / preconditions / expected durable end state
- [x] Minimal harness guidance
- [x] Critical assertions list
- [x] Gap report for what still depends on implementation details

## Parallel To

May run in parallel with:
- Agent A — Scheduler and Leases
- Agent B — Charter Invocation v2
- Agent C — Tool Binding Runtime
- Agent D — Outbound Handoff v2
- Agent F — Daemon-Foreman Dispatch

## Constraints

Do not:
- implement tests
- redesign architecture
- create speculative chaos-engineering framework
- validate UI behavior
