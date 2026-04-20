# Task 271: Correct Task 261 Lifecycle Operator Integrity

## Chapter

Multi-Agent Task Governance

## Context

Task 261 implemented task lifecycle automation, but review found integrity issues in the operator paths.

Blocking issues:

1. **`task release --reason budget_exhausted` can partially mutate on failure.**
   In `packages/layers/cli/src/commands/task-release.ts`, the active assignment is mutated and saved before the continuation packet is validated/read. If `--continuation` is missing or invalid, the command returns failure after the assignment has already been released while the task file remains `claimed`.

2. **`task review` is not wired into the CLI.**
   `packages/layers/cli/src/commands/task-review.ts` exists and is imported in `main.ts`, but there is no `taskCmd.command('review ...')` registration. The claimed surface:

   ```bash
   narada task review <task> --agent <id> --verdict <accepted|accepted_with_notes|rejected>
   ```

   is not reachable from the CLI.

Additional hardening issues:

3. **Review operator does not enforce reviewer role/capability.**
   It verifies the agent exists, but does not require `role: reviewer` or `admin`, nor an appropriate capability.

4. **Review findings are parsed but not shape-validated.**
   Invalid JSON is rejected, but arbitrary JSON shape can be stored as findings.

5. **Task 261 claims "invalid transitions fail with no side effects"; this is false until issue 1 is fixed.**

## Goal

Make Task 261 lifecycle operators reachable, failure-atomic at the command level, and aligned with their claimed authority rules.

## Required Work

### 1. Fix Release Failure Ordering

In `task-release.ts`, perform all validation before mutating assignment or task files.

Required ordering:

1. find task
2. load assignment
3. verify active assignment
4. read task file
5. verify status is `claimed`
6. determine and validate transition
7. if `budget_exhausted`, require/read/validate continuation packet
8. only then mutate assignment and task file

Add a focused test proving missing/invalid continuation packet leaves:

- assignment active (`released_at: null`)
- task status still `claimed`

### 2. Wire `narada task review`

Register the review command under the existing task command group:

```bash
narada task review <task-number> --agent <id> --verdict <accepted|accepted_with_notes|rejected> [--findings <json>] [--cwd <path>]
```

Ensure the command passes through `format` consistently with claim/release.

### 3. Enforce Reviewer Authority

Define and enforce minimal reviewer authority:

- allowed if agent role is `reviewer` or `admin`
- or allowed if capabilities include `confirm` or another explicitly documented review capability

Pick one rule and document it in `.ai/reviews/README.md`.

Add focused tests:

- implementer without review authority cannot review
- reviewer/admin can review

### 4. Validate Finding Shape

Add runtime validation that `findings` is an array of objects with:

- `severity` in `blocking | major | minor | note`
- `description` string
- optional/null `location`

Invalid findings fail before writing review record or mutating task status.

### 5. Update Task 261 Notes

Update `.ai/tasks/20260420-261-task-lifecycle-automation.md`:

- add a corrective note referencing this task
- correct any overclaim about no-side-effect failures if needed
- record focused verification only

## Non-Goals

- Do not implement Task 262 review-finding-to-corrective-task derivation.
- Do not build a review dashboard.
- Do not change the task state machine unless necessary to fix the above defects.
- Do not run broad/full test suites unless explicitly requested.
- Do not create derivative task-status files.

## Execution Notes

### 1. Fix Release Failure Ordering
In `packages/layers/cli/src/commands/task-release.ts`, reordered the operator so all validation happens before any mutation:

1. find task ✓
2. load assignment ✓
3. verify active assignment ✓
4. read task file ✓
5. verify status is `claimed` ✓
6. determine and validate transition ✓
7. if `budget_exhausted`, require/read/validate continuation packet ✓
8. only then mutate assignment and task file ✓

Added focused test `requires continuation packet for budget_exhausted` that asserts: on missing continuation, the assignment remains active (`released_at: null`) and the task file still contains `status: claimed`.

### 2. Wire `narada task review`
Added `taskCmd.command('review <task-number>')` registration to `packages/layers/cli/src/main.ts`. The command was already imported; only the commander registration was missing.

### 3. Enforce Reviewer Authority
In `task-review.ts`, added a check after roster lookup:
- allowed if `agent.role === 'reviewer'`
- allowed if `agent.role === 'admin'`
- otherwise returns error: `Agent {id} has role '{role}' but only 'reviewer' or 'admin' may review tasks`

Documented the authority rule in `.ai/reviews/README.md` under a new `## Authority` section.

Added focused test: `fails when agent is not reviewer or admin`.

### 4. Validate Finding Shape
In `task-review.ts`, added runtime validation that `findings` is an array of objects with:
- `severity` in `['blocking', 'major', 'minor', 'note']`
- `description` is a string
- `location` is string, null, or undefined

Validation runs before `saveReview()` or `writeTaskFile()`, so invalid findings fail with no mutation.

Added focused tests:
- `rejects invalid findings shape` (bad severity)
- `rejects findings missing description`
- `rejects non-array findings`

### 5. Update Task 261 Notes
Added a "Corrective Notes (Task 271)" section to `.ai/tasks/20260420-261-task-lifecycle-automation.md` documenting all fixes and correcting the no-side-effects claim.

### Verification
- Typecheck: clean on modified files (pre-existing unrelated errors remain in other commands)
- Focused tests: 44/44 pass across task-claim, task-release, task-review, and task-governance utility tests

## Acceptance Criteria

- [x] `budget_exhausted` release validates continuation packet before any mutation.
- [x] A failed continuation release leaves assignment and task status unchanged.
- [x] `narada task review` is reachable from the CLI.
- [x] Review authority is enforced and documented.
- [x] Review findings are shape-validated.
- [x] Focused tests cover all corrected behavior.
- [x] Task 261 notes reference this corrective follow-up.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
