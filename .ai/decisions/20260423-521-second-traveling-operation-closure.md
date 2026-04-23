# Decision 521 — Second Traveling Operation Closure

> **Status:** Closed  
> **Governed by:** task_close:a2  
> **Closes Chapter:** Second Traveling Operation Selection and Proof (Tasks 518, 519, 520, 521)

---

## Summary

The Second Traveling Operation Chapter is closed. Narada has explicitly selected, bounded, and planned the proof for a second real operation family (Timer → Process) that is semantically distant from the existing mailbox operation. The selection was governed by five Narada-native criteria. The boundary contract shows that the Timer → Process operation travels through the existing kernel without any code modifications. The proof plan distinguishes fixture-backed mechanical correctness from live-backed charter quality and operator review. What remains unproven is documented with bounded blockers.

---

## What This Chapter Accomplished

| Task | What Was Delivered |
|------|-------------------|
| **518** | Second operation selection contract: 3 candidates evaluated against 5 criteria (travel value, substrate fit, safety, effect boundary clarity, proofability). Timer → Process selected. |
| **519** | Boundary contract for Timer → Process: 7 pipeline boundaries explicit (Fact, Work, Evaluation, Decision, Intent, Execution, Confirmation), 10 forbidden shortcuts, 10 v0 non-goals, 15 reused kernel components, 2 new components. |
| **520** | Traveling proof plan and fixture contract: 10 fixture-backed pipeline stages mapped to tests, 13 capabilities with fixture/live classification, 3 operator gates, 6 safety limits, 5 inspection checkpoints, 5 bounded blockers. |

---

## What Is Now Explicit

### 1. Second Operation Family (Decision 518)

**Timer → Process** is the selected second operation family.

| Criterion | Timer → Process Score | Why |
|-----------|----------------------|-----|
| Travel value | Excellent | Self-triggered (scheduled) vs. external-reactive (mailbox) — largest semantic distance |
| Substrate fit | Excellent | Runs identically on local daemon, Cloudflare, and any future substrate |
| Safety | Excellent | Local `process.run` with bounded commands, `require_human_approval: true` default |
| Effect boundary clarity | Excellent | Single intent type (`process.run`), single executor family (`process`), exit-code confirmation |
| Proofability | Excellent | Full fixture-backed proof without external credentials or non-deterministic APIs |

**Selected operation:** "Scheduled Site Health Check and Maintenance Reporting"  
**Scope ID:** `health-check-maintenance`  
**Charter:** `maintenance_steward`  
**Context Strategy:** `timer`

### 2. Boundary Contract (Decision 519)

All seven pipeline stages are explicit:

| Stage | Boundary | Durable Record | Authority |
|-------|----------|----------------|-----------|
| Fact | `timer.tick` | `facts` row | Source → FactStore (append-only) |
| Work | `timer:{schedule_id}` context | `work_items` + `work_item_leases` | Foreman (open), Scheduler (lease) |
| Evaluation | `TimerContextMaterializer` output | `evaluations` | Charter runtime (read-only sandbox) |
| Decision | `process_run` / `no_action` governance | `foreman_decisions` | Foreman resolution |
| Intent | `process.run` intent | `intents` | IntentHandoff (creation), ProcessExecutor (execution) |
| Execution | Subprocess spawn | `process_executions` | ProcessExecutor only |
| Confirmation | Exit-code derivation | `process_executions.confirmation_status` | ProcessConfirmationResolver |

**Zero kernel modifications required.** The operation travels through existing components:
- `TimerSource`, `TimerContextStrategy`, `TimerContextMaterializer` — already exist
- `DefaultForemanFacade`, `SqliteScheduler` — vertical-agnostic, no changes
- `ProcessExecutor`, `ProcessExecutionStore`, `ProcessConfirmationResolver` — already exist
- `INTENT_FAMILIES["process.run"]` — already registered with schema and validation

### 3. Proof Plan (Decision 520)

**Fixture-backed proof** covers 10 pipeline stages via existing tests:
- `timer-to-process.test.ts` (4 tests)
- `vertical-parity.test.ts` (4 tests)
- `process-executor.test.ts` (11 tests)
- `confirmation.test.ts` (13 tests)
- `timer-source.test.ts` (8 tests)

**Live-backed boundary** is narrow — concentrated in 3 areas:
1. Charter output quality (LLM evaluation)
2. Real diagnostic command behavior
3. Operator review loop for `process_run` approval

**Safety limits:**
- Process timeout: 300s
- Output capture: 64 KB each
- Allowed actions: `["process_run", "no_action"]`
- Lease duration: 300s
- Approval gate: `require_human_approval: true` (default)
- Recovery: stale leases reset intent to `admitted`

---

## What Remains Deferred

### Deferred Operation Families

| Family | Why Deferred | When to Revisit |
|--------|-------------|-----------------|
| **Filesystem → Process** | Fair substrate fit (no persistent FS on Cloudflare) | After timer live proof; good for local-only operations |
| **Webhook → Process** | Requires HTTP server infrastructure; broader but more complex | After timer live proof; good for reactive push models |
| **Timer → Mail** | Would require outbound email send; mixes families | Not a distinct source family; use multi-vertical operations instead |

### Deferred Capabilities

| # | Deferred Capability | Current State | Blocker |
|---|--------------------|---------------|---------|
| 1 | **Real charter evaluation** (`maintenance_steward`) | Mock/hardcoded evaluation in fixture proof | Charter prompt authoring (~50 lines) |
| 2 | **Live subprocess execution** with real diagnostics | Fixture uses `/bin/echo` | Private ops repo with real config |
| 3 | **Operator review loop** for process intents | Simulated approval gate in tests | CLI `show`/`console` support for process decisions |
| 4 | **Multi-schedule operations** | Single timer source per operation | Config schema extension |
| 5 | **Unattended execution** | Attended with operator approval | Unattended layer design (Task 391+) |
| 6 | **Process output as facts** | stdout stored in `result_json` only | Feedback loop design not yet specified |
| 7 | **Timer config in `init-repo`** | No CLI template for timer source | CLI scaffolding task |

---

## Invariants Preserved

1. **Kernel is vertical-agnostic.** No code changes were required to any Source, Fact, Context, Foreman, Scheduler, Intent, Executor, or Observation boundary.
2. **Default posture is safe.** `require_human_approval: true` for all `process_run` intents.
3. **Effect boundary is local.** Process execution spawns local subprocesses only. No external mutation.
4. **Confirmation is deterministic.** Exit code 0 → confirmed; non-zero → confirmation_failed.
5. **Facts are append-only.** Timer ticks are never edited after ingestion.

---

## Verification Evidence

- `pnpm typecheck`: all 11 packages pass ✅
- `timer-to-process.test.ts`: 4/4 pass ✅
- `vertical-parity.test.ts`: 4/4 pass ✅
- `process-executor.test.ts`: 11/11 pass ✅
- `confirmation.test.ts`: 13/13 pass ✅
- `timer-source.test.ts`: 8/8 pass ✅
- `filesystem-vertical.test.ts`: 5/5 pass ✅ (peer verification)
- `webhook-vertical.test.ts`: 2/2 pass ✅ (peer verification)
- **Total chapter-relevant tests: 47/47 pass**

---

## Closure Statement

The Second Traveling Operation Chapter closes with Narada having an explicit, bounded, and planned second operation family. The Timer → Process operation proves that Narada's governed zone/crossing topology is portable beyond mailbox: the same kernel pipeline (Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation) handles a fundamentally different trigger model (self-generated scheduled ticks vs. external-reactive message polling) without modification. The fixture-backed proof is complete. The live-backed boundary is narrow and well-defined. What remains is bounded content work (charter prompt, CLI templates) and supervised live exercise, not architectural redesign.

---

## Next Executable Proof Line

The next executable proof is the **live-backed Timer → Process proof**. This requires:

1. **Author `maintenance_steward` charter prompt** (~50 lines; reuse `support_steward` structure)
2. **Add timer source template to `init-repo`** (config schema extension)
3. **Verify CLI `show`/`console` handles `process.run` intents** (bounded test + fix if needed)
4. **Run supervised live proof** in a private ops repo with real charter runtime

This line is operator-gated and can proceed independently of the email-marketing live-proof line (Tasks 399–405).

---

**Closed by:** a2  
**Closed at:** 2026-04-23
