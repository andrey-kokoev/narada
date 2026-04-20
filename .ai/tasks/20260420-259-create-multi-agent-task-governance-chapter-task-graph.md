# Task 259: Create Multi-Agent Task Governance Chapter Task Graph

## Chapter

Multi-Agent Task Governance

## Context

After Product Surface Coherence, Narada's operator-facing surfaces are aligned. The remaining governance gaps are not in the product surface — they are in how multiple agents collaborate on tasks, reviews, and chapter closure.

Currently:

- Agents claim tasks by reading Markdown files; there is no durable assignment state.
- Task dependencies are described in prose and Mermaid diagrams; they are not machine-enforced.
- Review findings are recorded inline; there is no mechanical path from finding to corrective task.
- Task numbers are manually allocated; collisions are possible.
- Chapter closure is a manual checklist with no explicit operator.
- The boundary between Narada runtime (daemon, control plane) and Narada.USC static grammar is implicit.

This task is not to implement multi-agent governance. It is to create the disciplined task graph for the chapter so implementation agents can proceed without inventing scope locally.

## Goal

Define the next chapter as a minimal, coherent set of tasks that makes multi-agent task governance explicit, mechanical, and auditable — without mixing runtime semantics into static grammar or vice versa.

## Required Work

### 1. Inventory The Capability Gap

Create a compact decision artifact under `.ai/decisions/` that inventories the gap between current manual juggling and desired explicit governance.

Cover at minimum:

- Agent roster / assignment state
- Task claim/review/close lifecycle
- Dependency-aware dispatch
- Review findings → corrective task loop
- Task number allocation / collision prevention
- Chapter closure operator
- Warm-agent / continuation-affinity routing for task work
- Boundary split: Narada runtime mechanics vs Narada.USC static grammar

For each gap, classify:

- Current state vs desired state
- System boundary (runtime vs static grammar)
- Chapter fit
- Whether it should be deferred

### 2. Create A Reduced DAG

Create a reduced Mermaid DAG file for the chapter under `.ai/tasks/`.

Rules:

- Use plain Mermaid only; no class styling.
- Include only next-numbered chapter tasks.
- Show dependencies only where real ordering matters.
- Do not include completed prior chapters as expanded task nodes; represent them as one prerequisite node if needed.

### 3. Create Minimal Follow-Up Tasks

Create next-numbered tasks for the chapter.

Likely task families:

- Agent roster and assignment state surface
- Task lifecycle automation (claim, review, close, dependencies)
- Review finding schema and corrective task derivation
- Task number allocation and collision prevention
- Chapter closure operator
- Warm-agent task routing and Narada/USC boundary hardening

The final set should be minimal and non-overlapping. Do not create task spam.

### 4. Define Chapter Closure Criteria

Include one final closure/review task for the chapter.

It should require:

- integrated review
- changelog entry
- residual list
- commit boundary

## Non-Goals

- Do not implement the tasks created by this task.
- Do not create broad semantic-audit tasks without concrete capability gaps.
- Do not reopen Product Surface Coherence or prior chapters unless a direct dependency must be stated.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Multi-Agent Task Governance chapter boundary is defined.
- [x] Inventory artifact exists under `.ai/decisions/`.
- [x] Reduced DAG file exists under `.ai/tasks/`.
- [x] Minimal next-numbered follow-up task set exists.
- [x] The task set includes a chapter closure task.
- [x] Dependencies on prior chapters are explicit but compressed.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
