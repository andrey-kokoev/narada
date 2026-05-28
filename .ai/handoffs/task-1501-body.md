Implemented task 1501 by resolving the active mutation evidence coherence warning and recording the broader historical reconcile residuals.

Files changed:

- `packages/layers/cli/src/commands/coherence-scan.ts`
- `packages/layers/cli/test/commands/coherence-scan.test.ts`
- `.ai/do-not-open/tasks/20260518-1501-resolve-mutation-evidence-warnings-for-dirty-authority-surfa.md`

Summary:

- Initial `narada coherence scan --module mutation_evidence --format json` reported `mutation-evidence-missing-for-authority-surface`.
- Grouped dirty authority surfaces: 197 task specs/projections, 1 lifecycle snapshot, 18 inbox envelopes, 1 outbox, 24 decisions, 596 mutation-evidence artifacts, 1 canonical outbox, 111 other authority surfaces, and 219 non-authority files.
- Ran sanctioned dry-run reconcile commands for `task_lifecycle` and `inbox`.
- Did not run broad `--apply` reconciliation because dry-runs exposed malformed, missing, stale, and conflict records requiring a separately admitted historical repair.
- Root cause of the active scan warning was a scanner false positive: changed-file expansion truncation hid dirty `.ai/mutation-evidence/` artifacts from the posture check.
- Repaired the scanner so mutation evidence posture directly checks `git status --porcelain -- .ai/mutation-evidence` before reporting missing evidence.
- Added regression coverage for dirty authority surfaces accompanied by dirty mutation evidence artifacts.

Verification:

- `pnpm --filter @narada2/cli typecheck` passed.
- `pnpm --filter @narada2/cli exec vitest run test/commands/coherence-scan.test.ts --pool=forks --poolOptions.forks.singleFork=true` passed: 1 file, 13 tests.
- `pnpm --filter @narada2/cli build` passed.
- `narada coherence scan --module mutation_evidence --format json` passed after repair with `finding_count=0`.
