Implemented task 1499 by diagnosing the inbox publication pending posture without publishing or deleting artifacts.

Files changed:

- `.ai/decisions/2026-05-18-inbox-publication-pending-posture-diagnosis.md`
- `.ai/do-not-open/tasks/20260518-1499-diagnose-inbox-publication-pending-posture.md`

Summary:

- Ran `narada inbox doctor --format json` and confirmed it reports `ready=false`, `publication_pending`, and 200 reported envelope artifacts.
- Ran `narada inbox publish --format json` as dry run only.
- Classified the filesystem/Git posture: 200 envelope JSON files exist, 182 are already tracked, 0 tracked files are modified, and 18 files are actually untracked.
- Classified artifact status/kind: all 200 split into 87 promoted, 69 received, 44 archived; the 18 actual untracked files are all received records from 2026-05-15 through 2026-05-17.
- Recorded the decision that these are portable Canonical Inbox evidence, not raw SQLite authority, and should not be blindly deleted or published as "200 uncommitted" files.
- Named the bounded next command for a separately admitted publication cleanup: `narada inbox publish --execute --limit 200 --message "Publish inbox envelope artifacts"`, without `--push`.

Verification:

- `narada inbox doctor --format json`
- `narada inbox publish --format json`
- `git ls-files -- .ai/inbox-envelopes | Measure-Object`
- `git ls-files --modified -- .ai/inbox-envelopes | Measure-Object`
- `git ls-files --others --exclude-standard -- .ai/inbox-envelopes | Measure-Object`
- `git status --porcelain=v1 --untracked-files=all -- .ai/inbox-envelopes | Measure-Object`
- PowerShell JSON classification over `.ai/inbox-envelopes/*.json`
- `git log --oneline -- .ai/inbox-envelopes/2026-04-27T05-32-22-560Z-env_abd1f7d2-3c50-463d-8c50-d85bc250ee5e.json`
- `git diff --check -- .ai/decisions/2026-05-18-inbox-publication-pending-posture-diagnosis.md .ai/do-not-open/tasks/20260518-1499-diagnose-inbox-publication-pending-posture.md`

No publish, deletion, direct `.ai/inbox.db` mutation, commit, or push was performed.
