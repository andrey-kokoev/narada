---
status: confirmed
closed: 2026-04-22
depends_on: [408]
---

## Chapter

Construction Operation

# Task 410 — Construction Operation Boundary Contract

## Assignment

Define the boundary contract for the Construction Operation: how the human-architect-agent development loop maps to Narada's Aim/Site/Cycle/Act/Trace model, and what is in scope vs. out of scope for this chapter.

## Required Reading

- `.ai/decisions/20260422-408-construction-operation-readiness.md`
- `SEMANTICS.md` §2.14 (Aim/Site/Cycle/Act/Trace)
- `.ai/decisions/20260422-397-session-attachment-semantics.md`
- `.ai/decisions/20260422-406-principal-runtime-state-machine.md`

## Context

The Construction Operation is a Narada Operation whose Aim is to advance a system by governed task-graph execution while preserving long-horizon coherence. It runs at a Site (the local filesystem + SQLite coordinator). Each sync/dispatch cycle of the daemon is a Cycle. Task claims, releases, and reviews are Acts. Evaluations, decisions, and execution attempts are Traces.

What is not yet defined is the explicit boundary: which parts of the development loop are Narada-governed, which are operator-governed, and which are architect-governed.

## Concrete Deliverables

1. Decision artifact at `.ai/decisions/20260422-410-construction-operation-boundary-contract.md` containing:
   - Aim statement for the Construction Operation
   - Site definition (what substrate it runs on)
   - Cycle definition (what constitutes one cycle of the Operation)
   - Act taxonomy (what actions are performed, by whom, under what authority)
   - Trace taxonomy (what is recorded, for how long, who can read it)
   - In-scope / out-of-scope table
   - Authority matrix (operator / architect / agent / system)

2. Update to `SEMANTICS.md` by reference only if a new term is needed.

## Explicit Non-Goals

- Do not implement any code.
- Do not change existing task lifecycle semantics.
- Do not create a new database schema.
- Do not define assignment recommendation algorithm (Task 411).

## Acceptance Criteria

- [x] Decision artifact exists.
- [x] Aim statement is specific and does not smear into adjacent Operations.
- [x] Authority matrix clearly separates operator, architect, agent, and system roles.
- [x] In-scope/out-of-scope table is exhaustive for this chapter.
- [x] No new terms conflict with existing canonical terminology.
- [x] No implementation code is added.

## Verification Scope

Review by operator or architect. No automated tests required.

## Execution Notes

### Write Set

- `.ai/decisions/20260422-410-construction-operation-boundary-contract.md` — new decision artifact

### Content

The boundary contract defines:

1. **Aim**: "Advance a software system through governed, task-graph execution while preserving long-horizon coherence." Explicitly bounded against mailbox, marketing, USC, and process-execution Operations.
2. **Site**: Local filesystem Site with `.ai/do-not-open/tasks/`, `.ai/agents/roster.json`, assignment records, review records, and registry. No daemon or cloud substrate required.
3. **Cycle**: One bounded pass through scan → recommend → claim → execute → review → confirm. Conceptual unit, not a daemon heartbeat.
4. **Act taxonomy**: 12 governed actions with authority classes (`claim`, `resolve`, `execute`, `propose`, `confirm`, `admin`, `derive`).
5. **Trace taxonomy**: 10 trace types with durability, retention, and readership rules.
6. **In-scope / out-of-scope**: 7 in-scope capabilities (Tasks 410–415), 8 out-of-scope capabilities (deferred to post-415), 4 permanent exclusions.
7. **Authority matrix**: 4 roles × 15 actions with explicit yes/no/notes.

### Terminology Check

- Uses existing SEMANTICS.md §2.14 terms: Aim, Site, Cycle, Act, Trace.
- No new canonical terms introduced.
- "Construction Operation" is a proper name for this chapter's Aim; it does not overload existing vocabulary.

### Residual

- None. This is a pure boundary-contract task with no deferred work from this artifact.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
