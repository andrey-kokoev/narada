# Decision: Second Operation Selection Contract

**Date:** 2026-04-23
**Task:** 518
**Depends on:** 394 (Email Marketing Operation Closure)
**Chapter:** Second Traveling Operation Selection and Proof (518–521)
**Verdict:** **Timer → Process selected as the second operation family.**

---

## 1. Problem Statement

Narada has one proven operation family: mailbox/email (`support_steward` via Graph API). To prove that the governed zone/crossing topology is portable — that the kernel pipeline (Source → Fact → Context → Work → Policy → Intent → Execution → Confirmation) is vertical-agnostic — Narada needs a second real operation family with a fundamentally different source, trigger model, and effect boundary.

This decision selects that second family by explicit criteria, not by convenience or whim.

---

## 2. Candidate Operation Families

Three candidate families were evaluated. All three have existing Source implementations, ContextFormationStrategy implementations, and integration tests in the control plane:

| Candidate | Source | Context Strategy | Executor | Integration Tests |
|-----------|--------|-----------------|----------|-------------------|
| **A. Timer → Process** | `TimerSource` | `TimerContextStrategy` | `ProcessExecutor` | `timer-to-process.test.ts`, `vertical-parity.test.ts` |
| **B. Filesystem → Process** | `FilesystemSource` | `FilesystemContextStrategy` | `ProcessExecutor` | `filesystem-vertical.test.ts` |
| **C. Webhook → Process** | `WebhookSource` | `WebhookContextStrategy` | `ProcessExecutor` | `webhook-vertical.test.ts` |

*Note: The campaign-request vertical (Task 390+) was excluded because it is a mail-derived context strategy, not a distinct source family. Proving portability requires a different Source implementation, not just a different strategy on the same source.*

---

## 3. Selection Criteria

Five Narada-native criteria govern the selection:

| Criterion | Definition | Weight |
|-----------|-----------|--------|
| **Travel value** | Does this family prove the kernel topology travels to a fundamentally different vertical? | High |
| **Substrate fit** | Can it run on all substrates (local daemon, Cloudflare Worker, Windows, macOS) without substrate-specific redesign? | High |
| **Safety** | Is the effect boundary local, bounded, and reversible? Can it run in `draft-only` or safe-default posture? | High |
| **Effect boundary clarity** | Is the durable intent type explicit, with a single executor family and clear confirmation semantics? | Medium |
| **Proofability** | Can the full pipeline be proven with fixtures, without requiring external credentials or non-deterministic APIs? | Medium |

---

## 4. Candidate Evaluation

### 4.1 Timer → Process

| Criterion | Score | Evidence |
|-----------|-------|----------|
| Travel value | **Excellent** | Self-triggered (scheduled) vs. external-reactive (mailbox). Timer generates its own facts deterministically; mailbox polls external state. This is the largest semantic distance from mailbox. |
| Substrate fit | **Excellent** | `TimerSource` uses only `Date.now()` and deterministic math. Runs identically on local daemon, Cloudflare Cron Triggers, and any future substrate. No filesystem or network required. |
| Safety | **Excellent** | `process.run` executor spawns local subprocesses with explicit command/args. No external mutation. Can be bounded by `allowed_actions: ["process_run", "no_action"]` and timeout limits. |
| Effect boundary clarity | **Excellent** | Single intent type (`process.run`), single executor family (`process`). Confirmation is exit-code observation. No two-stage handoff (draft → send) required. |
| Proofability | **Excellent** | Full fixture-backed proof exists: `TimerSource.pull()` → `sourceRecordToFact()` → `FactStore.ingest()` → `TimerContextStrategy.formContexts()` → `Foreman.onFactsAdmitted()` → `Scheduler` → `ProcessExecutor.processNext()`. No external credentials needed. |

### 4.2 Filesystem → Process

| Criterion | Score | Evidence |
|-----------|-------|----------|
| Travel value | **Good** | File change events are external-reactive, like mailbox, but via a different source. Less semantic distance than timer. |
| Substrate fit | **Fair** | Filesystem watching requires a persistent, mutable filesystem. Cloudflare Workers have no persistent local filesystem. Would require a redesign (e.g., R2 event notifications) for that substrate. |
| Safety | **Good** | Same `process.run` boundary as timer. File paths could be manipulated if source is untrusted, but this is mitigated by queue boundary. |
| Effect boundary clarity | **Good** | Same `process.run` boundary as timer. |
| Proofability | **Good** | `InMemoryFilesystemEventQueue` enables fixture proofs, but the file-backed queue (`FileWebhookEventQueue` pattern adapted) is less mature than timer's checkpoint model. |

### 4.3 Webhook → Process

| Criterion | Score | Evidence |
|-----------|-------|----------|
| Travel value | **Good** | HTTP push model is distinct from mailbox's pull model. Proves Narada can receive external events. |
| Substrate fit | **Good** | Webhook reception requires an HTTP server. Local daemon can bind a port; Cloudflare requires a Worker route. Both work, but the surface differs by substrate. |
| Safety | **Good** | Same `process.run` boundary. Webhook body parsing is an injection surface, but payload is treated as opaque fact data until charter evaluation. |
| Effect boundary clarity | **Good** | Same `process.run` boundary. |
| Proofability | **Good** | `InMemoryWebhookEventQueue` enables fixtures, but end-to-end proof requires HTTP server setup, adding complexity. |

---

## 5. Selection

**Timer → Process is selected.**

### 5.1 Aggregate Score

| Candidate | Travel | Substrate | Safety | Boundary | Proofability | Overall |
|-----------|--------|-----------|--------|----------|--------------|---------|
| Timer → Process | Excellent | Excellent | Excellent | Excellent | Excellent | **Best** |
| Filesystem → Process | Good | Fair | Good | Good | Good | Second |
| Webhook → Process | Good | Good | Good | Good | Good | Third |

### 5.2 Key Differentiator

The decisive factor is **substrate fit combined with travel value**:

- **Timer** is the only candidate that runs identically on *all* substrates without any adaptation. This matters because Narada's portability claim is not just about code reuse — it is about the *same operation configuration* producing the *same deterministic behavior* regardless of where it runs.
- **Timer** is also the most semantically distant from mailbox: self-triggered vs. external-reactive, deterministic vs. polling-dependent, credential-free vs. auth-bound.

### 5.3 Selected Operation Shape

The specific operation selected is **"Scheduled Site Health Check and Maintenance Reporting"**:

```json
{
  "scope_id": "health-check-maintenance",
  "root_dir": "./data/health-check-maintenance",
  "sources": [
    {
      "type": "timer",
      "source_id": "timer:hourly-health",
      "schedule_id": "hourly_health_check",
      "interval_ms": 3600000
    }
  ],
  "context_strategy": "timer",
  "charter": { "runtime": "codex-api" },
  "policy": {
    "primary_charter": "maintenance_steward",
    "allowed_actions": ["process_run", "no_action"],
    "require_human_approval": true
  }
}
```

**Charter profile:** `maintenance_steward`
- **Role:** Site health monitor and maintenance reporter
- **Boundaries:** Only `process_run` pre-approved safe scripts (e.g., `narada doctor`, `narada status --json`). No arbitrary command execution.
- **Posture:** `draft-only` with `require_human_approval: true` for all `process_run` intents.
- **Output:** Proposes a `process_run` intent with a bounded diagnostic command, or `no_action` if health is nominal.

---

## 6. What This Selection Does Not Claim

- **Not claiming timer is the only valid second operation.** Filesystem and webhook are valid peers and should be proven in subsequent chapters.
- **Not claiming autonomous process execution is safe.** Default posture is `draft-only` with human approval required, matching the mailbox proof.
- **Not claiming multi-vertical operations are proven.** This is a single-vertical operation (timer source only), just as the first operation is single-vertical (mailbox source only).
- **Not claiming production unattended operation.** The unattended layer (§1 of `docs/product/unattended-operation-layer.md`) is a future target. This proof uses attended operation with operator review.

---

## 7. Verification Evidence

### 7.1 Existing Fixture Coverage

The following tests already prove the full pipeline for Timer → Process:

| Test | Pipeline Stage | File |
|------|---------------|------|
| `both ExchangeSource and TimerSource implement the same Source interface` | Source contract parity | `test/integration/control-plane/vertical-parity.test.ts` |
| `both mailbox and timer facts ingest into the same FactStore` | Fact ingestion | `test/integration/control-plane/vertical-parity.test.ts` |
| `both verticals travel through the same foreman → scheduler → execution path` | Foreman resolution | `test/integration/control-plane/vertical-parity.test.ts` |
| `end-to-end: timer tick generates a fact` | Source → Fact | `test/integration/control-plane/timer-to-process.test.ts` |
| `end-to-end: foreman resolves process_run into a process intent` | Policy → Intent | `test/integration/control-plane/timer-to-process.test.ts` |
| `end-to-end: process executor runs timer-driven intent durably` | Intent → Execution | `test/integration/control-plane/timer-to-process.test.ts` |
| `replay safety: duplicate intent does not re-execute` | Idempotency | `test/integration/control-plane/timer-to-process.test.ts` |

### 7.2 Bounded Blockers for Live Proof

To move from fixture-backed proof to live-backed proof, the following are required:

| Blocker | Bound | Mitigation |
|---------|-------|------------|
| `maintenance_steward` charter does not exist | Charter prompt must be authored | Bounded to ~50 lines; can reuse `support_steward` structure |
| No CLI command to configure timer source in `init-repo` | Add timer source template to `want-timer` or generalize `want-operation` | Bounded to config schema extension |
| Live process execution requires operator trust | `require_human_approval: true` is the safe default | Already the default posture |

None of these blockers are architectural. All are bounded content or configuration tasks.

---

## 8. Relation to Task 519

Task 519 (Selected Operation Boundary Contract) will define:
- The exact fact types (`timer.tick`)
- The context formation rules (`TimerContextStrategy`)
- The intent schema (`process.run` payload)
- The forbidden shortcuts (no direct process spawn outside `ProcessExecutor`)

This decision (518) provides the selection. Task 519 provides the boundary contract.

---

## Related Documents

- [`docs/product/first-operation-proof.md`](../../docs/product/first-operation-proof.md) — Canonical mailbox operation proof
- [`docs/product/unattended-operation-layer.md`](../../docs/product/unattended-operation-layer.md.md) — Future unattended target
- [`packages/layers/control-plane/src/sources/timer-source.ts`](../../packages/layers/control-plane/src/sources/timer-source.ts) — TimerSource implementation
- [`packages/layers/control-plane/src/foreman/context.ts`](../../packages/layers/control-plane/src/foreman/context.ts) — TimerContextStrategy
- [`packages/layers/control-plane/src/executors/process-executor.ts`](../../packages/layers/control-plane/src/executors/process-executor.ts) — ProcessExecutor
- [`packages/layers/control-plane/test/integration/control-plane/timer-to-process.test.ts`](../../packages/layers/control-plane/test/integration/control-plane/timer-to-process.test.ts) — Fixture proof
- [`packages/layers/control-plane/test/integration/control-plane/vertical-parity.test.ts`](../../packages/layers/control-plane/test/integration/control-plane/vertical-parity.test.ts) — Vertical parity proof
