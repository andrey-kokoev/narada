---
status: confirmed
depends_on: [1498]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T04:14:49.017Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T04:14:49.518Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Resolve mutation evidence warnings for dirty authority surfaces

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1499-1504-global-coherence-cleanup-after-operator-site-communication-relation.md

## Goal

Bring dirty task/inbox/lifecycle authority-surface changes back into Canonical Mutation Evidence posture or record exact residuals where current tooling cannot do so.

## Context

Coherence scan reports mutation-evidence warnings for dirty authority-surface files. Some may be historical generated task projections, closed chapters, or legitimate mutation evidence gaps. The cleanup must not invent evidence after the fact without preserving provenance.

## Required Work

1. Run `narada coherence scan --module mutation_evidence --format json` and capture the current finding set.
2. Group dirty authority-surface files by family: task specs/projections, task lifecycle snapshot, inbox envelopes, outbox, decisions, or other authority surfaces.
3. For each group, identify the sanctioned command that should emit or reconcile mutation evidence.
4. Run only bounded sanctioned commands where the evidence provenance is clear; otherwise record a residual with the missing tool or admitted repair needed.
5. Verify the mutation_evidence scan is clean or reduced to explicit residuals.

## Non-Goals

- Do not fabricate mutation evidence for unknown historical edits.
- Do not use direct SQLite mutation.
- Do not revert unrelated dirty work.

## Execution Notes

- Ran `narada coherence scan --module mutation_evidence --format json`; the initial finding was `mutation-evidence-missing-for-authority-surface` over dirty task lifecycle, task spec/projection, and inbox envelope authority surfaces.
- Grouped current dirty files by family:
  - task specs/projections: 197
  - task lifecycle snapshot: 1
  - inbox envelopes: 18
  - outbox: 1
  - decisions: 24
  - mutation evidence: 596
  - canonical outbox: 1
  - other authority surfaces: 111
  - non-authority files: 219
- Identified the relevant sanctioned reconcile commands and ran dry-runs only:
  - `narada mutation-evidence reconcile --family task_lifecycle --format json --limit 50`
  - `narada mutation-evidence reconcile --family inbox --format json --limit 50`
- Did not run broad `--apply` reconciliation because the task-lifecycle dry-run reported malformed and missing historical evidence records, and the inbox dry-run reported conflict, stale, and malformed records. Applying those as part of this task would fabricate or overwrite provenance beyond the admitted scope.
- Diagnosed the active scan warning as a scanner false positive: `gitPorcelainChangedFiles()` expands and truncates the global dirty set to 200 paths before `checkMutationEvidencePosture()` checks for `.ai/mutation-evidence/` changes. In this worktree, dirty mutation evidence artifacts existed but were beyond the truncation window, so the scan claimed missing evidence.
- Updated `packages/layers/cli/src/commands/coherence-scan.ts` so mutation evidence posture also checks `git status --porcelain -- .ai/mutation-evidence` directly before reporting missing evidence.
- Added regression coverage in `packages/layers/cli/test/commands/coherence-scan.test.ts` for dirty authority surfaces with dirty mutation evidence artifacts.
- Residuals recorded:
  - Historical task-lifecycle mutation evidence reconciliation remains a separate admitted repair because the dry-run found malformed and missing records.
  - Historical inbox mutation evidence reconciliation remains a separate admitted repair because the dry-run found stale, conflict, and malformed records.
  - Existing unrelated dirty authority-surface work was left intact and not reverted.

## Verification

- `narada coherence scan --module mutation_evidence --format json`: initially reported `finding_count=1` with `mutation-evidence-missing-for-authority-surface`.
- Dirty file grouping completed and recorded above.
- `narada mutation-evidence reconcile --family task_lifecycle --format json --limit 50`: dry-run only; reported current records plus malformed and missing historical records, so no broad apply was run.
- `narada mutation-evidence reconcile --family inbox --format json --limit 50`: dry-run only; reported current records plus stale, conflict, and malformed records, so no broad apply was run.
- `pnpm --filter @narada2/cli typecheck`: passed.
- `pnpm --filter @narada2/cli exec vitest run test/commands/coherence-scan.test.ts --pool=forks --poolOptions.forks.singleFork=true`: passed; 1 file, 13 tests.
- `pnpm --filter @narada2/cli build`: passed.
- `narada coherence scan --module mutation_evidence --format json`: passed after repair with `finding_count=0`.

## Acceptance Criteria

- [x] Mutation-evidence warnings are grouped and explained.
- [x] Sanctioned repair commands are used where admissible.
- [x] Any remaining warnings are explicit residuals, not hidden incoherence.
- [x] No unrelated dirty work is reverted.
