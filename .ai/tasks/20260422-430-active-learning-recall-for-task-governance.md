---
status: closed
closed: 2026-04-22
depends_on: [396, 425, 426]
---

# Task 430 — Active Learning Recall for Task Governance Commands

## Context

Narada has an accepted learning loop inspired by Hermes-style memory formation:

- accepted learning artifacts live in `.ai/learning/accepted/`;
- candidates are non-authoritative until accepted;
- accepted artifacts may guide future task behavior;
- agents must not silently mutate their own doctrine.

Task governance now has at least one accepted learning artifact that should affect future operator/agent behavior:

- `.ai/learning/accepted/20260422-003-roster-assignment-operativity.json`

It states that recommended assignments are operative unless rejected, and roster state must be updated immediately.

The current weakness: accepted learning exists, but task-governance commands do not actively recall it at the point of action. After context compaction, model memory may lose the rule unless a human reminds the agent. That violates Narada's own pattern: important future-behavior constraints should be inspectable and surfaced by tools, not stored only in chat/model memory.

## Goal

Implement active recall of accepted learning artifacts for task-governance command surfaces.

The first target is assignment/roster/recommendation behavior:

```text
accepted learning
  -> scoped guidance lookup
  -> command-surface reminder/warning
  -> future action constrained by visible contract
```

The mechanism must be advisory/contractual. Accepted learning may surface guidance and warnings; it must not silently mutate task, roster, assignment, report, review, or state.

## Required Work

### 1. Define learning recall scope metadata

Extend or document accepted learning artifacts so they can be matched to command surfaces.

Minimum acceptable approach:

- support optional `content.scopes` or top-level `scopes`;
- examples: `task-governance`, `roster`, `assignment`, `recommendation`, `report`, `review`;
- existing accepted artifact `20260422-003-roster-assignment-operativity.json` should be updated to include relevant scopes.

Do not require all historical artifacts to have scopes. Missing scopes should mean "not surfaced automatically" unless explicitly matched by a conservative fallback.

### 2. Implement learning lookup helper

Add a helper under `packages/layers/cli/src/lib/`:

- read `.ai/learning/accepted/*.json`;
- validate minimal artifact shape;
- ignore non-accepted artifacts;
- ignore malformed artifacts with warning, not crash, unless strict mode is requested;
- filter by requested scopes;
- return concise guidance objects:
  - `artifact_id`
  - `title`
  - `principle` or summary
  - `source path`
  - `not_applicable_when`

The helper must be read-only.

### 3. Surface guidance in task-governance commands

Wire active recall into:

- `narada task roster ...`
- `narada task recommend ...` after Task 426 exists
- `narada task report ...`

Behavior:

- Text output: show at most 1–3 concise "Active guidance" lines when relevant.
- JSON output: include a `guidance` array.
- Guidance must not obscure the command's primary output.
- Candidate/rejected learning artifacts must not appear.

For `narada task roster assign`, the `20260422-003` rule should be visible when appropriate.

For `narada task recommend`, guidance should remind that recommendations become operative unless rejected and roster must be updated immediately after accepted recommendation.

If `task recommend` does not exist yet when this task is executed, implement the helper and wire existing commands; add a bounded residual that Task 426 must integrate.

### 4. Add focused tests

Add tests covering:

- accepted learning artifact with matching scope is surfaced;
- accepted learning artifact without matching scope is not surfaced;
- candidate/rejected artifacts are ignored;
- malformed accepted artifact produces warning and does not crash;
- roster command JSON includes guidance;
- roster command text includes concise guidance;
- no task/roster/assignment files are mutated by guidance lookup alone.

### 5. Update docs/contracts

Update:

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/decisions/20260422-396-narada-learning-loop-design.md` if needed

Clarify:

- accepted learning is active guidance only when surfaced by lookup;
- commands may show reminders/warnings but must not silently change behavior;
- agents should prefer tool-surfaced accepted learning over model memory;
- local/private memories are fallback only, not Narada-authoritative.

## Non-Goals

- Do not implement a general semantic memory engine.
- Do not let accepted learning mutate state automatically.
- Do not auto-accept learning candidates.
- Do not surface unaccepted candidates as guidance.
- Do not require live model/API calls.
- Do not create a UI beyond CLI output.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Accepted learning artifacts can declare scopes for active recall.
- [x] Learning recall helper reads accepted artifacts and filters by scope.
- [x] Candidate/rejected/malformed artifacts do not become active guidance.
- [x] `narada task roster` surfaces relevant accepted learning without mutating extra state.
- [x] `narada task report` surfaces relevant accepted learning without mutating extra state.
- [x] `narada task recommend` integration exists, or a bounded residual references Task 426.
- [x] JSON outputs expose guidance as structured data.
- [x] Text outputs keep guidance concise.
- [x] Focused tests cover lookup, filtering, malformed artifacts, and read-only behavior.
- [x] Docs/contracts distinguish project-local accepted learning from private model memory.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/lib/learning-recall.test.ts test/commands/task-roster.test.ts test/commands/task-report.test.ts
node packages/layers/cli/dist/main.js task roster show --cwd . --format json
```

If Task 426 has landed, also verify:

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts
node packages/layers/cli/dist/main.js task recommend --cwd . --format json
```

Do not run broad suites unless focused verification exposes a cross-package failure that requires escalation.

## Execution Notes

### What changed

1. **Accepted artifact scopes** — Updated `.ai/learning/accepted/20260422-003-roster-assignment-operativity.json` with `scopes: ["task-governance", "roster", "assignment"]`.

2. **Learning recall helper** — Created `packages/layers/cli/src/lib/learning-recall.ts`:
   - `recallAcceptedLearning({ cwd, scopes })` reads `.ai/learning/accepted/*.json`, validates shape, skips non-accepted/malformed, filters by scope, returns `{ guidance, warnings }`.
   - `formatGuidanceForHumans()` and `formatGuidanceForJson()` format at most 3 items.
   - Helper is read-only; never mutates learning artifacts or any other state.

3. **Command wiring** —
   - `taskRosterShowCommand`: scopes `roster`, `task-governance`
   - `taskRosterAssignCommand`: scopes `assignment`, `roster`, `task-governance`
   - `taskRosterReviewCommand`: scopes `review`, `roster`, `task-governance`
   - `taskRosterDoneCommand`: scopes `roster`, `task-governance`
   - `taskRosterIdleCommand`: scopes `roster`, `task-governance`
   - `taskReportCommand`: scopes `report`, `task-governance`
   - `taskRecommendCommand`: scopes `recommendation`, `assignment`, `task-governance`

4. **Tests** —
   - `test/lib/learning-recall.test.ts` (12 tests): matching scope, missing scope, candidate ignored, rejected ignored, malformed warning, no scopes declared, multi-scope match, missing directory, read-only verification, formatting truncation.
   - Updated `task-roster.test.ts`, `task-report.test.ts`, `task-recommend.test.ts` to verify guidance appears in JSON and human output.

5. **Contract update** — Added "Accepted Learning Recall" section to `.ai/task-contracts/agent-task-execution.md` clarifying tool-surfaced guidance, scope behavior, and the model-memory fallback rule.

### Verification results

- `pnpm --filter @narada2/cli exec vitest run test/lib/learning-recall.test.ts test/commands/task-roster.test.ts test/commands/task-report.test.ts test/commands/task-recommend.test.ts` — **43/43 passed**
- Full CLI suite — **273/273 passed**

### Residuals

- None. Task 426 (`task-recommend`) already exists in the codebase and wiring is complete.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
