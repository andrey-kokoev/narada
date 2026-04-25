# Task 245: Create Product Surface Coherence Chapter Task Graph

## Chapter

Product Surface Coherence

## Context

After Operator Closure, Live Operation, and Operational Trust, Narada's remaining semantic cavities are mostly not in the kernel. They are in the user/operator surface:

- user-facing `operation` vs internal `scope` leakage
- first-run / “just make it work” setup flow
- ops repo initialization and daily-run path
- mechanical enforcement of agent verification policy
- USC/Narada boundary hardening after practical use
- live-service residuals from the mailbox vertical

This task should create the next chapter's disciplined task graph, not implement the chapter.

## Goal

Define the next chapter as a minimal, coherent set of tasks that closes product/operator surface cavities without mixing them into Operational Trust.

## Required Work

### 1. Inventory The Remaining Cavities

Create a compact decision artifact under `.ai/decisions/` that inventories remaining product-surface cavities.

Cover at least:

- `operation` vs `scope` in CLI/config/docs
- init/setup path for a new user
- ops repo creation/init flow
- daily-run command path
- mechanical guardrails for expensive verification
- USC/Narada boundary in user-facing workflows
- live-service residuals from Live Operation

For each cavity, classify:

- user-facing impact
- implementation area
- whether it belongs in this chapter
- whether it should be deferred

### 2. Create A Reduced DAG

Create a reduced Mermaid DAG file for the chapter under `.ai/do-not-open/tasks/`.

Rules:

- Use plain Mermaid only; no class styling.
- Include only next-numbered chapter tasks.
- Show dependencies only where real ordering matters.
- Do not include completed prior chapters as expanded task nodes; represent them as one prerequisite node if needed.

### 3. Create Minimal Follow-Up Tasks

Create next-numbered tasks for the chapter.

Likely task families:

- operation/scope surface alignment
- `narada init` / repo setup path
- daily operation command/runbook path
- mechanical verification-policy guardrails
- USC/Narada boundary hardening for generated/user repos

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
- Do not create broad semantic-audit tasks without concrete product-surface cavities.
- Do not reopen Operator Closure, Live Operation, or Operational Trust unless a direct dependency must be stated.
- Do not create derivative task-status files.

## Execution Notes

### Inventory Artifact
- Created `.ai/decisions/20260420-245-product-surface-cavities.md`
- Covers 6 cavities: Operation/Scope leakage, Init/Setup path, Daemon vertical neutrality, Verification policy guardrails, USC/Narada boundary, and live-service residuals.
- Includes deferral list with rationale.
- Maps cavities to tasks 252, 254-257.

### Reduced DAG
- Created `.ai/do-not-open/tasks/20260420-254-258.md`
- Plain Mermaid, no class styling.
- Prior chapters represented as a single prerequisite node.
- Shows real ordering dependencies only.

### Follow-Up Tasks
- **Task 252**: Agent Verification Speed & Telemetry — Pre-assigned; redefines verification ladder, reworks `pnpm verify`, improves telemetry, guards against accidental broad runs.
- **Task 254**: Operation/Scope Surface Alignment — CLI flags, error messages, output labels, config generation, observation API alias, AGENTS.md housekeeping.
- **Task 255**: Init & Setup Path Hardening — Deprecate legacy `init`, unify init paths, extend `want-mailbox` CLI, harden preflight, complete `.env.example`, daemon config detection, `narada doctor`.
- **Task 256**: Daemon Vertical Neutrality — Conditional source initialization, generalize dispatch context, rename `perMailbox` → `perScope`, UI neutrality, config examples.
- **Task 257**: USC/Narada Boundary Hardening — Version pinning, CI coverage for USC init, schema cache, governance feedback triage.
- **Task 258**: Product Surface Coherence Closure — Integrated review, changelog, residual list, commit boundary.

### Verification
- No code changes made (this is a planning task).
- `pnpm verify` not required.
- No derivative files created.

## Acceptance Criteria

- [x] Product Surface Coherence chapter boundary is defined.
- [x] Inventory artifact exists under `.ai/decisions/`.
- [x] Reduced DAG file exists under `.ai/do-not-open/tasks/`.
- [x] Minimal next-numbered follow-up task set exists.
- [x] The task set includes a chapter closure task.
- [x] Dependencies on prior chapters are explicit but compressed.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
