---
status: confirmed
depends_on: [1498]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T04:20:16.445Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T04:20:16.984Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Prepare bounded publication cleanup plan

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1499-1504-global-coherence-cleanup-after-operator-site-communication-relation.md

## Goal

Create a governed publication plan for the cleanup chapter changes and any safe inbox/task evidence publication without mixing unrelated dirty work.

## Context

The worktree has substantial pre-existing dirty state. Cleanup needs a publication posture, but broad commit/push would risk mixing unrelated generated work, task evidence, docs, Worker changes, and local runtime residue.

## Required Work

1. Inspect `git status --short` and identify files touched by this cleanup chapter versus pre-existing unrelated changes.
2. Use `narada publication` surfaces, if available, to prepare a bounded publication bundle for cleanup-only artifacts.
3. Separate inbox-envelope publication, task lifecycle snapshot export, doctrine/code changes, and unrelated dirty work into distinct publication decisions.
4. Record exact include/exclude posture and commands for the Operator or publication task.
5. Do not push unless the Operator explicitly grants publication execution.

## Non-Goals

- Do not publish live Cloudflare resources.
- Do not push without explicit Operator request.
- Do not stage broad dirty work by convenience.

## Execution Notes

- Inspected `git status --short`; the worktree contains broad pre-existing dirty state across task projections, docs, CLI/task-governance source, site-registry packages, inbox envelopes, mutation evidence, and local runtime artifacts.
- Identified the cleanup-chapter bounded set currently visible in Git:
  - cleanup task specs/chapter specs: 7
  - cleanup handoff/report artifacts: 8
  - cleanup decision notes: 2
  - cleanup source/test files: 2
  - task lifecycle snapshot: 1
  - inbox envelopes: 18 untracked on disk, but inbox publication dry-run reports 200 pending envelope artifacts overall
  - mutation evidence artifacts: 598 dirty/untracked; too broad to fold into the cleanup repository bundle
- Attempted the governed publication surface:
  - `narada publication prepare --by narada.builder --task 1503 --message "Publish global coherence cleanup governance artifacts" --governance-only ...`
  - The command failed with `spawnSync git ENOBUFS`, apparently while inspecting the very large dirty worktree.
  - The failed attempt left `.ai/publications/rpi_0d7d5b56c1b0` with only a bundle and no publication record. Verified `narada publication list --format json` returned count 0, then removed only that incomplete directory.
- Recorded the bounded plan in `.ai/decisions/2026-05-18-bounded-global-coherence-cleanup-publication-plan.md`.
- No commit, push, inbox publish execution, broad staging, Cloudflare live publication, or unrelated dirty-work staging was performed.

## Verification

- `git status --short`: showed the large dirty worktree and the cleanup-chapter file set.
- `narada publication --help` and `narada publication prepare --help`: confirmed the Repository Publication Intent Zone has `prepare`, `confirm`, `list`, `--include`, `--governance-only`, `--task`, and `--by` surfaces.
- `narada publication list --format json`: returned `count=0` before and after the failed prepare attempt.
- `narada publication prepare ... --governance-only ... --format json`: failed with `spawnSync git ENOBUFS`; no publication record was listed.
- `Test-Path .ai/publications/rpi_0d7d5b56c1b0`: returned false after removing the incomplete failed-prepare residue.
- `narada inbox publish --limit 200 --format json`: dry-run only; reported `would_export_count=50`, `uncommitted_envelope_artifacts_count=200`, `would_commit=true`, and `would_push=false`.

## Acceptance Criteria

- [x] A bounded publication plan exists.
- [x] Cleanup chapter artifacts are separated from unrelated dirty work.
- [x] Inbox publication and repository publication are not collapsed.
- [x] No push occurs without explicit Operator grant.
