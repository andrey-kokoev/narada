---
status: confirmed
depends_on: [1475, 1476, 1477, 1478, 1479, 1481]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:40:10.547Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779053992511_ar6mk8
closed_at: 2026-05-17T21:40:25.256Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Refresh task lifecycle snapshot after chapter closure

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1482-1484-remaining-coherence-cleanup-after-site-registry-split.md

## Goal

Bring the Git-visible task lifecycle snapshot into alignment with the SQLite lifecycle authority after the Site Registry split chapter closure.

## Context

`narada task lifecycle status` reports the SQLite authority is ahead of `.ai/task-lifecycle-snapshot.json`. Snapshot staleness is not a runtime blocker, but it weakens Git-visible mutation evidence for the just-closed chapter.

## Required Work

1. Confirm the current lifecycle status and snapshot freshness posture.
2. Run the sanctioned lifecycle export command to update `.ai/task-lifecycle-snapshot.json`.
3. Verify that lifecycle status no longer reports the snapshot as stale, or record the exact remaining reason if the command cannot make it fresh.
4. Keep the operation bounded to lifecycle evidence; do not alter unrelated task semantics.
5. Record verification output without dumping large snapshot contents into task notes.

## Non-Goals

- Do not directly edit the SQLite database.
- Do not manually rewrite the snapshot file.
- Do not close or reopen unrelated tasks.

## Execution Notes

- Confirmed pre-export lifecycle status reported `.ai/task-lifecycle-snapshot.json` as `snapshot_stale`.
- Ran the sanctioned lifecycle export command, which wrote `.ai/task-lifecycle-snapshot.json` from SQLite lifecycle authority.
- Confirmed post-export lifecycle status reports `snapshot_fresh`.
- Kept the repair bounded to lifecycle evidence; no direct SQLite mutation or manual snapshot rewrite was used.

## Verification

- `narada task lifecycle status --format json --cwd D:\code\narada` before export reported `snapshot_freshness=snapshot_stale`.
- `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json --format json --cwd D:\code\narada` succeeded with `table_count=26` and `row_count=3001`.
- `narada task lifecycle status --format json --cwd D:\code\narada` after export reported `snapshot_freshness=snapshot_fresh`.
- Governed verification run `run_1779053992511_ar6mk8` passed for post-export lifecycle status.

## Acceptance Criteria

- [x] Lifecycle snapshot export has been run through the sanctioned command.
- [x] Snapshot freshness is fresh or the remaining staleness is precisely explained.
- [x] No direct SQLite mutation or manual snapshot rewrite occurs.
