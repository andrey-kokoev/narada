---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T19:18:00.000Z
closed_by: codex
governed_by: task_review:codex
depends_on: [463, 474, 486]
---

# Task 501 - Governed Task Artifact Terminal-State Ownership

## Context

Tasks 463, 474, and 486 hardened the **governed completion path**:

- `task evidence`
- `task roster done`
- `task finish`
- `task review`
- `task close`

But a real gap remains: an agent can still edit a task file directly and set terminal front matter such as:

```yaml
status: closed
closed_at: ...
```

without passing through the governed operators.

That means Narada currently protects the official mutation path but still tolerates a raw-markdown bypass path. The result is invalid terminal artifacts such as:

- `status: closed` with no verification
- impossible timestamps (`closed_at` before `created`)
- terminal state with no review/closure evidence
- agent chat claiming "done" while the file was mutated directly

This is not a documentation nuisance. It is a task-governance authority leak.

## Goal

Make direct raw task-file mutation into terminal lifecycle state mechanically non-admissible, or at minimum mechanically impossible to miss.

The target is:

- official operators remain the only admissible terminal-state path;
- raw direct terminal edits are detected as invariant violations;
- and completion/review/closure surfaces refuse to treat such artifacts as valid.

## Read First

- `.ai/do-not-open/tasks/20260422-463-task-completion-evidence-and-closure-enforcement.md`
- `.ai/do-not-open/tasks/20260422-474-governed-task-closure-invariant.md`
- `.ai/do-not-open/tasks/20260423-486-agent-completion-finalizer-report-evidence-roster-handoff.md`
- `.ai/task-contracts/agent-task-execution.md`
- `docs/governance/task-graph-evolution-boundary.md`
- `packages/layers/cli/src/lib/task-governance.ts`
- `packages/layers/cli/src/commands/task-close.ts`
- `packages/layers/cli/src/commands/task-review.ts`
- `packages/layers/cli/src/commands/task-finish.ts`

## Scope

This task owns task-artifact terminal-state ownership:

- who may produce terminal task-state mutations,
- how such mutations are recognized,
- how bypass is detected,
- and how the CLI/lint/evidence surfaces should respond.

It does **not** own a broad redesign of task governance or a database replacement for task files.

## Required Work

1. Define terminal-state ownership explicitly.
   State, in authoritative docs and/or code contract, that terminal task lifecycle mutation is governed by:
   - `task close`
   - `task review accepted` when closure gates are satisfied
   - `chapter close --finish` for chapter-level promotion to `confirmed`

   Raw markdown edits are not authoritative just because the YAML changed.

2. Add a machine-detectable signal that a terminal mutation came through a governed path.
   Pressure-test the smallest admissible mechanism, for example:
   - required governed metadata fields,
   - closure provenance fields,
   - review/closure artifact linkage,
   - or another durable marker that operators own.

   The mechanism must make it possible to distinguish:
   - valid direct close through governed operator
   - invalid raw file mutation

3. Harden evidence/lint surfaces against bypass.
   At minimum:
   - `task evidence` should surface raw terminal mutation bypass as an explicit invariant violation, not just generic `needs_closure`
   - `task lint` should report it as an error
   - chapter closure / task recommendation / roster completion surfaces should not treat such tasks as valid terminal work

4. Add at least one operator-facing repair path.
   If a task is terminal-by-front-matter but invalid-by-governance provenance, Narada should provide a bounded next step:
   - reopen/repair,
   - re-close through governed operator,
   - or produce a corrective closure path

5. Add focused tests for the bypass case.
   Use temp repos and explicit raw file edits to prove:
   - raw `status: closed` without governed provenance is invalid
   - governed `task close` remains valid
   - impossible terminal timestamps are surfaced
   - review/closure/recommendation paths do not overclaim completion

## Non-Goals

- Do not ban task-file editing generally.
- Do not move task artifacts into SQLite.
- Do not invent cryptographic signing unless absolutely required.
- Do not create a web UI.
- Do not weaken the governed operator path.

## Acceptance Criteria

- [x] Terminal-state ownership is stated explicitly in canonical contract/docs.
- [x] There is a machine-detectable distinction between governed terminal mutation and raw bypass.
- [x] `task evidence` and `task lint` surface raw terminal bypass as a specific invariant violation.
- [x] At least one repair path exists for invalid terminal tasks.
- [x] Focused tests prove raw terminal bypass is caught and governed closure still passes.
- [x] Verification evidence is recorded in this task.

## Execution Notes

### Implementation Summary

1. **Governed provenance mechanism** — Added `governed_by` to `TaskFrontMatter` and `hasGovernedProvenance()` helper in `task-governance.ts`.
   - New marker: `governed_by: task_close:<operator>`, `task_review:<agent>`, `chapter_close:<operator>`
   - Backward compatibility: accepts `closed_by`+`closed_at`, review records, and closure decisions as valid provenance for pre-501 tasks.

2. **Governed operators updated**:
   - `taskCloseCommand` sets `governed_by: task_close:<closed_by>`
   - `taskReviewCommand` sets `governed_by: task_review:<agent_id>` + `closed_by`/`closed_at` on accepted review
   - `chapterCloseCommand` sets `governed_by: chapter_close:<by>` when transitioning to `confirmed`

3. **Bypass detection**:
   - `inspectTaskEvidence()` reports `terminal_without_governed_provenance` violation for terminal tasks lacking provenance
   - `lintTaskFiles()` and `lintTaskFilesForRange()` report `terminal_without_governed_provenance` as an error
   - State machine updated to allow `closed → opened/in_review` and `confirmed → opened/in_review` for repair path

4. **Repair path** — New `narada task reopen <task-number>` command:
   - Transitions invalid terminal tasks back to `opened` (or `in_review` if review exists)
   - Clears `governed_by`; preserves `closed_by`/`closed_at` as audit trail
   - Refuses valid terminal tasks unless `--force` is used
   - Wired in `main.ts`

5. **Documentation** — Added "Terminal-State Ownership" section to `.ai/task-contracts/agent-task-execution.md`

6. **Bug fix** — `findTaskFile` zero-padded number matching fixed (e.g., `050` now matches task `50`)

7. **Bug fix during review** — `hasGovernedProvenance()` stale-marker fix:
   - After `task reopen`, old `closed_by`/`closed_at` were preserved as audit trail
   - If someone then raw-mutated back to `closed` without `governed_by`, the stale markers incorrectly validated the bypass
   - Fixed: `hasGovernedProvenance()` now rejects stale markers when `reopened_at > closed_at`
   - New test: `stale closed_by/closed_at after reopen does not count as valid provenance`

8. **Tests**:
   - `task-close.test.ts` +2 tests (governed_by set, raw mutation detected)
   - `task-review.test.ts` +1 test (governed_by set on accepted review)
   - `task-evidence.test.ts` +1 test (raw terminal mutation detected)
   - `task-lint.test.ts` +1 test (raw terminal mutation detected)
   - `task-reopen.test.ts` +6 new tests (repair path coverage) + 1 stale-provenance test
   - Updated existing tests to include governed provenance markers where needed

### Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-close.test.ts test/commands/task-review.test.ts test/commands/task-evidence.test.ts test/commands/task-lint.test.ts test/commands/task-reopen.test.ts
pnpm --filter @narada2/cli exec vitest run
pnpm verify
```

- Focused tests: 57 passed (post-review)
- Full CLI suite: 619 passed
- `pnpm verify`: all 5 steps passed

## Focused Verification

- Prefer focused CLI tests around `task-evidence`, `task-lint`, `task-close`, `task-review`, and any repair surface introduced.
- Run the smallest useful typecheck/build needed by changed packages.



