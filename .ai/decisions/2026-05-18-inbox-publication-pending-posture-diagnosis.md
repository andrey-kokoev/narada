---
status: recorded
task: 1499
date: 2026-05-18
---

# Inbox Publication Pending Posture Diagnosis

## Question

`narada inbox doctor` reported `ready=false` because of 200 uncommitted inbox
envelope artifacts. This diagnosis determines whether the correct cleanup is a
blind inbox publication, targeted archival/ignore handling, or a repair task.

## Findings

The 200 reported paths are the full exported inbox envelope artifact set under
`.ai/inbox-envelopes`, not the current Git-uncommitted set.

Git classification:

| Class | Count | Evidence |
| --- | ---: | --- |
| Total JSON envelope artifacts on disk | 200 | `Get-ChildItem .ai\inbox-envelopes -Filter *.json` |
| Already tracked by Git | 182 | `git ls-files -- .ai/inbox-envelopes` |
| Modified tracked artifacts | 0 | `git ls-files --modified -- .ai/inbox-envelopes` |
| Untracked artifacts | 18 | `git ls-files --others --exclude-standard -- .ai/inbox-envelopes` |
| Porcelain status entries | 18 | `git status --porcelain=v1 --untracked-files=all -- .ai/inbox-envelopes` |

At least one April artifact reported by the doctor is already tracked and has
Git history:

- `.ai/inbox-envelopes/2026-04-27T05-32-22-560Z-env_abd1f7d2-3c50-463d-8c50-d85bc250ee5e.json`
- `git log --oneline -- <file>` includes commits `61c3ed34` and `107d0a4b`

Therefore the doctor wording "200 uncommitted inbox envelope artifact(s)" is
not precise enough for cleanup decisions. It is safe to treat the count as
"200 exported envelope artifacts considered by the inbox publication surface",
not as "200 Git-uncommitted files".

## Artifact Classification

All 200 artifacts by received date:

| Date | Count |
| --- | ---: |
| 2026-04-27 | 24 |
| 2026-04-28 | 33 |
| 2026-04-29 | 34 |
| 2026-04-30 | 44 |
| 2026-05-01 | 33 |
| 2026-05-02 | 2 |
| 2026-05-12 | 1 |
| 2026-05-13 | 5 |
| 2026-05-15 | 17 |
| 2026-05-16 | 5 |
| 2026-05-17 | 2 |

All 200 artifacts by status:

| Status | Count |
| --- | ---: |
| promoted | 87 |
| received | 69 |
| archived | 44 |

All 200 artifacts by kind/status:

| Kind / status | Count |
| --- | ---: |
| observation / promoted | 51 |
| observation / archived | 44 |
| observation / received | 40 |
| proposal / promoted | 25 |
| incident / received | 17 |
| incident / promoted | 7 |
| proposal / received | 7 |
| upstream_task_candidate / promoted | 3 |
| task_candidate / received | 2 |
| command_request / received | 1 |
| knowledge_candidate / received | 1 |
| task_candidate / promoted | 1 |
| upstream_task_candidate / received | 1 |

The 18 actual untracked artifacts are all `received` records:

| Date range | Count |
| --- | ---: |
| 2026-05-15 | 11 |
| 2026-05-16 | 5 |
| 2026-05-17 | 2 |

Untracked kind/status split:

| Kind / status | Count |
| --- | ---: |
| observation / received | 13 |
| incident / received | 2 |
| task_candidate / received | 2 |
| command_request / received | 1 |

The untracked artifacts include CAPA incident envelopes, review-result
observations, task candidates, one command request, and the Agent Identity
crystallization observation/review-result pair. They are portable Canonical
Inbox evidence. They are not raw SQLite authority and should not be deleted as
residue.

## Decision

Do not run a blind cleanup against "200 uncommitted artifacts".

The bounded cleanup decision is:

1. Preserve the 200 exported envelope artifacts as durable inbox evidence.
2. Do not delete, archive, or ignore them based only on publication posture.
3. Treat the 18 untracked May 15-17 artifacts as the actual Git-visible
   publication residue.
4. Publish only through the governed inbox publication command, not by raw Git
   adding arbitrary files.
5. Record a repair follow-up for the doctor/publish wording if this ambiguity
   recurs: the surface should distinguish exported artifact count from actual
   Git-untracked/modified count.

No publish was executed in this diagnostic task because the task's non-goal is
to avoid broad repo commits and because the current command stages the whole
`.ai/inbox-envelopes` directory even though only 18 files are actual Git
residue.

## Exact Next Command

When the Operator or an admitted publication cleanup task chooses to publish the
bounded residue, use:

```powershell
narada inbox publish --execute --limit 200 --message "Publish inbox envelope artifacts"
```

Do not add `--push` unless a separate Repository Publication Intent Zone
decision authorizes remote publication.

## Authority Posture

Inbox envelope artifacts are Git-visible portable evidence for Canonical Inbox
state. SQLite remains the local runtime substrate. Publication is a Repository
Publication Intent Zone crossing; it stages and commits portable artifacts, but
does not create inbox admission, promotion, task lifecycle mutation, archive
disposition, or target-locus authority by itself.
