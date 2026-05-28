# Bounded Global Coherence Cleanup Publication Plan

Date: 2026-05-18
Task: 1503
Agent: narada.builder

## Decision

Do not push and do not stage the broad dirty worktree. Publish the global coherence cleanup chapter through separate governed crossings:

1. Repository governance/evidence publication for cleanup task specs, handoffs, reports, decisions, and lifecycle snapshot.
2. Repository source/test publication for the coherence-scan repair.
3. Inbox envelope publication through `narada inbox publish`, not through the repo publication bundle.
4. Mutation-evidence reconciliation/publication only through a separate admitted mutation-evidence repair, because the dirty mutation-evidence set is broad and historical.

## Include: Governance/Evidence Bundle

Include only these paths:

- `.ai/do-not-open/tasks/20260518-1499-1504-global-coherence-cleanup-after-operator-site-communication-relation.md`
- `.ai/do-not-open/tasks/20260518-1499-diagnose-inbox-publication-pending-posture.md`
- `.ai/do-not-open/tasks/20260518-1500-repair-coherence-scan-cross-embodiment-node-resolution.md`
- `.ai/do-not-open/tasks/20260518-1501-resolve-mutation-evidence-warnings-for-dirty-authority-surfa.md`
- `.ai/do-not-open/tasks/20260518-1502-audit-in-progress-and-blocked-task-posture.md`
- `.ai/do-not-open/tasks/20260518-1503-prepare-bounded-publication-cleanup-plan.md`
- `.ai/do-not-open/tasks/20260518-1504-close-global-coherence-cleanup-chapter.md`
- `.ai/handoffs/task-1499-body.md`
- `.ai/handoffs/task-1499-report.json`
- `.ai/handoffs/task-1500-body.md`
- `.ai/handoffs/task-1500-report.json`
- `.ai/handoffs/task-1501-body.md`
- `.ai/handoffs/task-1501-report.json`
- `.ai/handoffs/task-1502-body.md`
- `.ai/handoffs/task-1502-report.json`
- `.ai/decisions/2026-05-18-inbox-publication-pending-posture-diagnosis.md`
- `.ai/decisions/2026-05-18-in-progress-and-deferred-task-posture-audit.md`
- `.ai/decisions/2026-05-18-bounded-global-coherence-cleanup-publication-plan.md`
- `.ai/task-lifecycle-snapshot.json`

Intended command when publication prepare can handle the dirty worktree:

```powershell
narada publication prepare --by narada.builder --task 1503 --message "Publish global coherence cleanup governance artifacts" --governance-only --include .ai/do-not-open/tasks/20260518-1499-1504-global-coherence-cleanup-after-operator-site-communication-relation.md --include .ai/do-not-open/tasks/20260518-1499-diagnose-inbox-publication-pending-posture.md --include .ai/do-not-open/tasks/20260518-1500-repair-coherence-scan-cross-embodiment-node-resolution.md --include .ai/do-not-open/tasks/20260518-1501-resolve-mutation-evidence-warnings-for-dirty-authority-surfa.md --include .ai/do-not-open/tasks/20260518-1502-audit-in-progress-and-blocked-task-posture.md --include .ai/do-not-open/tasks/20260518-1503-prepare-bounded-publication-cleanup-plan.md --include .ai/do-not-open/tasks/20260518-1504-close-global-coherence-cleanup-chapter.md --include .ai/handoffs/task-1499-body.md --include .ai/handoffs/task-1499-report.json --include .ai/handoffs/task-1500-body.md --include .ai/handoffs/task-1500-report.json --include .ai/handoffs/task-1501-body.md --include .ai/handoffs/task-1501-report.json --include .ai/handoffs/task-1502-body.md --include .ai/handoffs/task-1502-report.json --include .ai/decisions/2026-05-18-inbox-publication-pending-posture-diagnosis.md --include .ai/decisions/2026-05-18-in-progress-and-deferred-task-posture-audit.md --include .ai/decisions/2026-05-18-bounded-global-coherence-cleanup-publication-plan.md --include .ai/task-lifecycle-snapshot.json --format json
```

## Include: Source/Test Bundle

Include only these paths:

- `packages/layers/cli/src/commands/coherence-scan.ts`
- `packages/layers/cli/test/commands/coherence-scan.test.ts`

Intended command:

```powershell
narada publication prepare --by narada.builder --task 1503 --message "Publish coherence scan cleanup repairs" --include packages/layers/cli/src/commands/coherence-scan.ts --include packages/layers/cli/test/commands/coherence-scan.test.ts --format json
```

## Inbox Publication

Keep inbox envelope publication separate. Dry-run reports 200 pending envelope artifacts overall and no push by default.

Operator command when admitted:

```powershell
narada inbox publish --execute --limit 200 --message "Publish inbox envelope artifacts"
```

Do not add `--push` unless the Operator explicitly grants remote publication.

## Exclude

Exclude all other dirty paths from this cleanup publication, including:

- unrelated historical task projections and chapter specs
- broad `.ai/mutation-evidence/**`
- `.ai/canonical-outbox.json` and `.ai/outbox-items/**`
- `.ai/inbox-envelopes/**` from repository publication bundles
- `.narada/**` local runtime/audit state
- Cloudflare `.wrangler/**`
- site-registry, dashboard, carrier, task-governance, and other source/doc changes not introduced by tasks 1499-1503

## Tooling Residual

`narada publication prepare` failed in this dirty worktree with `spawnSync git ENOBUFS`. It created an incomplete `.ai/publications/rpi_0d7d5b56c1b0` directory with a bundle but no publication record; that incomplete residue was removed. Publication prepare likely needs bounded Git output handling before it can reliably prepare narrow include bundles in very dirty repositories.
