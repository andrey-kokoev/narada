---
status: closed
closed_at: 2026-04-26T16:17:40.4722979-05:00
closed_by: codex
depends_on: []
---

# Task 597 — Validate git-backed User Site remote posture

## Context

Part of the Git Backed User Site Doctor chapter (Tasks 597–597). The live User Site has transitioned to `git_backed` and is backed by the private GitHub repo `andrey-kokoev/narada-andrey`.

## Goal

Extend `narada sites doctor` so `git_backed` means the local Git and configured remote posture can be inspected.

## Acceptance Criteria

- [x] `git_backed` Sites validate `.git`/work-tree presence.
- [x] Doctor validates upstream branch tracking.
- [x] Doctor validates `remote.origin.url` against `sync.git.remote_url`.
- [x] Doctor reports clean/dirty Git working tree.
- [x] Doctor validates active configured remote status.
- [x] Doctor verifies private GitHub repo reachability when `sync.git.remote_kind = github`.
- [x] Docs describe the Git-backed checks.
- [x] Verification passes.

## Execution Mode

Direct implementation.

## Verification

```powershell
pnpm exec tsx packages/layers/cli/src/main.ts sites doctor andrey-user --root C:\Users\Andrey\Narada --authority-locus user --format json
```

Result: `status: "passed"` with Git checks:

- `git_root_exists`
- `git_work_tree`
- `git_upstream`
- `git_working_tree_clean`
- `git_remote_url`
- `git_remote_status`
- `github_repo_private`

Additional verification:

- `pnpm --filter @narada2/cli typecheck`
- `pnpm --filter @narada2/cli exec vitest run test/commands/sites.test.ts`
- `git diff --check`
