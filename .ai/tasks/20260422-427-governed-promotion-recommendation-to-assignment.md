---
status: closed
closed: 2026-04-22
depends_on: [426]
---

# Task 427 — Governed Promotion: Recommendation to Assignment

## Context

Task 426 implements `narada task recommend` as a read-only advisory surface. That is the correct first step: recommendation must not silently become assignment.

However, if recommendations remain only text, the operator still performs the same manual promotion:

```text
recommendation observed
  -> operator chooses one
  -> operator manually runs task claim / roster assign
  -> task/assignment/roster state changes
```

Narada already has a promotion-operator family: explicit, governed transitions from one lifecycle state to another. Recommendation-to-assignment should use that family rather than invent ad hoc automation.

This task designs the governed promotion path from advisory recommendation to durable assignment.

## Goal

Design a governed promotion operator that turns a selected assignment recommendation into a durable task assignment only after explicit operator approval.

The design must preserve:

- recommendation is advisory;
- assignment is authoritative task-governance mutation;
- dependencies still gate assignment;
- review separation and write-set risks remain visible;
- operator approval is explicit and audited.

## Required Work

### 1. Define source and target objects

Define the promotion source and target:

| Object | Role |
|--------|------|
| `TaskRecommendation` | Advisory source object from Task 426 |
| `AssignmentPromotionRequest` | Operator-selected request to promote a recommendation |
| `TaskAssignment` | Durable assignment record |
| Task front matter | Authoritative task status (`opened`/`needs_continuation` → `claimed`) |
| Roster entry | Agent tracking state (`idle`/`done` → `working`) |

Clarify which objects are durable and where each lives.

### 2. Define promotion authority

Specify required authority class.

Default expectation:

- read recommendation: `inspect` / no mutation authority;
- promote recommendation: `claim` or task-governance operator authority;
- override recommendation risks: `admin` or explicit `--override-risk` with audit.

The design must state whether `claim` is sufficient or whether this is a distinct `assign` authority.

### 3. Define lifecycle and validation

Define allowed promotion path:

```text
TaskRecommendation(status=recommended|possible)
  -> AssignmentPromotionRequest(status=requested)
  -> validated
  -> assignment written atomically
  -> task status claimed
  -> roster status working
  -> promotion status executed
```

Validation must re-check current state at promotion time:

- task still exists;
- task still `opened` or `needs_continuation`;
- dependencies still satisfied;
- agent still exists;
- agent still assignable;
- no active assignment exists for the task;
- write-set risk has not become blocking;
- recommendation has not expired, or operator explicitly overrides expiry.

### 4. Define audit record

Design an append-only promotion/audit record.

Required fields:

- `promotion_id`
- `recommendation_id` or deterministic recommendation snapshot hash
- `task_number`
- `agent_id`
- `requested_by`
- `requested_at`
- `executed_at`
- `status`: `requested`, `executed`, `rejected`, `stale`, `failed`
- `recommendation_snapshot`
- `validation_results`
- `override_reason`
- `assignment_id`

The audit must preserve the recommendation evidence even if task/roster state later changes.

### 5. Design CLI surface

Propose a CLI design. Candidate:

```bash
narada task promote-recommendation <recommendation-id> --by <operator-id>
```

or:

```bash
narada task assign --from-recommendation <recommendation-id> --by <operator-id>
```

The task must choose one canonical surface and explain why.

The surface must support:

- dry run;
- JSON output;
- override with explicit reason for stale/high-risk recommendations;
- no mutation when validation fails.

### 6. Relate to existing commands

Map the design to existing commands:

- `narada task recommend`
- `narada task claim`
- `narada task roster assign`
- assignment record writing
- dependency checks
- WorkResultReport flow from Task 425

Decide whether promotion should call existing claim/assignment helpers internally or create a new operator path that shares validation logic.

Avoid duplicate mutation logic.

### 7. Produce decision record

Create:

`.ai/decisions/20260422-427-governed-recommendation-promotion.md`

It must include:

- chosen object model;
- authority decision;
- lifecycle diagram;
- validation table;
- audit record shape;
- CLI surface decision;
- residual risks;
- implementation task recommendation if needed.

## Non-Goals

- Do not implement the promotion command.
- Do not auto-assign agents.
- Do not bypass `task claim`/assignment validation semantics.
- Do not make recommendations authoritative.
- Do not implement review routing.
- Do not mutate task, roster, assignment, report, or review files.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Decision record exists at `.ai/decisions/20260422-427-governed-recommendation-promotion.md`.
- [x] Design clearly separates recommendation, promotion request, assignment, task state, and roster state.
- [x] Authority class for promotion is explicit.
- [x] Validation re-checks current state at promotion time.
- [x] Audit record shape is append-only and preserves recommendation evidence.
- [x] CLI surface is chosen and justified.
- [x] Existing mutation helpers are reused or a clear non-duplication plan is documented.
- [x] No implementation code is changed.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
test -f .ai/decisions/20260422-427-governed-recommendation-promotion.md
rg -n "recommendation|promotion|assignment|authority|audit" .ai/decisions/20260422-427-governed-recommendation-promotion.md
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

## Execution Notes

### Review findings

The decision record was already present and complete. Review confirmed all required sections:

1. **Source/target objects** — Five-object model with durability/owner/authority table and diagram.
2. **Authority** — `claim` class chosen with clear rationale; `admin` only for dependency override.
3. **Lifecycle/validation** — State machine with 5 terminal states, 9-check validation table with overrideability matrix, atomicity guarantee.
4. **Audit record** — TypeScript schema, append-only storage path (`.ai/tasks/promotions/`), `recommendation_snapshot` for evidence preservation.
5. **CLI surface** — `promote-recommendation` chosen with 3 rejected alternatives documented.
6. **Existing command mapping** — Explicit delegation to `task claim` as the underlying primitive; non-duplication contract stated.
7. **Residual risks** — 5 risks with mitigations and residual gaps documented.
8. **Implementation recommendation** — 6-step implementation plan with ~200 LOC + ~300 LOC tests estimate.

### Verification results

```bash
test -f .ai/decisions/20260422-427-governed-recommendation-promotion.md  # ✅
rg -n "recommendation|promotion|assignment|authority|audit" .ai/decisions/20260422-427-governed-recommendation-promotion.md | wc -l  # 200+ matches
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print  # 0 results
```

### Action taken

- Marked task status `opened` → `closed`.
- Checked all acceptance criteria.
- No code changes required (design-only task).
- No derivative files found.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
