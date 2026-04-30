---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T14:00:39.837Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, typecheck/build, help output, and bounded dry-run/refusal checks prove structured input, literal preservation, suspicious inline refusal, normal inline success, and recorded task-1119 failure prevention.
closed_at: 2026-04-30T14:00:47.578Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Make rich task authoring structurally shell-safe

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1120-1120-safe-task-authoring-input.md

## Goal

Prevent shell quoting mistakes from corrupting rich task specs by adding structured task-create input and inline suspicious-content guards.

## Context

Architect created task 1119 with backticked command text inside double-quoted shell arguments. Bash performed command substitution before Narada received the text, polluting the task goal and criteria with command output. This was repaired after detection, but the authoring surface should make this structurally preventable without relying on agent memory or shell discipline.

## Required Work

1. Add `narada task create --input-json <file>` or equivalent structured input path for title, goal, chapter, context, required_work, non_goals, depends_on, and acceptance_criteria.
2. Ensure structured input preserves backticks, `$()`, quotes, pipes, and multiline command examples literally.
3. Update help to recommend `--input-json` or `--from-file` for rich task specs and command-containing text.
4. Add an inline suspicious-content guard for `--goal`, `--criteria`, `--context`, and `--required-work` that refuses likely pasted command output or shell-expanded artifacts unless an explicit override is supplied.
5. Keep normal short inline task creation ergonomic.
6. Add focused tests covering literal backticks, literal `$()`, suspicious command-output refusal, and normal inline text.
7. Verify by creating a dry-run or temp-repo task whose goal contains backticked Narada commands without shell expansion corruption.

## Non-Goals

- Do not remove existing inline `--title`, `--goal`, or `--criteria` support.
- Do not require JSON for simple one-line tasks.
- Do not make the guard block ordinary prose or legitimate JSON files passed through structured input.
- Do not mutate live task state in tests outside a temp repo.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada task create --input-json <file>` or equivalent structured input path exists and is documented in help
- [x] Structured input preserves backticks, `$()`, quotes, pipes, and multiline text literally
- [x] Inline rich text that looks like command output or shell-expanded artifact is refused with a clear instruction to use structured input or from-file
- [x] Normal short inline task creation still works without extra ceremony
- [x] Focused tests cover structured literal preservation, suspicious inline refusal, and normal inline success
- [x] The task report records the original failure mode from task 1119 and the exact prevention now enforced
