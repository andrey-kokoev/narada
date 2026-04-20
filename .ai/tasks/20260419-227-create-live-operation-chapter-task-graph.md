# Task 227: Create Live Operation Chapter Task Graph

## Chapter

Live Operation

## Contracts

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/task-contracts/chapter-planning.md`

## Why

The Operator Closure chapter made Narada's operator families and authority boundaries coherent. The next chapter should prove that the machinery can run one useful operation end-to-end.

The target first live operation is a mailbox support/helpdesk operation for `help@global-maxima.com`.

This task is not to implement the operation directly. It is to create the disciplined task graph for the chapter so implementation agents can proceed without inventing scope locally.

## Goal

Produce a small, ordered set of implementation tasks that take Narada from coherent operator machinery to a working mailbox support operation.

The chapter should force the intended system path:

```text
source delta
→ fact
→ context
→ work item
→ charter evaluation
→ foreman decision
→ intent / outbound command
→ managed draft
→ inspection
```

## Required Work

### 1. Inventory Current Runtime Readiness

Create a compact inventory of what already exists and what is missing for the mailbox support operation.

Cover at minimum:

- mailbox sync/config readiness
- fact/context derivation readiness
- work item opening/readiness
- charter runtime and runner readiness
- support-oriented charter/profile readiness
- draft-first outbound readiness
- operator inspection/status readiness
- ops-repo/private-data boundary readiness

Write the inventory to:

```text
.ai/decisions/20260419-227-live-operation-chapter-inventory.md
```

### 2. Define Chapter Acceptance Path

Define the exact end-to-end acceptance scenario for the first vertical:

- operation: `help@global-maxima.com` mailbox support
- input: an existing or latest relevant thread in the mailbox
- output: a managed draft reply, not a sent message
- confirmation: durable records and inspection surfaces show what happened

The scenario must be specific enough that later tasks can verify it without guessing.

### 3. Create Minimal Follow-Up Tasks

Create next-numbered task files for the chapter. Use the smallest non-overlapping set that gets to the acceptance scenario.

Likely task areas:

- ops repo config/runtime readiness for `help@global-maxima.com`
- support charter/runtime invocation path
- work derivation from synced/stored mailbox facts
- draft proposal to managed draft through foreman/outbound handoff
- inspection/status command or documented runbook for the live operation
- final vertical smoke test using a real or fixture-backed mailbox thread

Do not create broad architecture tasks unless they are required for the live operation.

### 4. Produce Reduced DAG

Add a reduced DAG showing dependencies between the created tasks.

Required location:

```text
.ai/tasks/20260419-228-232.md
```

Use Mermaid.

### 5. Keep Task Scope Honest

If a desired capability is not needed for the first live operation, explicitly defer it rather than adding it to this chapter.

Examples likely deferred:

- broad advisory routing runtime beyond `continuation_affinity`
- multi-vertical operation demos
- autonomous send
- production UI polish
- generalized knowledge-base ingestion unless needed for the first support thread

## Non-Goals

- Do not implement the mailbox operation in this task.
- Do not run live mailbox mutation commands.
- Do not send email.
- Do not create private operational data in the public repo.
- Do not create derivative task-status files.

## Verification

Minimum:

```bash
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

Focused proof:

- inventory exists and distinguishes existing vs missing runtime pieces
- follow-up tasks are next-numbered and non-overlapping
- reduced DAG is present
- no task requires sending mail as part of the first chapter

## Reduced DAG

See `.ai/tasks/20260419-228-232.md`.

## Deferred Capabilities

The following are explicitly deferred from the Live Operation chapter:

| Capability | Why Deferred |
|------------|--------------|
| Autonomous send (`require_human_approval: false`) | First live operation must remain draft-only for safety. |
| Multi-vertical operation demos | Prove one vertical first. |
| Production UI polish (real-time updates, graphs, audit log page) | Functional correctness before UX refinement. |
| Generalized knowledge-base RAG / vector search | Direct file inclusion is sufficient for first operation. |
| Broad advisory routing runtime beyond `continuation_affinity` | Not required for single-thread support operation. |
| Secondary charter arbitration | Only primary charter is invoked live. |
| Non-mail outbound actions (Zendesk, CRM tickets) | Mail vertical only for first live operation. |
| Cross-context customer grouping | Not required for single-thread support operation. |
| Attachment handling in drafts | Not required for text-based support replies. |
| Time-series / trend views | Current-state inspection is sufficient. |

## Definition Of Done

- [x] Live Operation inventory artifact exists.
- [x] First acceptance scenario is explicit.
- [x] Minimal next-numbered follow-up task set exists.
- [x] Reduced DAG is included.
- [x] Deferred items are explicitly named.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
