---
status: closed
closed_at: 2026-04-28T20:30:43.998Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add Site embodiments preflight for plural clone sync

## Chapter

site-embodiments

## Goal

Make Narada proper model plural clone embodiments explicitly and surface sibling embodiment sync hazards before publication or mutation work.

## Context

Narada proper is itself a Site with plural embodiments. The WSL clone is the mutation authority, while the Windows clone is a read-only/forwarding embodiment. The previous special `.ai/authority-clone.json` used `non_authority_embeddings`, which conflicted with Narada's doctrine vocabulary and did not expose sibling embodiment sync hazards before publication.

## Required Work

1. Replace the ad hoc authority-clone config shape with a canonical `embodiments` key while preserving the legacy reader.
2. Make authority-clone inspection report each configured embodiment, including role, mutation policy, reachability, git posture, tracked dirty count, and inbox-drop file count.
3. Surface embodiment warnings from `narada sites authority preflight`, especially for publication and task lifecycle work.
4. Document `embodiments` as the Site-level key in the relevant doctrine/product docs.
5. Add focused tests for canonical config and sibling inbox-drop detection.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Updated `.ai/authority-clone.json` to declare `site_id: narada-proper` and canonical `embodiments` entries for `wsl-authority` and `windows-clone`.
2. Extended `narada-proper-authority.ts` to read canonical `embodiments`, preserve legacy `non_authority_embeddings`, normalize Windows paths to WSL coordinates, and report per-embodiment posture.
3. Extended `sites authority preflight` output with `embodiments` and `embodiment_warnings`.
4. Kept dirty posture focused on tracked changes by using `git status --porcelain --untracked-files=no`; inbox-drop residue is reported separately.
5. Documented the `embodiments` key in Plural Embodiment / Singular Authority and Site Factorization docs.
6. Added tests for canonical embodiments config and sibling inbox-drop warning detection.

## Verification

TIZ verification:

- `run_1777408070153_700jss`: focused authority/preflight tests passed.
- `run_1777408079510_bzt244`: `pnpm typecheck` passed.
- `run_1777408126825_oyzk6j`: focused authority/preflight tests passed after narrowing dirty-count semantics.

Manual live check after rebuilding CLI:

- `pnpm --filter @narada2/cli build && narada sites authority preflight --mutation-family publication --format json` reports both `wsl-authority` and `windows-clone`.
- The preflight warns that `windows-clone` has one pending inbox-drop file, which is the sync hazard that triggered this arc.
- `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json && pnpm verify` passed.

## Acceptance Criteria

- [x] Narada proper authority config uses a canonical embodiments key while preserving backward compatibility
- [x] Authority clone inspection reports configured embodiments and their freshness/inbox-drop posture
- [x] Site authority preflight includes embodiment sync observations for publication and task lifecycle families
- [x] Docs name embodiments as the Site-level key rather than embeddings
- [x] Focused tests cover canonical embodiments config and sibling inbox-drop detection
- [x] pnpm verify passes
