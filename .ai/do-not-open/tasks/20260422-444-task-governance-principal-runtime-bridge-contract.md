---
status: closed
closed: 2026-04-22
depends_on: [406, 412, 425, 426]
---

# Task 444 — Task Governance / PrincipalRuntime Bridge Contract

## Context

Narada now has two related but distinct actor-state systems:

1. **Task governance** — durable file-backed work lifecycle:
   - task front matter;
   - assignment records;
   - roster status;
   - WorkResultReports;
   - reviews.

2. **PrincipalRuntime** — ephemeral/advisory runtime actor state:
   - availability;
   - attachment posture;
   - claiming/executing/waiting_review;
   - budget exhaustion;
   - runtime health.

The systems must not collapse:

- task files remain authoritative for task lifecycle;
- assignments remain task-governance records;
- PrincipalRuntime remains advisory/ephemeral;
- deleting PrincipalRuntime records must not destroy durable task state;
- PrincipalRuntime state must not grant authority.

But they should not remain disconnected forever. If an agent submits a WorkResultReport, the runtime actor should be able to move to `waiting_review`. If review accepts/rejects the report, the actor should be able to return to available/interact state. If budget is exhausted, the actor should reflect that and make handoff visible.

This task defines the bridge contract. It must create a separate implementation task if implementation is justified.

## Goal

Define how task-governance events may update or consult PrincipalRuntime state without making PrincipalRuntime authoritative over tasks.

The bridge should make the multi-agent build-out loop more observable and less manual while preserving authority separation.

## Required Work

### 1. Read source artifacts

Read:

- `.ai/decisions/20260422-406-principal-runtime-state-machine.md`
- `.ai/decisions/20260422-412-principal-runtime-integration-contract.md`
- `.ai/do-not-open/tasks/20260422-425-work-result-report-governance-primitive.md`
- `.ai/do-not-open/tasks/20260422-426-assignment-recommendation-implementation.md`
- `packages/layers/control-plane/src/principal-runtime/types.ts`
- `packages/layers/control-plane/src/principal-runtime/state-machine.ts`
- `packages/layers/control-plane/src/principal-runtime/registry.ts`
- `packages/layers/cli/src/commands/task-claim.ts`
- `packages/layers/cli/src/commands/task-release.ts`
- `packages/layers/cli/src/commands/task-report.ts`
- `packages/layers/cli/src/commands/task-review.ts`
- `packages/layers/cli/src/commands/task-roster.ts`

### 2. Produce bridge decision record

Create:

`.ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md`

It must define:

- bridge direction;
- event mapping;
- transition ownership;
- failure behavior;
- storage boundaries;
- CLI integration points;
- residual risks;
- whether implementation should proceed.

### 3. Define event-to-transition mapping

Evaluate at least these mappings:

| Task Governance Event | Candidate PrincipalRuntime Effect |
|-----------------------|-----------------------------------|
| `task roster assign` | no transition, or `available → attached_interact`/`claiming` |
| `task claim` | `available/attached_interact → claiming` then maybe `executing` |
| `task report` | `executing → waiting_review` |
| `task review accepted` | `waiting_review → attached_interact` or `available` |
| `task review rejected` | `waiting_review → attached_interact` or `available` with warning |
| `task release budget_exhausted` | any active state → `budget_exhausted` |
| `task roster done` without WorkResultReport | warning only; no runtime transition |
| `task roster idle` | runtime transition only if explicit detach/availability command exists |

For each mapping, decide:

- whether it should exist;
- whether it is automatic, optional, or warning-only;
- which command owns the transition;
- what happens if PrincipalRuntime record is missing;
- what happens if PrincipalRuntime transition is invalid.

### 4. Define bridge invariants

Required invariants:

- Missing PrincipalRuntime must not block task-governance commands.
- PrincipalRuntime transition failure must not partially mutate task files.
- Task lifecycle mutations must complete or fail independently of PrincipalRuntime.
- PrincipalRuntime updates are post-commit advisory updates unless the command is explicitly a PrincipalRuntime command.
- If task mutation succeeds but PrincipalRuntime update fails, command should warn and record residual evidence if appropriate.
- PrincipalRuntime must never create, claim, close, review, or assign tasks by itself.
- Roster and PrincipalRuntime may diverge; divergence should be observable.

### 5. Define implementation shape

Specify whether implementation should be:

- best-effort post-commit hook in task commands;
- explicit `--update-principal-runtime` option;
- separate reconciliation command, e.g. `narada principal sync-from-tasks`;
- hybrid.

Choose one and justify it.

The design must decide where PrincipalRuntime state is located for task-governance commands:

- config-adjacent registry;
- repo-local `.ai/principals`;
- explicit `--principal-state-dir`;
- inherited from existing CLI PrincipalRuntime registry semantics.

### 6. Create implementation task if justified

If implementation should proceed, create the next available task file after this task:

`Task NNN — Implement Task Governance / PrincipalRuntime Bridge`

The implementation task must be self-standing and include:

- exact command files to edit;
- precise mappings to implement;
- fallback behavior;
- focused tests;
- non-goals.

Do not implement the bridge in this task.

## Non-Goals

- Do not implement bridge code in this task.
- Do not make PrincipalRuntime authoritative over task lifecycle.
- Do not merge roster and PrincipalRuntime.
- Do not make PrincipalRuntime required for task commands.
- Do not auto-assign tasks.
- Do not implement SiteAttachment.
- Do not change scheduler/foreman authority.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Execution Notes

- Decision record created at `.ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md`.
- All source artifacts read: Decision 406, Decision 412, Task 425, Task 426, PrincipalRuntime types/state-machine/registry, and all CLI task commands (claim, release, report, review, roster, principal).
- Event-to-transition mapping defined for 10 governance events with auto/opt/warn classification.
- 8 bridge invariants specified, including divergence observability.
- Storage boundary resolution: `cwd` default + `--principal-state-dir` override + `NARADA_PRINCIPAL_STATE_DIR` env fallback.
- Implementation shape chosen: **hybrid** (post-commit hooks + reconciliation command), justified in §7.2.
- Implementation task created: **Task 456** — `.ai/do-not-open/tasks/20260422-456-implement-task-governance-principal-runtime-bridge.md`.
- No bridge code implemented in this task.
- Registry updated: `last_allocated` → 456.

## Acceptance Criteria

- [x] Decision record exists at `.ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md`.
- [x] Event-to-transition mapping is explicit.
- [x] Bridge invariants preserve PrincipalRuntime as advisory/ephemeral.
- [x] Missing/invalid PrincipalRuntime behavior is specified.
- [x] Implementation shape is chosen and justified.
- [x] A self-standing implementation task is created if implementation should proceed.
- [x] No bridge code is implemented in this task.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
test -f .ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md
rg -n "task report|task review|PrincipalRuntime|waiting_review|budget_exhausted|advisory|post-commit" .ai/decisions/20260422-444-task-governance-principal-runtime-bridge.md
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

If only Markdown files are changed, do not run broad test suites.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
