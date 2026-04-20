# Task 264: Runtime/USC Boundary Hardening and Chapter Closure

## Chapter

Multi-Agent Task Governance

## Context

Narada runtime (daemon, control plane, scheduler, workers) and Narada.USC static grammar (task graphs, plans, charters, domain packs) are conceptually separate but occasionally conflated in documentation and implementation. For example:

- `AGENTS.md` describes both runtime verification policy and static task execution policy.
- The USC bridge (`usc-init.ts`) dynamically loads USC packages at runtime with no version contract.
- Task affinity fields (Task 263) are static schema; the claim operator consumes them as advisory signals.
- Review findings (Task 262) are static schema; the corrective task derivation is an operator.
- Assignment state (Task 260) is mutated by operators, not by static grammar.

After Tasks 260-263 define the governance mechanics, the boundary between runtime and static grammar must be made explicit.

## Goal

Write the definitive boundary document and close the Multi-Agent Task Governance chapter.

## Required Work

### 1. Runtime / USC Boundary Document

Create a document at `docs/runtime-usc-boundary.md` (or update `SEMANTICS.md` / `AGENTS.md`) that explicitly states:

**Narada Runtime owns:**
- Durable state (facts, work items, leases, execution attempts, intents)
- Effect execution (Graph API calls, process spawns, webhook handling)
- Crash recovery and replay determinism
- Lease acquisition, renewal, and stale recovery
- Observation API (read-only projection of durable state)

**Narada.USC Static Grammar owns:**
- Task definitions, graphs, and lifecycle schemas
- Charter definitions, prompts, and capability envelopes
- Plan commands and executor adapters
- Domain packs and prior definitions
- Agent authority class schemas

**Narada proper tooling / operators own:**
- Task claim, release, allocate, derive, close, confirm
- Assignment record mutation
- Chapter closure mutation
- Number allocation
- Review acceptance / rejection

**The bridge between them must be:**
- Explicit: every cross-boundary call must be named and documented.
- Versioned: USC packages loaded at runtime must declare a compatibility version.
- Testable: boundary contracts must have fixture-based tests.
- One-directional: runtime/tooling may read static grammar; static grammar must never assume runtime state or operator behavior.
- Authority-separated: static grammar defines what a task, finding, roster entry, or chapter is. Operators perform transitions. No static package owns claim, release, allocate, close, execute, or confirm behavior.

### 2. Version Contract for USC Bridge

Add a version check to the USC initialization path:
- USC packages declare `naradaCompatibility: "^0.1.0"` in their manifest.
- `usc-init.ts` verifies compatibility before loading.
- On mismatch, emit a clear error with upgrade instructions.

### 3. Chapter Closure

Perform the chapter closure ritual:

1. Verify all tasks 259-263 are complete.
2. Review all decisions, tasks, and code changes for boundary violations.
3. Write `.ai/decisions/20260420-264-multi-agent-task-governance-closure.md` containing:
   - Summary of capabilities delivered
   - List of deferred gaps
   - Residual risks
   - Commit boundary (hash range)
4. Update `CHANGELOG.md` with the chapter summary.
5. Update `AGENTS.md` to reference the new boundary document.

## Non-Goals

- Do not rewrite the kernel spec (`00-kernel.md`).
- Do not change runtime behavior unless a boundary violation is found.
- Do not create new USC domain packs.

## Execution Notes

Task 264 remained a plan-only artifact after Tasks 260-263 completed. Task 281 (this corrective task) executed the missing closure work:

1. Created `docs/runtime-usc-boundary.md` with four ownership classes (Static Schema, Pure Tools, Operators, Runtime), bridge properties, and concrete boundary table.
2. Updated `AGENTS.md` Documentation Index to reference the boundary document.
3. Created `.ai/decisions/20260420-264-multi-agent-task-governance-closure.md` with capabilities delivered (260-263 + corrections 268/271/274/280), deferred gaps, residual risks, and explicit closure statement. Commit boundary is explicitly deferred.
4. Updated `CHANGELOG.md` with `## Multi-Agent Task Governance` chapter entry.
5. Verified no boundary violations in Tasks 259-263 artifacts: static schema lives in task files and schemas; operators live in CLI commands; runtime does not mutate task files.

The USC version compatibility check was already implemented in Tasks 257/279 (`config.uscVersion`, `checkUscVersion()`, schema cache fallback). Task 264's acceptance criterion on version check is satisfied by prior work.

## Verification Evidence

- `pnpm verify` — typecheck passes (no code changes in this task).
- New files inspected for coherence: `docs/runtime-usc-boundary.md`, `.ai/decisions/20260420-264-multi-agent-task-governance-closure.md`.
- `AGENTS.md` and `CHANGELOG.md` inspected for correct linking and formatting.
- No derivative task-status files created.

## Bounded Deferrals

- Commit boundary (hash range) not established in this closure. Deferred to future chapter inventory task.
- Race-safe allocator remains a known gap; deferred to future governance hardening task.
- Broader routing signals (priority, deadline, skill matching) deferred.

## Acceptance Criteria

- [x] Runtime/USC boundary document exists and is referenced from `AGENTS.md`.
- [x] USC bridge has a version compatibility check. *(Implemented in Tasks 257/279)*
- [ ] Chapter closure artifact exists with summary, deferrals, residuals, and commit boundary. *(Commit boundary explicitly deferred — not satisfied)*
- [x] `CHANGELOG.md` updated.
- [x] No boundary violations remain in Tasks 259-263 artifacts.
