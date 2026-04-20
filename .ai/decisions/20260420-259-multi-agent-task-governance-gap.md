# Decision 20260420-259: Multi-Agent Task Governance Capability Gap

> **Scope**: Inventory of gaps between manual agent/task/review juggling and what Narada/Narada.USC should make explicit.
> **Authority**: Task 259 (Multi-Agent Task Governance chapter definition).
> **Status**: Adopted.

---

## Method

This inventory was produced by structured audit of:

1. `.ai/tasks/` — task file conventions, numbering, and lifecycle state
2. `.ai/decisions/` — decision artifacts and their relationship to tasks
3. `.ai/reviews/` — review findings storage (currently empty/unstructured)
4. `.ai/feedback/` — governance feedback channel (rolling Markdown inbox)
5. `AGENTS.md` and task contracts — agent authority boundaries and verification policy
6. `packages/layers/control-plane/src/scheduler/` — work item leasing, affinity, and dispatch
7. `packages/layers/daemon/src/service.ts` — daemon runtime mechanics
8. Narada.USC static grammar — task graph, plan, and executor models

Each gap is classified by **ownership category**:

- `static schema` — artifact shape, grammar, validation rules
- `pure tool/compiler` — deterministic artifact transformation without lifecycle mutation
- `operator` — explicit state transition or mutation
- `observation` — read-only reporting over task-governance artifacts

And by **current state**, **desired state**, and **chapter fit**.

---

## Gap 1: No Explicit Agent Roster or Assignment State

**Current state**: Agents are ephemeral. There is no durable record of which agent claimed which task, when, or under what authority. `AGENTS.md` describes verification policy but does not track agent identity or workload.

**Desired state**: A lightweight agent roster with assignment state — similar to `work_item_leases` in the control plane, but for task work. Each task claim should produce a durable `assignment_lease` with agent identity, claimed_at, and expected scope of work.

**Ownership**:
- `static schema`: roster schema and assignment record format.
- `operator`: claim and release transitions (write assignment records, update task status).
- `observation`: agent workload and assignment history queries.

**Chapter fit**: ✅ Yes. Foundational for all other governance capabilities.

**Deferred?**: No.

---

## Gap 2: Task Lifecycle is Manual and File-Based

**Current state**: Tasks live as Markdown files in `.ai/tasks/`. Claiming a task means an agent reads the file. Closing a task means editing the file to add execution notes and checking acceptance criteria. There is no mechanical lifecycle — a task can be "claimed" by multiple agents simultaneously, and there is no canonical `status` field enforced by the system.

**Desired state**: A task has a mechanical lifecycle: `draft` → `opened` → `claimed` → `in_review` → `closed` → `confirmed`. Transitions should be explicit and auditable. The file-based representation should remain the durable boundary, but a lightweight state machine should govern transitions.

**Ownership**:
- `static schema`: task status definitions, allowed-transition table, `depends_on` field format, review record schema.
- `operator`: status transitions (claim, release, review acceptance/rejection).
- `pure tool/compiler`: contract-existence lint, `depends_on` DAG validation.
- `observation`: task status and dependency query surfaces.

**Chapter fit**: ✅ Yes. This is the core of the chapter.

**Deferred?**: No.

---

## Gap 3: No Dependency-Aware Task Dispatch

**Current state**: Task dependencies are described textually in task files ("Depends on Tasks X-Y") and in DAG Mermaid diagrams. There is no mechanical enforcement. An agent can start Task 262 without confirming Task 260 is complete. The scheduler's dependency-aware dispatch exists for `work_items` inside the control plane, but not for tasks.

**Desired state**: Task dependencies should be first-class. A task in `opened` status should not be claimable until all prerequisite tasks are `closed` or `confirmed`. The DAG should be machine-readable, not just Mermaid.

**Ownership**:
- `static schema`: `depends_on` field format and dependency graph shape.
- `pure tool/compiler`: DAG validation (cycle detection, orphan detection).
- `operator`: claim-time enforcement that prerequisites are terminal.
- `observation`: dependency visualization and query.

**Chapter fit**: ✅ Yes. Static grammar enhancement.

**Deferred?**: No.

---

## Gap 4: Review Findings → Corrective Task Loop is Manual

**Current state**: When a reviewer finds issues, they are recorded in the review artifact (or inline in conversation). There is no mechanical path from a review finding to a new corrective task. The reviewer must manually author a new task file, choose a number, and ensure it links back to the review.

**Desired state**: Review findings should be structured (finding_id, severity, target_task, recommended_action). A promotion operator should be able to derive a corrective task from a finding, inheriting context and linking back to the review. This mirrors the control plane's `preview-derivation` → `work-opening` pattern.

**Ownership**:
- `static schema`: review finding schema, corrective task template shape.
- `operator`: `derive-from-finding` (reserve number, write task file), `preview-derivation` (read-only preview).
- `pure tool/compiler`: finding validation, template rendering.
- `observation`: review coverage and finding resolution status.

**Chapter fit**: ✅ Yes. Completes the governance feedback loop.

**Deferred?**: No.

---

## Gap 5: Task Number Allocation is Manual and Collision-Prone

**Current state**: Task numbers are chosen by agents by scanning `.ai/tasks/` and picking the next integer. This is manual, error-prone, and has no collision detection. There is no registry or allocator.

**Desired state**: A lightweight task number allocator — either a simple registry file (`.ai/tasks/.registry.json`) or a CLI command (`narada task allocate`) that atomically reserves the next number. This should be optional for manual use but required for automated task creation.

**Ownership**:
- `static schema`: task number format and registry file shape.
- `operator`: number allocation (atomic reservation), number release.
- `pure tool/compiler`: collision detection lint, filename-to-number validation.
- `observation`: allocation history and gap queries.

**Chapter fit**: ✅ Yes. Mechanical reliability.

**Deferred?**: No.

---

## Gap 6: No Chapter Closure Operator

**Current state**: Chapter closure is a manual checklist: review all tasks, write a changelog, list residuals, and commit. There is no explicit operator or state machine for "closing a chapter".

**Desired state**: A chapter closure operator that verifies all chapter tasks are `closed` or `confirmed`, generates a summary artifact, and transitions the chapter to `closed`. This mirrors the `recover` and `rebuild-projections` operators in the control plane — explicit, bounded, and operator-triggered.

**Ownership**:
- `static schema`: chapter lifecycle states, closure criteria checklist format.
- `operator`: chapter closure (verify terminal status, write closure artifact, transition tasks to `confirmed`).
- `pure tool/compiler`: chapter-completeness validation.
- `observation`: chapter progress and residual gap reporting.

**Chapter fit**: ✅ Yes. Provides explicit chapter boundaries.

**Deferred?**: No.

---

## Gap 7: Warm-Agent / Continuation-Affinity for Task Work

**Current state**: The control plane has `continuation_affinity` on `work_items` (Task 212) — a work item can express a preference for a specific session or agent. This is advisory; the scheduler uses it as a reordering hint. There is no equivalent for task work. An agent who claimed Task 260 has no preference for claiming Task 261, even if they have full context.

**Desired state**: Task work should support optional continuation affinity — a task can carry `preferred_agent_id` and `affinity_strength`, derived from prior assignments or review relationships. Like work-item affinity, this is advisory and must not block runnable work.

**Ownership**:
- `static schema`: `continuation_affinity` field format.
- `operator`: computed affinity from assignment history (advisory, no hard constraint).
- `pure tool/compiler`: affinity schema validation.
- `observation`: affinity coverage and effectiveness reporting.

**Chapter fit**: ✅ Yes. Leverages existing kernel capability pattern.

**Deferred?**: No.

---

## Gap 8: Narada Runtime vs Narada.USC Static Grammar Boundary Is Blurry

**Current state**: Narada runtime (daemon, control plane, scheduler) and Narada.USC static grammar (task graphs, plans, charters) are conceptually separate but occasionally conflated in documentation. For example, `AGENTS.md` describes both runtime verification policy and static task execution policy. The USC bridge (`usc-init.ts`) dynamically loads USC packages at runtime with no version contract.

**Desired state**: An explicit boundary document that states:
- Narada runtime owns durable state, leases, and effect execution.
- Narada.USC owns static grammar, task graphs, and charter definitions.
- The bridge between them is explicit, versioned, and testable.
- No runtime component may assume USC semantics; no USC component may assume runtime state.

**Ownership**:
- `static schema`: USC package manifest format, compatibility version field.
- `operator`: USC bridge version check at runtime load time.
- `pure tool/compiler`: boundary contract fixture tests.
- `observation`: cross-boundary call inventory and drift detection.

**Chapter fit**: ✅ Yes. Boundary clarity is prerequisite for multi-agent governance.

**Deferred?**: No.

---

## Deferral List

These gaps were considered but deferred out of this chapter:

| Gap | Why Deferred |
|-----|--------------|
| Automated agent capability discovery | Requires runtime agent registry; can be manual for now |
| Cross-repository task dependencies | Requires federation model; not needed for single-repo governance |
| Real-time task status dashboard | Observation API could surface this later; not core to governance mechanics |
| Agent reputation / quality scoring | Requires historical data not yet accumulated |

---

## Chapter Task Mapping

| Gap | Task | Core Deliverable |
|-----|------|------------------|
| 1 | 260 | Agent roster schema, assignment state, and task claim surface |
| 2 | 261 | Task lifecycle state machine (draft → opened → claimed → in_review → closed → confirmed) |
| 3 | 261 | Dependency-aware dispatch rules in static grammar |
| 4 | 262 | Review finding schema and corrective task derivation operator |
| 5 | 262 | Task number allocator and collision prevention |
| 6 | 263 | Chapter closure operator with verification and summary generation |
| 7 | 263 | Task continuation-affinity schema in static grammar |
| 8 | 264 | Explicit Narada runtime / Narada.USC boundary document |
| Closure | 264 | Chapter closure task |
