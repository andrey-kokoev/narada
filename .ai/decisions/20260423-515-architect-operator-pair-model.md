# Decision: Architect-Operator Pair Model

**Date:** 2026-04-23
**Task:** 515
**Depends on:** 514 (Agent Runtime Boundary Contract), 510 (Self-Governance Boundary Contract), 444 (Task Governance / PrincipalRuntime Bridge)
**Chapter:** Agent Runtime First-Class Modeling (514–517)
**Verdict:** **Model accepted. The pair is a governed relation, not a merged role.**

---

## 1. Problem Statement

Narada's development workflow is driven by an **architect-operator pair**: one principal (the architect) that plans, designs, and recommends work; and another principal (the operator) that approves, authorizes, and owns terminal decisions. This pair is currently implicit in the codebase — visible in commands like `task recommend` and `task promote-recommendation`, but never formally modeled as a relation.

Without an explicit model, three risks emerge:

1. **Role collapse**: The architect's recommendations may be treated as decisions, or the operator may be expected to plan detail that belongs to the architect.
2. **Authority drift**: Auto-promotion and bounded self-governance could silently erase the operator's approval gate.
3. **Accountability gaps**: When a task fails, it is unclear whether the architect's recommendation, the operator's approval, or the agent's execution was the locus of error.

This decision models the pair as a **governed relation inside Narada** without collapsing the two roles into one.

---

## 2. Core Thesis

> **The architect-operator pair is not a hierarchy. It is a crossing regime between the `derive`/`propose` zone and the `resolve`/`admin` zone.**

The architect produces **advisory artifacts** (recommendations, plans, designs) in the `derive`/`propose` authority space. The operator consumes these artifacts and **promotes** them into **durable governance actions** in the `resolve`/`admin` space. The crossing is governed by an explicit admissibility regime: validation gates, override requirements, and audit records.

Neither role is subordinate. The architect cannot execute without operator approval. The operator cannot plan effectively without architect input. The pair is **complementary and mutually constraining**.

---

## 3. Pair Definition in Narada Terms

### 3.1 Role Mapping

| Role | Narada Concept | Principal Type | Authority Classes | Primary Output |
|------|---------------|----------------|-------------------|----------------|
| **Architect** | `Principal` with `principal_type: "agent"` or `"operator"` | Agent or Operator (context-dependent) | `derive`, `propose` | `TaskRecommendation`, `ConstructionLoopPlan`, `DesignDocument` |
| **Operator** | `Principal` with `principal_type: "operator"` | Operator | `resolve`, `execute`, `confirm`, `admin` | `AssignmentPromotionRequest`, `OperatorActionRequest`, `ReviewVerdict`, `ClosureDecision` |
| **Agent (Executor)** | `Principal` with `principal_type: "agent"` | Agent | `propose`, `execute` (if granted lease) | `WorkResultReport`, `Evaluation`, `ExecutionAttempt` |

> **Note:** The architect may be an agent or an operator. In Narada's current development model, the architect is typically an agent (e.g., `codex`, `a2`). The operator is always a human or human-delegated principal. The key distinction is **authority class**, not principal type.

### 3.2 Relation Semantics

The architect-operator relation is not a database table. It is a **behavioral contract** encoded in the task-governance state machine and the promotion pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Architect-Operator Crossing Regime                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────────────┐    │
│  │  Architect  │         │  Crossing   │         │      Operator       │    │
│  │  (derive/   │──derive──▶│  Regime   │──resolve──▶│  (resolve/         │    │
│  │   propose)  │         │             │         │   execute/confirm)  │    │
│  └─────────────┘         └─────────────┘         └─────────────────────┘    │
│         │                      │                         │                   │
│         ▼                      ▼                         ▼                   │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────────────┐    │
│  │ TaskRecom-  │         │ Validation  │         │ AssignmentPromotion │    │
│  │ mendation   │────────▶│ Gates       │────────▶│ Request             │    │
│  │             │         │             │         │                     │    │
│  │ • task_id   │         │ • task      │         │ • promotion_id      │    │
│  │ • principal │         │   status    │         │ • requested_by      │    │
│  │ • score     │         │ • deps      │         │ • validation_results│    │
│  │ • rationale │         │ • agent     │         │ • executed_at       │    │
│  │ • risks     │         │ • write-set │         │                     │    │
│  └─────────────┘         │ • freshness │         └─────────────────────┘    │
│                          │ • principal │                                    │
│                          │   state     │                                    │
│                          └─────────────┘                                    │
│                                                                              │
│  Crossing artifact: `AssignmentPromotionRequest`                             │
│  Admissibility regime: 9 validation gates (see §4.2)                         │
│  Confirmation rule: operator `--by` flag + explicit override if gates fail   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Authority Boundaries

### 4.1 What the Architect Owns

| Boundary | Authority | Mechanism | Durable Record |
|----------|-----------|-----------|----------------|
| **Recommendation generation** | `derive` | `task recommend`, `construction-loop plan` | `TaskRecommendation` (computed, not stored) |
| **Design and specification** | `derive` | Task file authoring, contract documents | Task files, `.ai/decisions/*.md` |
| **Dependency ordering** | `derive` | Task DAG construction, chapter planning | Chapter DAG files |
| **Risk assessment** | `derive` | Write-set analysis, posture adjustment | Recommendation risks array |
| **Acceptance criteria design** | `derive` | Task file `## Acceptance Criteria` | Task file body |

### 4.2 What the Operator Owns

| Boundary | Authority | Mechanism | Durable Record |
|----------|-----------|-----------|----------------|
| **Promotion approval** | `resolve` | `task promote-recommendation --by <operator>` | `AssignmentPromotionRequest` JSON |
| **Task claim (direct)** | `claim` | `task claim --agent <id>` | Assignment record + task front-matter |
| **Unsafe override** | `resolve` + override | `task promote-recommendation --override-risk` | Promotion record with `override_reason` |
| **Terminal closure** | `resolve` | `task close --by <operator>`, `task review --verdict accepted` | Task file `governed_by` field |
| **Policy change** | `admin` | Edit `.ai/construction-loop/policy.json` | Policy file |
| **Live execution** | `execute` | `narada sync`, `narada cycle` | Health records, traces |
| **Review verdict** | `confirm` | `task review --verdict <accepted|rejected>` | Review artifact in `.ai/reviews/` |

### 4.3 What Is Advisory (Neither Owns)

| Artifact | Produced By | Consumed By | Nature |
|----------|-------------|-------------|--------|
| `TaskRecommendation` | Architect | Operator | Advisory signal — operator may reject, modify, or bypass |
| `PrincipalRuntimeHealth` | Runtime | Planner | Advisory signal — scheduler may ignore |
| `AgentTrace` | Agent | Operator | Advisory commentary — no authority |
| `Posture` | CCC analysis | Recommender | Advisory signal — adjusts scoring weights |
| `Learning artifact` | Agent | Future agents | Advisory guidance — not enforced |

### 4.4 What Is Promotable

An artifact is **promotable** when it crosses from advisory to durable through an explicit operator action:

| Advisory Artifact | Promotion Operator | Durable Result | Authority |
|-------------------|-------------------|----------------|-----------|
| `TaskRecommendation` | `task promote-recommendation` | Assignment + claimed task | `resolve` (operator approves) |
| `ConstructionLoopPlan` | Operator executes plan steps | Completed tasks, merged code | `resolve` + `execute` |
| `Review draft` | `task review --verdict accepted` | Review artifact + closed task | `confirm` |
| `Design document` | Task creation + assignment | Task file in `.ai/do-not-open/tasks/` | `admin` |

**Key invariant:** Promotion is always explicit. The architect cannot auto-promote its own recommendations. Even under `bounded_auto` policy, the promotion is performed by the construction loop controller acting as a delegated operator surrogate, not by the architect directly.

---

## 5. The Pair in the Control Cycle

The architect-operator pair spans multiple Control Cycle phases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Architect-Operator Phase Participation                    │
├─────────────┬────────────────────────┬──────────────────────────────────────┤
│ Phase       │ Architect Role         │ Operator Role                        │
├─────────────┼────────────────────────┼──────────────────────────────────────┤
│ 1. Read     │ Defines source spec    │ Approves source configuration        │
│ 2. Admit    │ Designs admission rules│ Approves rule changes                │
│ 3. Form     │ Designs context strategy│ Approves charter binding            │
│ 4. Evaluate │ Runs charter (agent)   │ Observes evaluations                 │
│ 5. Govern   │ Proposes actions       │ Resolves decisions (approves/rejects)│
│ 6. Handoff  │ Designs intent schema  │ Approves intent execution            │
│ 7. Execute  │ Executes tools (agent) │ Observes execution, overrides if needed│
│ 8. Confirm  │ —                      │ Confirms effects                     │
│ 9. Trace    │ Appends reasoning traces│ Reviews traces for audit            │
└─────────────┴────────────────────────┴──────────────────────────────────────┘
```

**Key insight:** The architect dominates phases 1–3 (specification and design), participates in 4–5 (propose), and is absent from 8 (confirm). The operator dominates phases 5–8 (governance, execution approval, confirmation) and participates in 1–3 (approval). Neither role owns all phases.

---

## 6. Self-Governance and the Pair

The self-governance boundary (Decision 510) interacts with the pair model as follows:

### 6.1 Architect-Operated Self-Governance

When `allowed_autonomy_level >= recommend`, the architect may:
- Generate recommendations without operator approval
- Produce construction-loop plans
- Inspect evidence and flag gaps

These are **advisory only**. The operator retains promotion authority.

### 6.2 Operator-Owned Governance

These actions remain operator-owned regardless of autonomy level:
- Promotion approval (`task promote-recommendation --by <operator>`)
- Unsafe override (`--override-risk`)
- Terminal closure (`task close`, `task review`)
- Policy changes

### 6.3 Delegated Promotion (Bounded Auto)

Under `bounded_auto` with `require_operator_approval_for_promotion = false`, the construction loop controller may auto-promote recommendations. This is **not** the architect promoting itself. It is:

1. The architect produces a recommendation.
2. The controller (a separate runtime component) validates all gates.
3. The controller invokes `task promote-recommendation` with a surrogate operator identity.
4. The promotion record is still audited and reversible.

The operator may retroactively reject or override any auto-promotion by running `task release` or `task reopen`.

---

## 7. Accountability Model

When a task fails, accountability is distributed according to the phase where the error originated:

| Failure Locus | Architect Accountability | Operator Accountability | Agent Accountability |
|---------------|-------------------------|------------------------|---------------------|
| **Wrong task recommended** | High — recommendation was ill-founded | Low — operator approved in good faith | N/A |
| **Task approved with override** | Medium — risks were flagged | High — operator bypassed gates | N/A |
| **Task claimed but not executed** | Low | Low | High — agent did not perform |
| **Execution failed (buggy code)** | Medium — design may be flawed | Low | High — agent produced defective work |
| **Review missed defect** | Low | High — reviewer did not catch issue | Medium — agent hid or missed defect |
| **Closure with unchecked criteria** | Low | High — operator bypassed evidence gates | Low |

**Key invariant:** Approval does not transfer accountability from the architect to the operator. The architect remains accountable for the quality of recommendations. The operator remains accountable for the quality of approval judgments. The agent remains accountable for execution quality.

---

## 8. In-Scope for the Pair Model

| # | Boundary | Rationale |
|---|----------|-----------|
| 1 | **Role definition via authority class** | Architect = `derive`/`propose`; Operator = `resolve`/`execute`/`confirm`/`admin` |
| 2 | **Crossing regime between recommendation and promotion** | Explicit 9-gate validation before advisory → durable transition |
| 3 | **Advisory vs promotable artifact distinction** | Not all architect output becomes durable; promotion is explicit |
| 4 | **Self-governance boundary integration** | Architect may auto-generate; operator must approve promotion |
| 5 | **Accountability distribution** | Each role accountable for its own phase contributions |
| 6 | **Phase participation table** | Architect dominates design; operator dominates governance/confirmation |

### 8.1 Out-of-Scope (Deferred to Tasks 516–517)

| # | Boundary | Why Deferred |
|---|----------|--------------|
| 1 | **Multi-architect coordination** | Task 516 — no current need for multiple architects |
| 2 | **Operator delegation chains** | Task 517 — human operator may delegate to sub-operators |
| 3 | **Pair formation/dissolution lifecycle** | Task 517 — no runtime need to model pair creation |
| 4 | **Cross-pair accountability** | Task 517 — one operator may approve another architect's work |

---

## 9. Verification

| Claim | Evidence | Status |
|-------|----------|--------|
| Architect authority is `derive`/`propose` | `task-recommend.ts`: "Read-only advisory command. Never mutates state." | ✅ Verified |
| Operator authority is `resolve`/`admin` | `task-promote-recommendation.ts`: requires `--by <operator-id>`; validates gates | ✅ Verified |
| Promotion is explicit and audited | `task-promote-recommendation.ts`: writes `AssignmentPromotionRequest` JSON with validation results | ✅ Verified |
| Override requires explicit reason | `task-promote-recommendation.ts`: `--override-risk` captured in `override_reason` | ✅ Verified |
| Auto-promotion is delegated, not architect-direct | `self-governance-boundary-contract.md`: "Controller invokes promotion with surrogate identity" | ✅ Verified |
| Task closure requires operator | `agent-task-execution.md`: "Governed operators set `governed_by` field" | ✅ Verified |
| Architect cannot bypass validation gates | `task-promote-recommendation.ts`: 9 validation gates; hard failures block promotion | ✅ Verified |

---

## 10. Cross-References

| Document | Relationship |
|----------|--------------|
| [`.ai/decisions/20260423-514-agent-runtime-boundary-contract.md`](20260423-514-agent-runtime-boundary-contract.md) | Agent runtime object mapping; Principal type definitions |
| [`.ai/decisions/20260423-510-self-governance-boundary-contract.md`](20260423-510-self-governance-boundary-contract.md) | Self-governed vs operator-owned action classification |
| [`.ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md`](20260422-444-task-governance-principal-runtime-bridge.md) | Task governance → PrincipalRuntime bridge (unidirectional) |
| [`.ai/task-contracts/agent-task-execution.md`](../../.ai/task-contracts/agent-task-execution.md) | Agent execution contract; closure authority rules |
| [`SEMANTICS.md §2.10`](../../SEMANTICS.md) | Promotion operator family — explicit transitions |
| [`SEMANTICS.md §2.14`](../../SEMANTICS.md) | Aim / Site / Cycle / Act / Trace — pair participates across phases |
| [`SEMANTICS.md §2.15`](../../SEMANTICS.md) | Crossing regime — architect-operator is a governed crossing |
| `packages/layers/cli/src/commands/task-recommend.ts` | Architect output surface (recommendation generation) |
| `packages/layers/cli/src/commands/task-promote-recommendation.ts` | Operator approval surface (promotion with gates) |
