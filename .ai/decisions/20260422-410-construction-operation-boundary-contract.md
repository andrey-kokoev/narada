# Decision: Construction Operation Boundary Contract

**Date:** 2026-04-22
**Task:** 410
**Depends on:** 408 (Construction Operation Readiness), 397 (Session Attachment Semantics), 406 (Principal Runtime State Machine)
**Chapter:** Construction Operation (410–415)
**Verdict:** **Boundary contract accepted. Chapter may proceed.**

---

## 1. Aim Statement

> **The Construction Operation advances a software system through governed, task-graph execution while preserving long-horizon coherence.**

It is a Narada Operation whose Aim is not to answer emails or send campaigns, but to turn human/architect intent into verified code changes through a reproducible, reviewable, and authority-bounded loop.

The Construction Operation is **one Operation among many** in a Narada deployment. It may coexist with mailbox Operations, timer workflow Operations, or marketing Operations. Its Aim is specific and must not smear into adjacent Operations:

| Adjacent Operation | Boundary |
|--------------------|----------|
| Mailbox helpdesk | The Construction Operation does not read, draft, or send email. It may receive task assignments via chat/operator, but email governance is a separate Aim. |
| Email marketing | The Construction Operation does not manage campaigns, audiences, or Klaviyo state. |
| USC constructor | USC (`narada usc`) is a user-facing intent-refinement tool. The Construction Operation is an internal governance loop. USC outputs may become Construction Operation inputs, but they are not the same surface. |
| General process execution | The Construction Operation uses `process.run` only for verification (tests, typecheck). It does not generalize into a job scheduler. |

---

## 2. Site Definition

The Construction Operation runs at a **local filesystem Site** with the following substrate:

| Component | Location | Purpose |
|-----------|----------|---------|
| Task graph | `.ai/tasks/*.md` | Durable work inventory and state machine |
| Agent roster | `.ai/agents/roster.json` | Static identity + capability catalog |
| Assignment records | `.ai/tasks/assignments/*.json` | Who claimed/released what and when |
| Review records | `.ai/reviews/*.json` | Structured findings with severity and verdict |
| Registry | `.ai/tasks/.registry.json` | Atomic task number allocation |
| Source code | Repository working tree | The system being constructed |
| Coordinator (optional) | `packages/layers/control-plane` SQLite store | If the Site also runs mailbox/marketing verticals |

**What the Site is NOT:**
- It is not a Cloudflare Site (no DO/R2 substrate).
- It is not a Windows Site service (no `narada cycle` runner).
- It does not require a daemon to be running for task governance to work. Task files are the durable boundary.

---

## 3. Cycle Definition

One **Cycle** of the Construction Operation is a bounded pass through the task-graph state:

```
Scan runnable tasks
  → Evaluate dependency readiness
  → Compute continuation affinity
  → Generate assignment recommendation (advisory)
  → Await operator decision (claim / skip / reprioritize)
  → Execute claimed task (agent work + verification)
  → Submit for review
  → Record review findings
  → Transition task status (closed / confirmed / opened for correction)
```

A Cycle is **not** a daemon heartbeat. It is a conceptual unit of advancement. In practice:
- An operator may trigger one Cycle by running `narada task recommend` followed by `narada task claim`.
- An agent may advance one Cycle by claiming a task, working it, and releasing it.
- A reviewer advances one Cycle by reviewing a completed task.

**Cycle boundaries:**
- A Cycle starts with a runnable task and ends with a terminal task status transition.
- A Cycle may span multiple agent sessions (claim → work → release → review → confirm).
- A Cycle leaves durable Traces (assignment records, review records, task file updates).

---

## 4. Act Taxonomy

An **Act** in the Construction Operation is a governed side-effect candidate or committed side-effect. All Acts require authority and leave Traces.

| Act | Actor | Authority Required | Durable Record | Governance |
|-----|-------|-------------------|----------------|------------|
| **Claim task** | Agent (on operator recommendation) | `claim` — operator or agent with `claim` class | Assignment record + task file status → `claimed` | Operator may override recommendation |
| **Release task** | Agent | `claim` (self-release) or `resolve` (operator-forced) | Assignment record + task file status transition | Release reason is mandatory |
| **Execute task work** | Agent | `execute` for the work item's scope | Execution attempt (if using charter) or git commits | Work must be verifiable |
| **Submit for review** | Agent | `propose` — the output is a proposal | Review request record | Reviewer must be different agent |
| **Review task** | Architect / reviewer agent | `resolve` — evaluation authority | Review record with findings + verdict | Verdict is `accepted`, `accepted_with_notes`, or `rejected` |
| **Confirm closed task** | Operator | `confirm` — lifecycle authority | Task file status → `confirmed` | Only after review is accepted |
| **Reopen task** | Operator | `admin` or `claim` | Task file status → `opened` | For corrections or new findings |
| **Derive corrective task** | Operator / system | `derive` — from review finding | New task file with `depends_on` linkage | Must reference source finding |
| **Allocate task number** | System / operator | `admin` (registry mutation) | Registry update | Atomic with file lock |
| **Recommend assignment** | System | `derive` (read-only computation) | Advisory recommendation record | Operator decides whether to act |
| **Close chapter** | Operator | `admin` + `confirm` | Closure artifact + status transitions | All tasks must be terminal |

**Acts that are NOT in scope for this chapter:**
- Autonomous dispatch (system claims on behalf of agent without operator approval)
- Autonomous commit approval (system commits without operator review)
- Direct agent spawning (system starts new agent processes)
- Cost-based task routing (system assigns based on estimated cost)

---

## 5. Trace Taxonomy

A **Trace** is durable explanation and history of what happened and why.

| Trace | What It Records | Durability | Retention | Who Can Read |
|-------|-----------------|------------|-----------|--------------|
| **Task file** (`*.md`) | Full task specification, status, dependencies, execution notes | File-backed, git-tracked | Permanent (archived by git history) | Anyone with repo access |
| **Assignment record** (`assignments/*.json`) | Who claimed/released, when, why | File-backed | Permanent | Anyone with repo access |
| **Review record** (`reviews/*.json`) | Reviewer, verdict, findings, severity | File-backed | Permanent | Anyone with repo access |
| **Registry** (`.registry.json`) | Last allocated number, reserved, released | File-backed | Permanent | Anyone with repo access |
| **Closure artifact** (`decisions/*-closure.md`) | Chapter summary, residuals, CCC posture | File-backed, git-tracked | Permanent | Anyone with repo access |
| **Recommendation record** (new, Task 411) | System-generated assignment recommendation with rationale | File-backed or ephemeral | 30 days or until superseded | Operator, architect |
| **Roster** (`roster.json`) | Agent capabilities, status, last active | File-backed | Updated in place | Anyone with repo access |
| **PrincipalRuntime state** (Decision 406) | Live principal posture, attention, budget | Ephemeral / cached | Lost on console restart | Operator console |
| **SiteAttachment** (Decision 397) | Connection state between principal and Site | Ephemeral | Lost on detach/crash | Operator console |
| **Git history** | Code changes, commit messages, diffs | Git-native | Permanent | Anyone with repo access |

**Trace authority rules:**
- Traces are read-only projections. Removing a Trace does not reverse an Act.
- Task files are the authoritative durable boundary for task state. Assignment and review records are corroborating Traces.
- If a task file and an assignment record disagree, the task file wins.
- Recommendation records are decorative. Their absence does not invalidate a claim.

---

## 6. In-Scope / Out-of-Scope

### 6.1 In Scope (This Chapter: 410–415)

| Capability | Task | Evidence Required |
|------------|------|-------------------|
| Boundary contract (this document) | 410 | Decision artifact accepted |
| Assignment recommendation algorithm | 411 | `narada task recommend` produces ranked list |
| PrincipalRuntime ↔ task-governance integration | 412 | Integration contract defines advisory consumption |
| Review-separation validation | 413 | Fixture proves reviewer ≠ worker check |
| Write-set overlap detection | 413 | Fixture proves overlap warning |
| Recommendation quality fixture | 414 | >80% top-3 accuracy on synthetic task graphs |
| Chapter closure | 415 | Closure artifact with residuals and CCC posture |

### 6.2 Out of Scope (This Chapter)

| Capability | Why Out | Deferred To |
|------------|---------|-------------|
| **Autonomous dispatch** | Violates operator authority boundary | Post-415 chapter, after recommendation quality is proven |
| **Autonomous commits** | Narada not yet trusted to judge semantic correctness | Post-415 chapter, after confirmation operator maturity |
| **Direct agent spawning** | Spawning is `execute` authority; needs intent handoff | Future chapter with spawn intent boundary |
| **Cost estimation** | No historical telemetry exists | Post-415, after budget telemetry from fixture |
| **Dynamic capability learning** | Capabilities are static in roster | Future chapter with review-derived capability updates |
| **Cross-Site construction** | Current scope is single-Site | Future, when multi-Site coordination is needed |
| **Real-time chat integration** | Task assignments happen through CLI/files, not chat protocol | Future, if chat becomes a first-class vertical |
| **Generic work-stealing scheduler** | Construction tasks are file-bound, not lease-bound | Future, if Construction adopts kernel scheduler |

### 6.3 Permanent Exclusions (Never in Scope)

| Capability | Why Never |
|------------|-----------|
| **Automatic task closure without review** | Review is a load-bearing authority boundary |
| **System overruling operator veto** | Operator retains final authority |
| **Removing git history** | Traces are permanent by design |
| **Agent self-modifying roster capabilities** | Capability changes require operator/admin authority |

---

## 7. Authority Matrix

### 7.1 Roles

| Role | Definition | Examples |
|------|------------|----------|
| **Operator** | Human who owns the repo, sets policy, and has final say | Repository owner, team lead |
| **Architect** | Human or agent who evaluates design coherence and reviews | Senior engineer, charter with `resolve` authority |
| **Agent** | Automated worker that executes tasks under governance | Coding agent, charter runner |
| **System** | Narada machinery that computes, recommends, and enforces | Task linter, recommendation engine, registry allocator |

### 7.2 Authority Matrix

| Action | Operator | Architect | Agent | System | Notes |
|--------|----------|-----------|-------|--------|-------|
| **Claim task** | ✅ Yes | ✅ Yes | ✅ Yes (on recommendation) | ❌ No | System recommends; does not claim |
| **Release task** | ✅ Yes | ✅ Yes | ✅ Yes (self) | ❌ No | System never releases |
| **Execute work** | ❌ No | ❌ No | ✅ Yes | ❌ No | Agent performs under lease/claim |
| **Submit for review** | ❌ No | ❌ No | ✅ Yes | ❌ No | Agent proposes; foreman/governance decides |
| **Review task** | ✅ Yes | ✅ Yes | ✅ Yes (as reviewer) | ❌ No | Reviewer ≠ worker enforced |
| **Confirm closure** | ✅ Yes | ❌ No | ❌ No | ❌ No | Operator only |
| **Reopen task** | ✅ Yes | ❌ No | ❌ No | ❌ No | Operator or admin only |
| **Allocate number** | ✅ Yes | ❌ No | ❌ No | ✅ Yes (atomic) | System performs; operator may trigger |
| **Recommend assignment** | ❌ No | ❌ No | ❌ No | ✅ Yes | Pure `derive` computation |
| **Validate separation** | ❌ No | ❌ No | ❌ No | ✅ Yes | Read-only check; warns, does not block |
| **Detect overlap** | ❌ No | ❌ No | ❌ No | ✅ Yes | Read-only check; warns, does not block |
| **Close chapter** | ✅ Yes | ❌ No | ❌ No | ❌ No | Operator or admin only |
| **Change policy** | ✅ Yes | ❌ No | ❌ No | ❌ No | Admin authority required |
| **Override recommendation** | ✅ Yes | ✅ Yes | ❌ No | ❌ No | Human judgment > system suggestion |
| **Veto assignment** | ✅ Yes | ❌ No | ❌ No | ❌ No | Operator may reject any recommendation |

### 7.3 Authority Invariants

1. **Recommendation ≠ Assignment.** The system may recommend; only a principal with `claim` authority may assign.
2. **Review ≠ Worker.** No principal may review a task they worked on. The system checks and warns; the operator enforces.
3. **System checks do not block.** Separation and overlap checks are advisory. The operator may proceed despite warnings.
4. **Operator veto is absolute.** The operator may reject any recommendation, override any assignment, and reopen any closed task.
5. **Trace removal does not reverse Act.** Deleting a review record does not un-close a task. The task file is the authority.

---

## 8. Relationship to Existing Decisions

| Decision | Relationship |
|----------|--------------|
| **397 — Session Attachment Semantics** | Construction tasks may use `SiteAttachment` for agent runtime connection, but task governance itself is file-bound and does not require live attachment. |
| **406 — Principal Runtime State Machine** | `PrincipalRuntime` tracks agent availability and budget. The recommendation engine (Task 411) consumes PrincipalRuntime state as advisory input. |
| **408 — Construction Operation Readiness** | This contract formalizes the boundary that Decision 409 identified as missing. |

---

## 9. Acceptance Criteria

- [x] Decision artifact exists at `.ai/decisions/20260422-410-construction-operation-boundary-contract.md`.
- [x] Aim statement is specific and does not smear into adjacent Operations.
- [x] Site definition identifies the substrate (local filesystem + `.ai/` directory).
- [x] Cycle definition bounds one unit of task-graph advancement.
- [x] Act taxonomy lists all governed actions with authority classes.
- [x] Trace taxonomy lists all durable records with retention and readership.
- [x] In-scope / out-of-scope table is exhaustive for this chapter.
- [x] Authority matrix clearly separates operator, architect, agent, and system roles.
- [x] No new terms conflict with existing canonical terminology (Aim/Site/Cycle/Act/Trace from SEMANTICS.md §2.14).
- [x] No implementation code is added.
- [x] No derivative task-status files are created.
