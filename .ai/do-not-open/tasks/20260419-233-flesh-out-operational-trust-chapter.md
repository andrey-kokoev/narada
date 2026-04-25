# Task 233: Flesh Out Operational Trust Chapter

## Chapter

Operational Trust

## Contracts

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/task-contracts/chapter-planning.md`

## Why

Live Operation proves that Narada can run one useful operation end-to-end. The next chapter should make that live path safe and dependable enough to leave running.

Operational Trust is not about adding more intelligence. It is about giving an operator confidence that Narada can be started, observed, interrupted, recovered, audited, and debugged without hidden state or guesswork.

This task is a planning task. Do not implement the chapter directly.

## Goal

Define the Operational Trust chapter and produce a minimal follow-up task graph that starts after Live Operation is complete.

## Required Work

### 1. Define The Chapter Boundary

Write a compact chapter definition that answers:

- What does it mean for a Narada operation to be trusted operationally?
- What must be true before an operator can leave it running daily?
- What is explicitly outside this chapter?

The definition should distinguish Operational Trust from:

- Live Operation: proving one end-to-end useful path
- Advisory Routing Runtime: improving assignment/lane choice
- Product polish: making the UI beautiful or marketable
- Multi-Operation Scale: many operations/templates/verticals

**Chapter Definition (produced)**:

> **Operational Trust** means an operator can:
> 1. **Start** the daemon confidently, knowing it will not silently fail or duplicate itself.
> 2. **Observe** health, readiness, and backlog without parsing logs or querying raw SQLite.
> 3. **Interrupt** the daemon (shutdown, restart) without losing in-flight work.
> 4. **Recover** from common failures (crash, DB corruption, stale cursor) with a documented runbook.
> 5. **Audit** every operator action and system decision to answer "what happened and why?"
> 6. **Detect** stuck work and stuck drafts before they become incidents.
>
> **Outside this chapter**: full draft approval workflows (minimal disposition in Task 238), multi-operation scale, advisory routing beyond `continuation_affinity`, production UI polish, Prometheus/centralized metrics, automated backup scheduling.

### 2. Inventory Trust Gaps

Create an inventory artifact:

```text
.ai/decisions/20260419-233-operational-trust-inventory.md
```

Cover at minimum:

- start/stop/restart behavior
- daemon process supervision and safe shutdown
- health/readiness status
- stuck work detection
- stuck draft / outbound command detection
- operator action audit visibility
- draft approval/rejection surface
- credential/secret handling
- recovery runbooks
- inspection of "what happened and why"
- backup/restore posture, if relevant
- local telemetry/test-runtime hygiene, if relevant

Each item should be classified:

- exists and sufficient
- exists but insufficient
- missing
- deferred

### 3. Create Follow-Up Tasks

Create the smallest next-numbered set of tasks needed to make the Live Operation path operationally trustworthy.

Likely areas:

- health/readiness contract for live operations
- stuck-work and stuck-outbound detection
- operator audit inspection
- draft approval/rejection workflow
- daemon lifecycle/runbook hardening
- credential/secret handling hardening
- recovery playbook and rehearsed failure scenarios

Do not add tasks for features that are nice but not necessary to trust one live mailbox operation.

**Produced tasks**:

| Task | Focus | Why Included |
|------|-------|--------------|
| 234 | Health/Readiness Contract | Operator must know if daemon is alive and ready |
| 235 | Stuck-Work & Stuck-Outbound Detection | Operator must know if work is piling up |
| 236 | Operator Audit Inspection | Operator must see what actions were taken |
| 237 | Daemon Lifecycle, Runbook Hardening, Recovery Playbook | Operator must start/stop safely and recover from incidents |
| 238 | Draft Disposition Surface | Operator must be able to reject, mark reviewed, or record external handling of drafts |

**Excluded**:
- Full draft approval workflow (approve → send, edit, multi-step review) — minimal disposition in Task 238 is sufficient for draft-only trust
- Credential hardening (env vars acceptable for first operation)
- Scheduled backup automation (manual backup sufficient)
- Production telemetry export (`.health.json` sufficient)

### 4. Produce Reduced DAG

Create a separate DAG file for the new task range:

```text
.ai/do-not-open/tasks/20260419-234-238.md
```

Use Mermaid and include ordering rationale.

### 5. Protect Chapter Ordering

Operational Trust tasks must state that they depend on completion of Live Operation Tasks 228-232, unless the task is purely documentary and can safely proceed earlier.

All tasks 234-238 explicitly depend on Tasks 228-232.

## Non-Goals

- Do not implement Operational Trust in this task.
- Do not modify daemon/runtime code in this task.
- Do not send email.
- Do not run live operations.
- Do not create private operational data in the public repo.
- Do not create derivative task-status files.

## Verification

Minimum:

```bash
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

Focused proof:

- inventory exists and separates sufficient/insufficient/missing/deferred
- follow-up tasks are next-numbered and non-overlapping
- DAG file exists as a separate task-range file
- follow-up tasks do not bypass Live Operation unless explicitly justified

## Definition Of Done

- [x] Operational Trust chapter boundary is defined.
- [x] Operational Trust inventory artifact exists.
- [x] Minimal next-numbered follow-up task set exists (234-238).
- [x] Reduced DAG file exists.
- [x] Dependencies on Live Operation are explicit.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

- Chapter boundary defined in §1 above.
- Inventory written to `.ai/decisions/20260419-233-operational-trust-inventory.md` with 12 categories, 4-class status taxonomy.
- Follow-up tasks 234-238 created with non-overlapping scope:
  - 234: Health/Readiness Contract
  - 235: Stuck-Work & Stuck-Outbound Detection
  - 236: Operator Audit Inspection Surface
  - 237: Daemon Lifecycle, Runbook Hardening, and Recovery Playbook
  - 238: Draft Disposition Surface
- DAG written to `.ai/do-not-open/tasks/20260419-234-238.md` with Mermaid diagram and ordering rationale.
- All tasks 234-238 explicitly depend on Tasks 228-232.
- Minimal draft disposition surface added as Task 238 (reject, mark reviewed, handled externally). Full approval workflow (approve → send, edit) remains deferred.
- No derivative status files created.
