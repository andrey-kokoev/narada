# Task 265: Correct Multi-Agent Governance Boundary Placement

## Chapter

Multi-Agent Task Governance

## Context

Task 259 created the Multi-Agent Task Governance chapter and Tasks 260-264.

The task graph is useful, but the artifacts repeatedly place stateful governance mechanics inside "Narada.USC static grammar":

- agent assignment state
- task claim/release operators
- task lifecycle transitions
- dependency-aware claim enforcement
- review finding to corrective-task derivation
- task number allocation
- chapter closure mutation

That is a boundary error.

The current semantic target is:

- **Static grammar** may define schemas, artifact formats, compatibility contracts, and validation rules.
- **Pure-ish compilers/tools** may transform static inputs into static outputs without claiming work or mutating lifecycle state.
- **Operators** own stateful transitions such as claim, release, allocate, derive, close, confirm, and review acceptance.

Narada.USC may define the construction grammar for USC-shaped systems. It must not become the canonical owner of multi-agent task-state mutation. Narada proper may provide generic tooling/operators that consume static grammar and mutate task-governance artifacts.

## Goal

Rewrite the Multi-Agent Task Governance chapter artifacts so the runtime/static/tooling boundary is coherent before Tasks 260-264 are executed.

## Required Work

### 1. Correct The Decision Artifact

Update `.ai/decisions/20260420-259-multi-agent-task-governance-gap.md`.

For each gap, classify ownership using these categories:

- `static schema`: artifact shape, grammar, validation rules
- `pure tool/compiler`: deterministic artifact transformation without lifecycle mutation
- `operator`: explicit state transition or mutation
- `observation`: read-only reporting over task-governance artifacts

Do not say that Narada.USC static grammar owns assignment leases, task lifecycle mutation, number allocation, or chapter closure mutation.

### 2. Correct Tasks 260-264

Update Tasks 260-264 so each task separates:

- schema/format work
- validation/lint work
- operator/mutation work
- observation/reporting work

Specific corrections:

- Task 260: roster schema can be static; assignment claim/release are operators.
- Task 261: lifecycle schema can be static; transition enforcement is operator/tooling.
- Task 262: finding schema can be static; number allocation and corrective-task creation are operators.
- Task 263: affinity fields can be static/advisory; closure is an explicit operator.
- Task 264: boundary hardening must verify this separation rather than repeat the old "USC owns static grammar and assignment semantics" language.

### 3. Preserve The Existing Chapter Shape

Do not renumber Tasks 260-264.

Do not create replacement task files.

Do not add new implementation scope beyond correcting the semantic placement.

### 4. Add A Boundary Rule

Add a short rule to the relevant governance/task contract documentation:

> Static grammar may define what a task, finding, roster entry, or chapter is. Operators perform transitions. No static package owns claim, release, allocate, close, execute, or confirm behavior.

Use an existing contract/document if suitable; do not create a large new document unless necessary.

## Non-Goals

- Do not implement the operators from Tasks 260-263.
- Do not change Narada runtime kernel behavior.
- Do not change Narada.USC package contents unless needed for wording consistency.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Decision 259 no longer assigns mutable task-governance behavior to static grammar.
- [x] Tasks 260-264 distinguish schemas/tools/operators/observation where relevant.
- [x] The task graph remains Tasks 260-264 with no renumbering.
- [x] A reusable boundary rule is added to task-governance guidance.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.

---

## Execution Notes

### Decision Artifact (`.ai/decisions/20260420-259-multi-agent-task-governance-gap.md`)

- Replaced the single "system boundary" (runtime vs USC) framing with four ownership categories: `static schema`, `pure tool/compiler`, `operator`, `observation`.
- Updated all 8 gaps:
  - Gap 1 (roster): schema is static; claim/release are operators; workload queries are observation.
  - Gap 2 (lifecycle): status definitions and review schema are static; transitions are operators; contract lint is pure tool.
  - Gap 3 (dependencies): `depends_on` format is static; DAG validation is pure tool; claim-time enforcement is operator.
  - Gap 4 (review loop): finding schema is static; `derive-from-finding` is operator; preview is read-only operator.
  - Gap 5 (number allocation): number format is static; allocator is operator; collision lint is pure tool.
  - Gap 6 (closure): closure criteria are static; closure operator is mutation.
  - Gap 7 (affinity): affinity fields are static/advisory; computed affinity is operator behavior.
  - Gap 8 (boundary): manifest format is static; version check is operator; contract tests are pure tool.

### Tasks 260-264

- **Task 260**: Added `(static)`, `(mutation)` labels to each Required Work section. Fixed Context/Goal to say "schema is static, but claim/release are operators."
- **Task 261**: Split "Review Integration" into static schema (review record format) and operator (review acceptance/rejection). Added `(static)` and `(mutation)` labels. Separated lint as pure tool/compiler.
- **Task 262**: Added `(static)`, `(mutation)`, `(operator)`, `(pure tool/compiler)` labels. Clarified that number allocation is an operator, not a schema concern.
- **Task 263**: Added `(mutation)` to closure operator and `(static/advisory)` to affinity schema. Clarified that affinity fields are static schema consumed by the operator as advisory signals.
- **Task 264**: Fixed Context to correctly state that affinity fields are static schema and derivation is an operator. Updated boundary document to explicitly list what operators own (claim, release, allocate, derive, close, confirm, etc.). Added the authority-separation rule to the bridge requirements.

### Boundary Rule

- Added a new section "Static Grammar vs Operator Boundary" to `.ai/task-contracts/agent-task-execution.md`.
- Includes the canonical rule and the four ownership category definitions.

### Verification

- No code changes.
- No new task files created (only edits to existing 259-264 artifacts).
- No derivative status files.
