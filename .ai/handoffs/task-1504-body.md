Completed task 1504 closure review for the global coherence cleanup chapter.

Files changed:

- `.ai/do-not-open/tasks/20260518-1504-close-global-coherence-cleanup-chapter.md`
- `.ai/decisions/2026-05-18-1499-1504-global-coherence-cleanup-chapter-closure.md`
- `.ai/task-lifecycle-snapshot.json`

Summary:

- Verified tasks 1499-1503 are closed with complete evidence.
- Confirmed Architect work availability is empty/clear.
- Confirmed inbox remains not ready because 200 envelope artifacts are pending publication.
- Exported the lifecycle snapshot and verified it is fresh.
- Verified operational coherence and mutation evidence scans are clean.
- Recorded authority inversion residuals rather than claiming global cleanliness.
- Confirmed governed chapter closure cannot start while 1504 is still claimed; post-task closure commands are recorded in the closure artifact.

Verification:

- `narada work-available --agent narada.architect --format json` passed; empty/clear.
- `narada inbox doctor --format json` passed; ready=false with publication_pending.
- `narada task lifecycle status --format json` passed; fresh after export.
- `narada coherence scan --module operational --format json` passed after export; finding_count=0.
- `narada coherence scan --module mutation_evidence --format json` passed; finding_count=0.
- `narada coherence scan --module authority_inversion --format json` passed; finding_count=11 residuals.
- `narada chapter close 1499-1504 --start --by narada.builder --format json` correctly refused while 1504 was claimed.
