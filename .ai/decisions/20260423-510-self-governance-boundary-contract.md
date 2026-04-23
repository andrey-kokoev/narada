---
closes_tasks: [510]
decided_at: 2026-04-23
decided_by: a2
---

# Decision: Self-Governance Boundary Contract

## Date

2026-04-23

## Problem

Narada's task-governance system has grown a rich surface of operators (claim, release, promote, recommend, roster, finish, review, close, continue, report, evidence, lint, plan). But it is not explicit which of these actions Narada may perform autonomously in its own build loop and which remain operator-owned.

The risk is gradual autonomy creep: a command that started as operator-only gets silently wrapped in automation; a policy that was meant as advisory becomes a hard gate; an auto-promotion that was supposed to be bounded drifts into full auto. Without an explicit boundary contract, the operator becomes the hidden scheduler more often than Narada itself, or conversely, Narada makes governance mutations that the operator did not authorize.

## Decision

Define a first-class semantic boundary:

```text
self-governed action != operator-owned action
```

- **Self-governed**: Narada may execute the action within its build loop without blocking for explicit operator approval, provided the action stays within its defined policy envelope.
- **Operator-owned**: The action requires explicit operator intent before execution. Narada may prepare, recommend, or plan the action, but the operator must trigger it.

The boundary is governed by two levers:
1. **The action's inherent authority class** (what the action does to durable state).
2. **The construction loop policy's `allowed_autonomy_level`** (what the operator has configured).

## Authority Class Mapping

Every governance action has an inherent authority class that determines whether it can be self-governed:

| Authority Class | Self-Governable? | Rationale |
|-----------------|------------------|-----------|
| `inspect` | **Yes** | Read-only observation never mutates durable state. |
| `derive` | **Yes, bounded** | Creates advisory artifacts (plans, recommendations) but not authoritative state. |
| `propose` | **Yes, bounded** | Creates durable promotion requests or pre-mutation audit records; requires validation gates. |
| `claim` | **Conditional** | Mutates task status and assignment records; only self-governable when policy explicitly allows `bounded_auto` and all validation gates pass. |
| `execute` | **No** | Performs side effects (live sync, effect workers, external sends). Always operator-owned. |
| `resolve` | **No** | Transitions terminal states (close, confirm). Always operator-owned. |
| `confirm` | **No** | Final review/approval of completed work. Always operator-owned. |
| `admin` | **No** | Changes policy, schema, authority boundaries, or chapter structure. Always operator-owned. |

## Action-by-Action Boundary

### Self-Governed Actions (In-Scope)

These actions may be performed by Narada within its build loop without explicit operator approval, subject to policy constraints.

| # | Action | Command Surface | Authority | Policy Gate | Notes |
|---|--------|-----------------|-----------|-------------|-------|
| 1 | **Recommend assignments** | `narada task recommend` | `derive` | `allowed_autonomy_level >= recommend` | Read-only advisory. Scored, ranked candidates. Never mutates state. |
| 2 | **Produce operator plans** | `narada construction-loop plan` | `derive` | `allowed_autonomy_level >= plan` | Composes observations into a structured plan. Read-only unless auto-promote is enabled. |
| 3 | **Inspect evidence** | `narada task evidence`, `narada task evidence-list` | `inspect` | Any level | Read-only evidence inspection. Determines task completeness by criteria. |
| 4 | **Lint task files** | `narada task lint` | `inspect` | Any level | Pure tool/compiler. Detects structural issues, orphan closures, unchecked criteria. |
| 5 | **Observe task graph** | `narada task graph`, `narada task list` | `inspect` | Any level | Read-only rendering of task DAG and runnable tasks. |
| 6 | **Observe roster** | `narada task roster show` | `inspect` | Any level | Read-only agent status, assignments, last completed tasks. |
| 7 | **Bounded auto-promotion** | `narada construction-loop plan --auto-promote` | `propose` + `claim` | `allowed_autonomy_level = bounded_auto` AND `require_operator_approval_for_promotion = false` AND all validation gates pass | Promotion request is created and executed automatically only when the recommendation is unambiguous, dependencies pass, no write-set conflict, and agent is within daily limits. |
| 8 | **Auto-review preparation** | `narada task review --prepare` (future) | `inspect` + `derive` | `allow_auto_review = true` | Prepares review artifact草稿 but does not submit verdict. Reviewer still confirms. |
| 9 | **Closure-prep** | Evidence inspection + criteria checking | `inspect` | Any level | Narada may check whether a terminal task has all required evidence (execution notes, verification, governed provenance) and flag gaps, but does not close the task. |

### Operator-Owned Actions (Out-of-Scope)

These actions remain explicitly operator-owned. Narada may recommend or plan them, but the operator must trigger them.

| # | Action | Command Surface | Authority | Why Operator-Owned |
|---|--------|-----------------|-----------|-------------------|
| 1 | **Chapter selection** | `narada chapter init`, manual chapter planning | `admin` | Requires product judgment about what work is worth doing and in what order. |
| 2 | **Task creation** | `narada chapter init`, manual task authoring | `admin` | Requires scope definition, acceptance criteria design, and authority boundary analysis. |
| 3 | **Live external execution** | `narada sync`, `narada cycle`, `narada console approve/reject` | `execute` | Mutates live external systems (Graph API, email, webhooks). Safety-critical. |
| 4 | **Unsafe promotion** | `narada task promote-recommendation --override-risk` | `claim` + override | Bypasses validation gates. Requires explicit operator acknowledgment. |
| 5 | **Commit authority** | `git commit`, `git push` | `admin` | Code commit is a separate authority boundary unless explicitly governed by another contract (e.g., CI/CD). |
| 6 | **Policy changes** | Editing `.ai/construction-loop/policy.json` | `admin` | Changes the autonomy boundary itself. Meta-level. |
| 7 | **Authority boundary changes** | Changes to `ForemanFacade`, `Scheduler`, `IntentHandoff`, `OutboundHandoff` | `admin` | Kernel invariants must not be altered without explicit governance. |
| 8 | **Schema changes** | Config schema, persistence schema, CLI public surface | `admin` | Affects all consumers. Requires design review. |
| 9 | **Resolve/confirm closures** | `narada task close`, `narada task finish --verdict accepted` | `resolve` / `confirm` | Terminal state transitions require independent operator judgment. |
| 10 | **Roster done with incomplete evidence** | `narada task roster done --allow-incomplete` | `claim` | Explicit escape hatch from evidence requirements. Operator must consciously allow. |
| 11 | **Reopen terminal tasks** | `narada task reopen` | `admin` | Reverses closure. Requires governance judgment. |
| 12 | **Derive from finding** | `narada task derive-from-finding` | `admin` | Creates new work from review findings. Requires scope judgment. |

## Construction Loop Policy Integration

The `allowed_autonomy_level` in `.ai/construction-loop/policy.json` controls which self-governed actions are active:

| Level | Active Self-Governed Actions | Operator-Owned Actions |
|-------|------------------------------|------------------------|
| `inspect` | Read-only observation (evidence, lint, graph, roster, list) | All mutations and promotions |
| `recommend` | `inspect` + advisory recommendations | All promotions, assignments, closures |
| `plan` | `recommend` + structured operator plans | All promotions, assignments, closures |
| `bounded_auto` | `plan` + bounded auto-promotion (validation-gated) | Overrides, unsafe promotions, closures, live execution |
| `full_auto` | **Not implemented.** Reserved for future when bounded_auto has proven safe. | All operator-owned actions remain operator-owned regardless of level. |

**Key invariant:** `allowed_autonomy_level` never elevates an operator-owned action to self-governed. It only controls which self-governed actions are active. Operator-owned actions remain operator-owned at all levels.

## Policy Enforcement Points

The construction loop controller enforces the self-governance boundary at these points:

1. **Before auto-promotion:** Validates that `allowed_autonomy_level` is `bounded_auto` or higher, `require_operator_approval_for_promotion` is `false`, and all validation gates (dependencies, write-set, risk severity, agent limits) pass.
2. **Before plan execution:** If the plan contains any operator-owned actions, the controller stops and presents the plan for operator review instead of executing.
3. **At policy load time:** `validatePolicyDeep` rejects policies that claim `full_auto` (not implemented) or set unsafe combinations (e.g., `bounded_auto` with `max_write_set_risk_severity: high`).

## Existing Surface Mapping

Map every existing task-governance command against the self-governance boundary:

| Command | Authority | Self-Governed? | Condition |
|---------|-----------|----------------|-----------|
| `task recommend` | `derive` | **Yes** | Always |
| `task construction-loop plan` | `derive` | **Yes** | `allowed_autonomy_level >= plan` |
| `task evidence` | `inspect` | **Yes** | Always |
| `task evidence-list` | `inspect` | **Yes** | Always |
| `task lint` | `inspect` | **Yes** | Always |
| `task graph` | `inspect` | **Yes** | Always |
| `task list` | `inspect` | **Yes** | Always |
| `task roster show` | `inspect` | **Yes** | Always |
| `task promote-recommendation` | `claim` | **Conditional** | `bounded_auto` + policy gates + no override |
| `task claim` | `claim` | **Conditional** | `bounded_auto` + policy gates |
| `task roster assign` | `claim` | **Conditional** | `bounded_auto` + policy gates |
| `task roster review` | `claim` | **No** | Operator selects reviewer |
| `task roster done` | `claim` | **No** | Operator clears agent |
| `task roster idle` | `claim` | **No** | Operator sets agent idle |
| `task report` | `propose` | **No** | Agent submits evidence; operator reviews |
| `task review` | `confirm` | **No** | Independent reviewer evaluates |
| `task finish` | `resolve` | **No** | Canonical completion; evidence inspection + roster done |
| `task close` | `resolve` | **No** | Operator closes task |
| `task reopen` | `admin` | **No** | Operator reopens terminal task |
| `task release` | `claim` | **No** | Operator releases assignment |
| `task continue` | `claim` | **No** | Operator initiates continuation |
| `task allocate` | `admin` | **No** | Operator reserves task numbers |
| `task derive-from-finding` | `admin` | **No** | Operator creates corrective task |

## Invariants

1. **Self-governance is policy-bounded, not capability-bounded.** Narada has the code to perform many operator-owned actions. The boundary is enforced by policy, not by missing implementation.
2. **Operator-owned actions are invariant across autonomy levels.** No policy setting can make `task close` or `git commit` self-governed.
3. **Self-governed actions are advisory by default.** Even when active, they produce recommendations and plans that the operator may accept, modify, or reject.
4. **Bounded auto-promotion is the only self-governed mutation.** It is the sole exception to the "advisory by default" rule, and it is heavily gated.
5. **Policy changes are always operator-owned.** The operator must explicitly change `allowed_autonomy_level`. Narada may recommend a policy change, but cannot apply it.

## What This Decision Does NOT Do

- It does not implement `full_auto`. That level remains reserved.
- It does not change any command schema or add new CLI surfaces.
- It does not weaken existing authority boundaries (Foreman, Scheduler, IntentHandoff, OutboundHandoff).
- It does not make Narada commit code or push to git automatically.
- It does not change the construction loop controller's read-only nature for planning.

## Closure Statement

The self-governance boundary is defined, authority classes are mapped, existing commands are classified, and policy integration points are specified. This decision provides the semantic foundation for Tasks 511–513 (recommendation-to-assignment promotion, governed assignment controller integration, and chapter closure) without requiring implementation changes now.
