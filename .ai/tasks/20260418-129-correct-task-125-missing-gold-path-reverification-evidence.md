# Task 129: Correct Task 125 Missing Gold-Path Re-Verification Evidence

## Why

Review of Task 125 found that the implementation defects were corrected, but the task's required re-verification evidence is missing.

Task 125 explicitly required end-to-end re-verification of the corrected first-run path, including:

- repo initialization
- dependency installation for the intended mode
- mailbox declaration
- setup
- preflight
- explain
- activate

The code changes appear correct, but there is no durable evidence in-tree showing that this gold path was actually re-run and observed after the fix.

That leaves the task only partially closed from a process and verification standpoint.

## Goal

Provide explicit, durable re-verification evidence for the corrected Task 125 first-run path.

## Required Outcomes

### 1. Re-run the corrected standalone gold path

Re-exercise the intended standalone user flow for Task 125 using the corrected surfaces.

At minimum this must include:

1. `narada init-repo <path>`
2. dependency installation for the intended user mode
3. `narada want-mailbox <mailbox-id>`
4. `narada setup`
5. `narada preflight <mailbox-id>`
6. `narada explain <mailbox-id>`
7. `narada activate <mailbox-id>`

### 2. Capture concrete verification results

Record what was actually observed, not just that the commands "worked."

At minimum capture:

- whether repo initialization produced standalone-ready dependencies
- whether `preflight` rendered human-readable output in the canonical CLI
- whether each command succeeded or, if not fully runnable, what exact blocker remained

### 3. Store durable evidence in-tree

Write a concise result artifact tied to Task 125 so later reviews do not need to infer whether re-verification happened.

Acceptable shape:

- update the existing `20260418-125-correct-task-120-standalone-init-repo-and-preflight-cli-ux.md`
- or add a dedicated result note adjacent to it

But the evidence must be durable and inspectable in the repo.

### 4. Distinguish verified behavior from assumed behavior

If some part of the flow could not be fully exercised in a standalone environment, the result must say so explicitly.

Do not imply end-to-end re-verification if only partial validation occurred.

## Deliverables

- durable result note documenting Task 125 re-verification
- explicit command-by-command outcome for the corrected gold path
- confirmation that standalone `init-repo` and canonical `preflight` behavior were actually exercised

## Definition Of Done

- [x] the corrected Task 125 gold path has been re-run or explicitly bounded where not runnable
- [x] the canonical CLI `preflight` rendering has concrete verification evidence
- [x] the standalone `init-repo` path has concrete verification evidence
- [x] a durable in-tree result artifact records the outcomes

## Notes

This is a verification-evidence correction task, not a request to redesign the first-run flow again.

If re-verification reveals a new defect, that defect should be recorded explicitly rather than hidden inside the evidence note.
