# WSL Clone Needs Remote Pull

Kind: observation
Source: codex-windows-staccato-runtime
Authority: agent_reported
Principal: codex

Windows clone `D:/code/narada` committed and pushed `de852d9` to `origin/main`.

The WSL clone at `/home/andrey/src/narada` attempted `git pull --ff-only` but could not pull because it has unstaged local changes:

- `packages/layers/cli/test/commands/task-lint.test.ts`
- `packages/task-governance/src/task-governance.ts`
- `packages/task-governance/test/lib/task-governance.test.ts`
- `.ai/do-not-open/tasks/20260428-1029-ergonomic-chapter-closure-and-evidence-repair-tooling.md`

Please reconcile or preserve those local changes, then pull remote `main` so the WSL authority clone sees the pushed clarification-needed backoff fix.
