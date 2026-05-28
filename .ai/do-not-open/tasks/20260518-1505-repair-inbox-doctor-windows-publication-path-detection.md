---
status: confirmed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-18T04:55:22.435Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria proven by focused inbox publication regression tests, CLI typecheck/build, and live narada inbox doctor readback showing ready=true with uncommitted_envelope_artifacts_count=0.
closed_at: 2026-05-18T04:56:12.678Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
confirmed_by: narada.architect
confirmed_at: 2026-05-18T04:56:19.153Z
---

# Repair inbox doctor Windows publication path detection

## Chapter

Inbox Publication Doctor Coherence

## Goal

Make `narada inbox doctor` report portable inbox envelope publication posture from Git status truth on Windows instead of treating path-separator differences as uncommitted artifacts.

## Context

`narada inbox doctor` currently reports 220 uncommitted `.ai/inbox-envelopes` artifacts while focused Git checks show zero untracked and zero modified files under that path. Source inspection shows `inspectInboxPublication` compares Windows-relative filesystem paths with Git's slash-normalized paths.

## Required Work

1. Normalize inbox envelope artifact paths to Git-style slash paths before comparing filesystem artifacts with `git ls-files` and `git status --porcelain` output. 2. Preserve existing output shape and next-step semantics. 3. Add a focused regression that proves already tracked envelope artifacts are not reported as uncommitted when artifact paths are produced with platform-native separators. 4. Run focused CLI inbox tests and `narada inbox doctor --format json` against Narada proper. 5. Export task lifecycle evidence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Updated `packages/layers/cli/src/commands/inbox.ts` so `inspectInboxPublication` normalizes filesystem-relative artifact paths and parsed Git porcelain paths to Git-style slash paths before comparison.
- Added `toGitPath` and applied it only at the publication comparison boundary, preserving the existing output shape and next-step semantics.
- Added a focused regression in `packages/layers/cli/test/commands/inbox.test.ts` proving that tracked portable inbox envelope artifacts are treated as published after `inbox publish --execute`, while the existing untracked-artifact warning test remains in place.

## Verification

- `$env:NARADA_GIT_BINARY='git'; pnpm --dir packages/layers/cli test -- test/commands/inbox.test.ts -t "doctor reports uncommitted portable inbox envelope artifacts|doctor treats tracked portable inbox envelope artifacts as published"` passed: 2 tests passed, 49 skipped.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.
- `narada inbox doctor --format json` passed against Narada proper with `ready=true`, `publication.status=published_or_no_artifacts_pending`, `uncommitted_envelope_artifacts_count=0`, and `unpushed_commit_count=0`.
- `$env:NARADA_GIT_BINARY='git'; pnpm --dir packages/layers/cli test -- test/commands/inbox.test.ts` still fails on four unrelated pre-existing Windows path expectation failures outside publication detection; 47 tests passed including the new regression.

## Acceptance Criteria

- [x] `narada inbox doctor --format json` reports `publication.uncommitted_envelope_artifacts_count=0` for Narada proper when Git has no changes under `.ai/inbox-envelopes`.
- [x] The existing uncommitted artifact warning still fires for a newly exported but untracked inbox envelope artifact.
- [x] Focused CLI inbox tests pass.
