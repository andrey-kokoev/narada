# Decision 517 — Agent Runtime Modeling Closure

> **Status:** Closed  
> **Governed by:** task_close:a2  
> **Closes Chapter:** Agent Runtime First-Class Modeling (Tasks 409, 412, 444, 456, 514, 515, 516, 517)

## Summary

The Agent Runtime First-Class Modeling Chapter is closed. Narada now explicitly models the agent runtime as a **composition layer** over existing canonical concepts rather than a new authority boundary. The architect-operator pair is formalized as a governed crossing regime with provenance tracked through the recommendation → promotion pipeline. The PrincipalRuntime bridge (Task 456) remains the primary integration surface. What remains unmodeled is documented without overclaim.

## What This Chapter Accomplished

| Task | What Was Delivered |
|------|-------------------|
| **409** | Implicit state machine inventory: 9 candidates classified, top-5 priorities ranked, extraction criteria established |
| **412** | PrincipalRuntime integration contract: read-only consumption by assignment planner, conflict-resolution rules, availability model |
| **444** | Task Governance / PrincipalRuntime bridge contract: unidirectional bridge (Task Governance → PrincipalRuntime), 10 event-to-transition mappings, 8 bridge invariants |
| **456** | Bridge implementation: `principal-bridge.ts` helper, post-commit hooks in `task-claim/report/review/release`, `principal sync-from-tasks` reconciliation, 21 tests |
| **514** | Agent runtime boundary contract: 14 agent runtime terms mapped to Narada canonical concepts, 8 permitted actions, 8 forbidden actions, control-cycle phase mapping |
| **515** | Architect-operator pair model: crossing regime between `derive`/`propose` and `resolve`/`admin`, 5 architect-owned boundaries, 7 operator-owned boundaries, accountability matrix |
| **516** | Bridge integration: architect provenance (`architect_id`, `recommender_id`) flows through recommendation → promotion pipeline, additive only, 37 tests |

## What Is Now First-Class

### 1. Agent Runtime as Composition Layer (Decision 514)

Every agent-facing concept is explicitly mapped to an existing Narada canonical object:

| Agent Runtime Term | Narada Canonical Concept | Durability | Authority |
|-------------------|-------------------------|------------|-----------|
| Agent | `Principal` of type `"agent"` | Identity: durable (roster); Runtime: ephemeral | `propose`, `execute` (leased) |
| Operator | `Principal` of type `"operator"` | Identity: durable; Runtime: ephemeral | `admin`, `resolve`, `execute`, `confirm` |
| Session | `AgentSession` | **Durable** — SQLite `agent_sessions` | Foreman (creation), Scheduler (lifecycle) |
| Assignment | `TaskAssignmentRecord` + roster | **Durable** — files | Task governance operators |
| Work item | `WorkItem` | **Durable** — SQLite `work_items` | Scheduler (leases), Foreman (resolution) |
| Execution | `ExecutionAttempt` | **Durable** — SQLite `execution_attempts` | Scheduler + executor |
| Evaluation | `Evaluation` | **Durable** — SQLite `evaluations` | Charter runtime (`propose`) + Foreman (`resolve`) |
| Report | `WorkResultReport` | **Durable** — task file markdown | Agent (author), Reviewer (verdict) |
| Trace | `AgentTrace` | **Durable** — SQLite `agent_traces` | Advisory / read-only |
| Health | `PrincipalRuntimeHealth` + `SiteHealthRecord` | Ephemeral / Durable | Advisory signal |
| Budget | `PrincipalRuntime.budget_remaining` | Ephemeral | Advisory signal |
| Attachment | `PrincipalRuntime` state + `AgentSession` | Runtime: ephemeral; Session: durable | Self (attach/detach via CLI) |
| Claim | `WorkItemLease` acquisition request | **Durable** — SQLite `work_item_leases` | Scheduler grants; PR filters eligibility |

**Key invariant:** The agent runtime does not own any authority. It is a read model and advisory signal surface over durable control-plane state.

### 2. Architect-Operator Pair as Crossing Regime (Decision 515)

The pair is modeled as a **governed relation**, not a merged role:

| Role | Authority Zone | Primary Output |
|------|---------------|----------------|
| **Architect** | `derive` / `propose` | `TaskRecommendation`, `ConstructionLoopPlan`, design documents |
| **Operator** | `resolve` / `execute` / `confirm` / `admin` | `AssignmentPromotionRequest`, `OperatorActionRequest`, review verdicts, closures |
| **Agent (Executor)** | `propose` / `execute` (leased) | `WorkResultReport`, `Evaluation`, `ExecutionAttempt` |

**Crossing artifact:** `AssignmentPromotionRequest` with 9 validation gates  
**Accountability:** 6 failure loci × 3 roles matrix documented

### 3. Provenance in Recommendation → Promotion Pipeline (Task 516)

The architect-operator pair is made explicit in durable artifacts:

- `TaskRecommendation.recommender_id` — set from `--architect` flag (defaults to `'system'`)
- `AssignmentPromotionRequest.architect_id` — captured from recommendation snapshot
- `AssignmentPromotionRequest.requested_by` — operator or `construction-loop`
- `recommendation_snapshot.recommender_id` — links promotion back to originating architect

This is the **smallest real integration**: additive provenance metadata only; no state machines or authority boundaries changed.

### 4. PrincipalRuntime Bridge (Task 456)

The bridge connects task-governance events to PrincipalRuntime state:

- **Events mapped:** `task_claimed` → `claiming`, `task_reported` → `reporting`, `task_review_accepted` → `completing`, `task_review_rejected` → `revising`, `task_released` → `detached`
- **Wired into:** `task-claim`, `task-report`, `task-review`, `task-release` commands (post-commit, advisory)
- **Reconciliation:** `narada principal sync-from-tasks` reconciles drift
- **Tests:** 21 focused tests in `principal-bridge.test.ts`

## What Remains External / Improvised

The following behaviors are still outside Narada's explicit model:

| # | Unmodeled Behavior | Current State | Why Not First-Class Yet |
|---|-------------------|---------------|------------------------|
| 1 | **Multi-architect coordination** | Single architect per recommendation | No observed need for multiple architects competing or collaborating on recommendations |
| 2 | **Operator delegation chains** | Operator actions are direct | No delegation model (e.g., operator A approves operator B's promotions) |
| 3 | **Dynamic tool catalog binding** | Tool catalog is static config | Runtime tool discovery/registration not implemented |
| 4 | **Agent health query surface** | Health exists as advisory signal | No CLI query or observability view for `PrincipalRuntimeHealth` |
| 5 | **Agent runtime daemon/timer** | Explicit trigger only | Construction loop has no daemon mode; agents are invoked manually |
| 6 | **Cross-session memory** | `resume_hint` per session | No durable cross-session context beyond `resume_hint` |
| 7 | **Agent capability evolution** | Static capabilities in roster | No model for agents learning/gaining capabilities over time |
| 8 | **Agent-to-agent communication** | No direct channel | Agents communicate only through durable artifacts (task files, reviews) |
| 9 | **AgentRuntimeView observability** | Speculative in Decision 514 §8.1 | Not implemented in `observability/types.ts` — no code exists |
| 10 | **Budget enforcement** | Advisory only | `budget_remaining` is tracked but not enforced as a hard gate |

## Invariants Preserved

1. **Agent runtime is a composition layer, not an authority boundary.** No new authority was created for agents.
2. **PrincipalRuntime state does not grant authority.** It is advisory; durable boundaries (task files, work items, evaluations) hold authority.
3. **Architect and operator roles are not collapsed.** The crossing regime preserves distinct authority zones.
4. **Bridge updates are post-commit and advisory.** Task governance never waits for PrincipalRuntime.
5. **Provenance is additive only.** No existing state machine or authority boundary was altered to add architect tracking.

## Verification Evidence

- `pnpm verify` — all 5 steps pass
- `pnpm --filter @narada2/cli test -- test/commands/principal-bridge.test.ts` — 21/21 tests pass
- `pnpm --filter @narada2/cli test -- test/commands/task-recommend.test.ts` — 21/21 tests pass
- `pnpm --filter @narada2/cli test -- test/commands/task-promote-recommendation.test.ts` — 16/16 tests pass
- Full CLI test suite: 625/625 tests pass
- Typecheck: all packages pass

## Closure Statement

The Agent Runtime First-Class Modeling Chapter closes with Narada able to answer "what is an agent in Narada terms?" with a precise mapping to existing canonical concepts. The architect-operator pair is no longer implicit — it is a governed crossing regime with tracked provenance. The PrincipalRuntime bridge keeps ephemeral runtime state in sync with durable task governance without collapsing the boundary. What remains unmodeled is documented as external improvisation with clear reasons for deferral.

---

**Closed by:** a2  
**Closed at:** 2026-04-23
