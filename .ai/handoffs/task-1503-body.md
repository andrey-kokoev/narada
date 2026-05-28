Completed task 1503 by producing a bounded publication plan without pushing or staging broad dirty work.

Files changed:

- `.ai/do-not-open/tasks/20260518-1503-prepare-bounded-publication-cleanup-plan.md`
- `.ai/decisions/2026-05-18-bounded-global-coherence-cleanup-publication-plan.md`

Summary:

- Identified cleanup chapter files separately from the broad pre-existing dirty worktree.
- Split publication into governance/evidence bundle, source/test bundle, inbox publication, and mutation-evidence residual.
- Ran `narada publication prepare` for the governance bundle, but it failed with `spawnSync git ENOBUFS` in the large dirty worktree.
- Removed the incomplete `.ai/publications/rpi_0d7d5b56c1b0` residue left by that failed prepare attempt after verifying `narada publication list --format json` reported no publication record.
- Ran `narada inbox publish --limit 200 --format json` as dry-run only; it reported 200 pending envelope artifacts overall and no push by default.
- No push, commit, broad staging, live Cloudflare publication, or inbox publish execution occurred.

Verification:

- `git status --short` inspected.
- `narada publication --help` and `narada publication prepare --help` inspected.
- `narada publication list --format json` returned `count=0`.
- `narada inbox publish --limit 200 --format json` dry-run succeeded.
- Failed prepare residue was removed and verified absent.
