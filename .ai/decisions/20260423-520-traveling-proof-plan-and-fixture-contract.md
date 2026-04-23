# Decision: Traveling Proof Plan and Fixture Contract

**Date:** 2026-04-23
**Task:** 520
**Depends on:** 519 (Selected Operation Boundary Contract)
**Chapter:** Second Traveling Operation Selection and Proof (518–521)
**Verdict:** **Bounded proof plan defined. Fixture-backed proof covers pipeline correctness. Live proof boundary is operator-gated charter evaluation and process execution review.**

---

## 1. Operation Under Proof

**Name:** Scheduled Site Health Check and Maintenance Reporting  
**Family:** Timer → Process  
**Scope ID:** `health-check-maintenance`  
**Charter:** `maintenance_steward`  
**Context Strategy:** `timer`  
**Posture:** `draft-only` (safe default) — all `process_run` intents require operator approval

### Canonical Proof Case

**Fixture:** Timer tick at `2024-01-15T12:00:00.000Z` for schedule `hourly_health_check`  
**Expected behavior:** Charter evaluates the tick context and proposes a `process_run` intent with a bounded diagnostic command (e.g., `narada doctor --json`), or `no_action` if health is nominal.

### Operation Shape

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

### Charter Profile

The `maintenance_steward` charter is a dedicated system prompt:

- **Role:** Site health monitor and maintenance reporter
- **Tone:** Concise, factual, diagnostic-focused
- **Boundaries:** Only proposes pre-approved safe diagnostic commands. Never proposes arbitrary command execution. Escalates on anomaly.
- **Process instructions:** If health is nominal → `no_action`. If diagnostics needed → propose `process_run` with one of: `narada doctor`, `narada status --json`, or other bounded commands from the allowed list.
- **Knowledge sources:** Uses operational playbooks from `<rootDir>/knowledge/` when relevant

---

## 2. Fixture-Backed Proof

The fixture-backed proof runs entirely without live credentials or external APIs. It uses deterministic timer ticks and mock charter evaluation to prove the full pipeline.

### What It Proves

| Pipeline Stage | Proven By |
|----------------|-----------|
| Source → Fact (timer tick) | `timer-to-process.test.ts` — deterministic slot identity, fact ingestion |
| Fact → Context Formation → Work Item | `timer-to-process.test.ts` — `TimerContextStrategy` groups by `schedule_id` |
| Scheduler Lease → Execution Attempt | `vertical-parity.test.ts` — timer work items travel through same scheduler path |
| Charter Evaluation (mock) | `timer-to-process.test.ts` — hardcoded evaluation envelope consumed by foreman |
| Foreman Decision → Intent Creation | `timer-to-process.test.ts` — `resolveWorkItem()` creates `process.run` intent |
| Process Executor → Subprocess Run | `timer-to-process.test.ts` — `processNext()` spawns, captures output, persists result |
| Idempotency & Replay Safety | `timer-to-process.test.ts` — duplicate resolution does not re-execute |
| Confirmation (exit-code derived) | `confirmation.test.ts` — `ProcessConfirmationResolver` derives status from execution record |
| Process Executor Recovery | `process-executor.test.ts` — stale lease recovery, error handling |
| Timer Source Determinism | `timer-source.test.ts` — slot identity, checkpoint behavior, duplicate suppression |

### How to Run

```bash
# Full fixture-backed timer → process proof
pnpm test:control-plane -- test/integration/control-plane/timer-to-process.test.ts

# Vertical parity proof (timer shares kernel with mailbox)
pnpm test:control-plane -- test/integration/control-plane/vertical-parity.test.ts

# Process executor unit proof (spawn, recovery, error handling)
pnpm test:control-plane -- test/unit/executors/process-executor.test.ts

# Confirmation resolver proof
pnpm test:control-plane -- test/unit/executors/confirmation.test.ts

# Timer source unit proof (determinism, checkpoint, edge cases)
pnpm test:control-plane -- test/unit/sources/timer-source.test.ts
```

### Expected Outputs

The timer-to-process integration test asserts every durable record in the pipeline:

- `facts` — `timer.tick` fact ingested with deterministic `fact_id`
- `context_records` — context created with `primary_charter: "maintenance_steward"`
- `context_revisions` — revision ordinal advanced for `timer:hourly_health_check`
- `work_items` — opened, then `leased`, then `executing`, then `resolved`
- `execution_attempts` — started and completed
- `evaluations` — charter output persisted (mock envelope in fixture proof)
- `foreman_decisions` — decision recorded with `approved_action: "process_run"`
- `intents` — `process.run` intent created with `status: "admitted"`
- `process_executions` — execution record with `status: "completed"`, `exit_code: 0`, captured stdout/stderr

Two modes are verified:
1. **Full pipeline** (`require_human_approval: false`): intent reaches `completed`, execution confirmed
2. **Safe posture** (`require_human_approval: true`): decision stops at `pending_approval`, no intent created until operator approves

---

## 3. Live-Backed Proof

The live-backed proof exercises the same pipeline with a real charter runtime and real subprocess execution. It requires:

### Prerequisites

- Private ops repo initialized via `narada init-repo`
- Charter runtime API key (OpenAI or Kimi)
- Timer source configured in operation config
- `maintenance_steward` charter prompt authored and placed in ops repo

### What Requires Live Exercise

| Capability | Fixture Coverage | Live Required? | Why |
|------------|------------------|----------------|-----|
| Timer source determinism | Mock `getNow()` | **No** | Math is deterministic; fixture proves it |
| Fact identity | `buildFactId()` with mock provenance | **No** | Hashing is deterministic; fixture proves it |
| Context formation | `TimerContextStrategy` with mock facts | **No** | Grouping logic is pure; fixture proves it |
| Work item opening | `DefaultForemanFacade` with mock store | **No** | SQL insert is mechanical; fixture proves it |
| Scheduler leasing | `SqliteScheduler` with in-memory DB | **No** | Lease logic is mechanical; fixture proves it |
| Charter output quality | Hardcoded evaluation envelope | **Yes** | LLM output is non-deterministic |
| Policy governance | Mock confidence / payload | **No** | Governance rules are deterministic; fixture proves it |
| Process spawn | `spawn()` with `/bin/echo` | **No** | Subprocess mechanics are OS-standard; fixture proves it |
| Real diagnostic command output | Mock stdout `"timer-executed"` | **Yes** | Real `narada doctor` output varies by system state |
| Operator review loop | Simulated approval gate | **Yes** | Real operator judgment is required for safety |
| Process execution idempotency under crash | Simulated replay | **No** | Replay logic is deterministic; fixture proves it |
| Confirmation derivation | Mock execution record | **No** | Exit-code mapping is deterministic; fixture proves it |
| Health / readiness probes | Simulated | **Yes** | Real process and filesystem state |

**Key insight:** The Timer → Process operation has a **narrower live boundary** than the mailbox operation. Because timer sources are self-generated and process execution is local, most of the pipeline is mechanically provable without live exercise. The live boundary is concentrated in:
1. **Charter output quality** (LLM evaluation)
2. **Real diagnostic command behavior** (actual `narada doctor` output)
3. **Operator review loop** (real human approval/rejection)

### Live Verification Commands

```bash
# 1. Check readiness (blocking vs non-blocking)
narada preflight health-check-maintenance

# 2. Inspect posture and consequences
narada explain health-check-maintenance

# 3. Trigger a timer sync (dry-run first)
narada sync --operation health-check-maintenance --dry-run
narada sync --operation health-check-maintenance

# 4. Inspect evaluations, decisions, executions
narada show evaluation <evaluation-id> --operation health-check-maintenance
narada show decision <decision-id> --operation health-check-maintenance
narada show execution <execution-id> --operation health-check-maintenance

# 5. Review process_run proposals
narada status

# 6. Approve or reject a pending process_run intent
narada console approve <decision-id> --operation health-check-maintenance
narada console reject <decision-id> --operation health-check-maintenance
```

---

## 4. Fixture vs Live: Explicit Separation

| Responsibility | Fixture-Backed | Live-Backed |
|----------------|---------------|-------------|
| **Pipeline correctness** | ✅ Proven by integration tests | ✅ Exercised by live sync |
| **Idempotency & replay** | ✅ Proven by crash-replay tests | ✅ Observed in production |
| **Charter governance** | ✅ Proven (mock evaluation) | ✅ Verified (real LLM) |
| **Timer determinism** | ✅ Proven (mock clock) | ✅ Deterministic by design |
| **Process spawn mechanics** | ✅ Proven (fixture subprocess) | ✅ Local OS behavior |
| **LLM output quality** | ❌ Hardcoded envelope | ✅ Real charter runtime |
| **Real diagnostic output** | ❌ Mock stdout | ✅ Actual command results |
| **Operator review loop** | ✅ Proven (approval gate) | ✅ Real CLI disposition |
| **Health / readiness probes** | Simulated | ✅ Real filesystem state |

**Rule:** The fixture-backed proof demonstrates that the pipeline is mechanically correct. The live-backed proof demonstrates that the charter produces sensible output and that real diagnostic commands execute correctly. Neither substitutes for the other.

---

## 5. Operator Gates and Safety Limits

### 5.1 Approval Gates

| Gate | Condition | Default |
|------|-----------|---------|
| **Process run approval** | All `process_run` intents require operator approval when `require_human_approval: true` | **Enabled** |
| **Policy override** | Operator may override policy to allow autonomous `process_run` by setting `require_human_approval: false` | Disabled |
| **Unsafe promotion** | `--override-risk` flag required to promote a recommendation that bypasses validation | Disabled |

### 5.2 Safety Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| **Process timeout** | 300 seconds (5 minutes) default | Prevents runaway subprocesses |
| **Stdout/stderr capture** | 64 KB each | Prevents memory exhaustion from verbose output |
| **Allowed actions** | `["process_run", "no_action"]` | Restricts charter to bounded diagnostic commands only |
| **Command bounding** | Charter prompt restricts to pre-approved commands | Prevents arbitrary command execution |
| **Lease duration** | 300 seconds default | Limits time a process intent can hold an execution lease |
| **Recovery behavior** | Stale leases reset intent to `admitted` | Enables retry without operator intervention |

### 5.3 Operator Review Loop

1. Timer tick generates a fact at the scheduled interval
2. Narada forms context, opens work item, acquires lease
3. Charter evaluates and proposes `process_run` with diagnostic command
4. Foreman creates decision with `status: "pending_approval"` (approval gate enabled)
5. **Operator inspects** the proposed command via CLI (`narada show --type decision`) or UI
6. **Operator approves or rejects** the process_run intent
7. On approval, `ProcessExecutor` spawns the subprocess; on rejection, intent is cancelled
8. Execution result (exit code, stdout/stderr) is persisted and confirmed

---

## 6. Inspection Checkpoints

At each stage of the pipeline, you can inspect state:

### After Timer Sync

```bash
# Facts ingested?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT fact_type, fact_id, payload_json FROM facts WHERE fact_type = 'timer.tick';"

# Checkpoint advanced?
cat <rootDir>/cursor.json
```

### After Fact Admission

```bash
# Work items opened?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT work_item_id, context_id, status FROM work_items;"

# Context records?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT context_id, primary_charter, status FROM context_records;"
```

### After Charter Evaluation

```bash
# Evaluation persisted?
narada show --type evaluation --id <evaluation-id>

# Or query directly
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT evaluation_id, outcome, summary, proposed_actions_json FROM evaluations;"
```

### After Foreman Decision

```bash
# Decision recorded?
narada show --type decision --id <decision-id>

# Intent created?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT intent_id, intent_type, status, payload_json FROM intents;"
```

### After Process Execution

```bash
# Execution completed?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT execution_id, intent_id, status, exit_code, stdout, stderr FROM process_executions;"

# Intent status updated?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT intent_id, status, target_id FROM intents WHERE intent_type = 'process.run';"
```

---

## 7. Proof vs Knowledge

This document is a **pipeline proof**, not a **knowledge specification**.

- **Pipeline proof** demonstrates that Narada can receive a timer tick, evaluate it through a charter, and produce a durable process execution intent. It verifies wiring, not wisdom.
- **Knowledge** is the domain-specific content that makes diagnostic commands accurate and safe. It lives in the private ops repo (`operations/<id>/knowledge/`), not here.

The fixture-backed proof uses a minimal mock evaluation envelope because the proof only needs to show that the charter output flows through governance into the intent store. It does not need real diagnostic playbooks.

When you run a **live** timer operation, you populate `knowledge/` with actual diagnostic procedures, escalation criteria, and command allowlists. The quality of process_run proposals depends on that content, but the correctness of the pipeline does not.

---

## 8. Public Repo vs Private Ops Repo

| Concern | Public Repo (`narada`) | Private Ops Repo |
|---------|------------------------|------------------|
| **Source code** | ✅ All packages, tests, fixtures | ❌ Never |
| **Proof execution** | ✅ Run fixture-backed tests | ❌ Not needed |
| **Live config** | ❌ Never | ✅ `config/config.json` |
| **Credentials** | ❌ Never | ✅ `.env` |
| **Operational data** | ❌ Never | ✅ `operations/`, `logs/` |
| **Knowledge sources** | ❌ Generic templates only | ✅ Domain-specific playbooks |
| **Charter runtime** | ❌ Mock / test runners | ✅ Real `codex-api` or `kimi-api` |

The fixture-backed proof lives in the public repo and can be run by anyone. The live-backed proof lives in a private ops repo and requires real credentials.

---

## 9. Non-Goals of This Proof

- This proof does not claim autonomous process execution is safe. Default posture is `draft-only` with human approval required.
- This proof does not cover multi-vertical operations (timer + filesystem, timer + webhook). Timer is the second proven vertical.
- This proof does not cover production unattended operation. The unattended layer is a future target.
- This proof does not cover real-time timer scheduling or dynamic interval changes.
- This proof does not cover process output feedback loops (using stdout as new facts).

---

## 10. Bounded Blockers for Full Live Proof

| Blocker | Bound | Mitigation |
|---------|-------|------------|
| `maintenance_steward` charter prompt does not exist | ~50 lines; reuse `support_steward` structure | Charter content task |
| No `init-repo` template for timer source | Config schema extension | CLI scaffolding task |
| No CLI `show` support for process execution details | Add `process` type to `narada show` | Small CLI extension |
| `narada console approve/reject` may not handle `process.run` intents | Verify intent family routing | Bounded test + fix if needed |
| Live diagnostic command output is environment-dependent | Document expected output shapes | Documentation task |

None of these blockers are architectural. All are bounded content, configuration, or CLI tasks.

---

## Related Documents

- [`.ai/decisions/20260423-518-second-operation-selection-contract.md`](20260423-518-second-operation-selection-contract.md) — Selection decision
- [`.ai/decisions/20260423-519-selected-operation-boundary-contract.md`](20260423-519-selected-operation-boundary-contract.md) — Boundary contract
- [`docs/product/first-operation-proof.md`](../../docs/product/first-operation-proof.md) — Canonical mailbox operation proof (template)
- [`packages/layers/control-plane/test/integration/control-plane/timer-to-process.test.ts`](../../packages/layers/control-plane/test/integration/control-plane/timer-to-process.test.ts) — Fixture proof
- [`packages/layers/control-plane/test/integration/control-plane/vertical-parity.test.ts`](../../packages/layers/control-plane/test/integration/control-plane/vertical-parity.test.ts) — Vertical parity proof
