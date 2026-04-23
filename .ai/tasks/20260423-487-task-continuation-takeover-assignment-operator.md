---
status: closed
created: 2026-04-23
owner: unassigned
depends_on: [480, 486]
closed_at: 2026-04-23T14:31:57.197Z
closed_by: a2
---

# Task 487 - Task Continuation / Takeover Assignment Operator

## Context

`task roster assign` now claims `opened` and `needs_continuation` tasks by default. This fixed the common split-brain case where the roster said an agent was working but the task file stayed `opened`.

There is still an ambiguous case: an already-claimed task may need another agent to continue, repair evidence, review-and-fix, or take over from a blocked agent. Today `task roster assign <n> --agent <id>` handles that by updating the roster and warning:

```text
Task ... is already claimed; roster updated without re-claiming
```

That is mechanically useful but semantically weak. It does not record why the second agent is attached, whether this is continuation, takeover, evidence repair, or review/fix work, and it does not make assignment history useful for later evidence and routing.

## Goal

Add an explicit continuation/takeover assignment operator for already-claimed or continuation-ready tasks.

Suggested command shape:

```bash
narada task continue <task-number> --agent <id> --reason evidence_repair
```

or, if the existing command grouping is preferred:

```bash
narada task roster continue <task-number> --agent <id> --reason evidence_repair
```

The command must make `a3:483`-style work mechanically representable as continuation/evidence repair, not a silent roster overwrite.

## Read First

- `.ai/task-contracts/agent-task-execution.md`
- `AGENTS.md` Task Assignment and Claim Semantics
- `.ai/tasks/20260422-480-atomic-roster-assignment-claims-task.md`
- `.ai/tasks/20260423-486-agent-completion-finalizer-report-evidence-roster-handoff.md`
- `.ai/tasks/assignments/README.md`
- `packages/layers/cli/src/commands/task-roster.ts`
- `packages/layers/cli/src/commands/task-claim.ts`
- `packages/layers/cli/src/commands/task-report.ts`
- `packages/layers/cli/src/lib/task-governance.ts`

## Non-Goals

- Do not make continuation equivalent to task closure.
- Do not erase or rewrite historical assignment records.
- Do not create multiple active claims without an explicit representation of continuation/takeover semantics.
- Do not bypass the evidence/report/review gates from Task 486.
- Do not infer ownership from chat alone once this operator exists.

## Required Work

1. Define continuation semantics.
   - Supported input statuses should include at least:
     - `claimed`;
     - `needs_continuation`.
   - Decide whether `opened` should be rejected with guidance to use normal assignment instead.
   - Define allowed reasons, for example:
     - `evidence_repair`;
     - `review_fix`;
     - `handoff`;
     - `blocked_agent`;
     - `operator_override`.
   - Define whether the existing active assignment remains active, is released, or is superseded for each reason.

2. Extend assignment records.
   - Record continuation/takeover intent durably in `.ai/tasks/assignments/`.
   - Preserve old assignment history.
   - Avoid fabricating a fresh primary claim unless the semantics explicitly release/supersede the prior active assignment.
   - Include at minimum:
     - agent id;
     - timestamp;
     - reason;
     - previous active assignment reference if present;
     - whether prior assignment remains active, is released, or is superseded.

3. Implement the CLI operator.
   - Add the command under the chosen namespace.
   - Validate task existence, status, agent existence, and reason.
   - Update roster to show the continuation agent is working on the task.
   - Update assignment history atomically and safely.
   - Produce clear human and JSON output.

4. Preserve lifecycle boundaries.
   - Do not transition `claimed` tasks back to `opened`.
   - If a task is `needs_continuation`, transition to `claimed` only when the continuation agent becomes the active owner.
   - Do not close, review, or report from this command.
   - Keep `task finish` responsible for final report/evidence/roster handoff.

5. Update downstream consumers.
   - Ensure `task report` can identify the correct active/continuation assignment for the reporting agent.
   - Ensure evidence/report history can distinguish original implementer from continuation/evidence-repair agent.
   - Ensure recommendation or roster inspection output does not misrepresent continuation as a brand-new normal claim.

6. Add tests.
   - Continue an already-claimed task for `evidence_repair`.
   - Take over a `needs_continuation` task and transition it to `claimed` if that is the chosen rule.
   - Reject invalid reasons.
   - Reject unrelated statuses when appropriate.
   - Preserve prior assignment history.
   - Keep roster and assignment files consistent.
   - Prove `task report` works for the continuation agent.

7. Update docs/contracts.
   - Update `AGENTS.md` Task Assignment and Claim Semantics.
   - Update `.ai/task-contracts/agent-task-execution.md`.
   - Update `.ai/tasks/assignments/README.md` with continuation/takeover record shape.

## Execution Notes

### Type Extensions
- Extended `TaskAssignment` in `task-governance.ts` with:
  - `continuation_reason`: why this assignment is a continuation
  - `previous_agent_id`: reference to the prior active agent
  - `release_reason` expanded to include `'continued'`
- Added `TaskContinuation` and `TaskAssignmentRecord.continuations` for tracking secondary agents without superseding the primary assignment.
- Added `getActiveContinuation()` helper to find active continuations by agent.

### CLI Command
- Created `packages/layers/cli/src/commands/task-continue.ts` with `taskContinueCommand`.
- Supported reasons: `evidence_repair`, `review_fix`, `handoff`, `blocked_agent`, `operator_override`.
- Semantics:
  - `evidence_repair` / `review_fix`: prior assignment stays active; new agent added to `continuations`.
  - `handoff` / `blocked_agent` / `operator_override`: prior assignment released as `continued`; new agent becomes primary.
- Rejects `opened` tasks with guidance to use `task claim` instead.
- Transitions `needs_continuation` → `claimed` when continuation becomes active owner.
- Wired as `narada task continue <task-number> --agent <id> --reason <reason>` in `main.ts`.

### Task Report Integration
- Updated `packages/layers/cli/src/commands/task-report.ts`:
  - Accepts reports from both primary active assignment agent AND continuation agents.
  - Primary agent report: normal flow (releases assignment, transitions to `in_review`).
  - Continuation agent report: marks continuation as `completed_at`, does NOT release primary assignment or change task status.

### Tests
- Created `packages/layers/cli/test/commands/task-continue.test.ts` (10 tests):
  - evidence_repair continues claimed task without releasing prior
  - handoff takeover releases prior and creates new primary
  - blocked_agent on needs_continuation transitions to claimed
  - rejects invalid reasons
  - rejects opened tasks with guidance
  - rejects self-continuation
  - preserves prior assignment history
  - updates roster accurately
  - continuation agent can submit report without disrupting primary
  - primary agent can still report normally after continuation

### Docs
- Updated `.ai/tasks/assignments/README.md` with continuation record shape.
- Updated `AGENTS.md` Task Assignment and Claim Semantics table + continuation section.
- Updated `.ai/task-contracts/agent-task-execution.md` with continuation agent guidance.

## Verification

```bash
cd /home/andrey/src/narada
pnpm --filter @narada2/cli exec vitest run test/commands/task-continue.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/task-roster.test.ts test/commands/task-report.test.ts
pnpm --filter @narada2/cli typecheck
pnpm verify
```

**Results:**
- `task-continue.test.ts`: 10 passed
- `task-roster.test.ts`: 26 passed
- `task-report.test.ts`: 8 passed
- `task-governance.test.ts`: 30 passed
- `pnpm --filter @narada2/cli typecheck`: passed
- `pnpm verify`: all 5 steps passed

## Acceptance Criteria

- [x] A continuation/takeover CLI operator exists.
- [x] Already-claimed tasks can be assigned to a continuation agent with explicit reason.
- [x] Assignment history records continuation/takeover without erasing prior history.
- [x] Roster state reflects the continuation agent accurately.
- [x] `needs_continuation` handling is explicit and tested.
- [x] `task report` can accept reports from the continuation agent when appropriate.
- [x] Invalid status/reason cases fail without mutation.
- [x] Documentation distinguishes normal assignment, claim, continuation, takeover, report, review, and finish.
- [x] Verification evidence is recorded in this task.

## Residuals / Deferred Work

- PrincipalRuntime/agent-runtime synchronization for continuation metadata deferred; current PrincipalRuntime bridge only handles `task_claimed` and `task_reported` events.
- `--from-report <report-id>` linkage for `review_fix` continuations may be added later.
- Automatic continuation recommendation (e.g., suggest `evidence_repair` when report identifies gaps) may be added later.



