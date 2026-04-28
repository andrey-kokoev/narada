---
status: closed
closed_at: 2026-04-28T20:40:45.256Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Make inbox checks embodiment-aware

## Chapter

site-embodiments

## Goal

Prevent inbox work checks from missing file-drop messages in configured sibling embodiments such as the Windows clone.

## Context

The Operator pointed out that `narada inbox work-next` missed `D:/code/narada/.ai/inbox-drop/20260428-002-embodiment-aware-authority-routing.md`. Task 1030 made configured embodiments visible in authority preflight, but inbox work checks still only considered the authority clone's canonical inbox and local drop.

## Required Work

1. Admit and handle the missed Windows embodiment drop.
2. Make `inbox next` and `inbox work-next` inspect configured non-current embodiments for admissible file-drop candidates.
3. Include the exact ingest command needed to admit sibling embodiment drops.
4. Avoid warning on already-admitted/idempotently skipped files.
5. Cover the behavior with focused tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Admitted `/mnt/d/code/narada/.ai/inbox-drop/20260428-002-embodiment-aware-authority-routing.md` as `env_0f9cc080-f813-4242-872a-67dd616f6ad6`.
2. Archived the source envelope after representing the executable follow-up as Task 1031.
3. Extended `inbox next` and `inbox work-next` output with `embodiment_file_drops` and `warnings`.
4. Each embodiment file-drop candidate includes `embodiment_id`, `embodiment_root`, `drop_dir`, `pending_file_count`, `command`, and `command_args`.
5. The implementation checks admissible file-drop candidates against existing file-drop source refs, so already-admitted files do not keep producing false pending warnings.
6. Added focused tests for both `inbox work-next` and `inbox next`.

## Verification

TIZ verification:

- `run_1777408491399_bhzvre`: initial focused inbox test passed before idempotency tightening.
- `run_1777408629356_7n1fxx`: focused inbox test failed because the fixture used `001.md`, which is intentionally not an admissible file-drop name.
- `run_1777408686159_4lh74o`: focused inbox test passed with dated numbered file-drop fixture.

Live checks:

- Before archive/tightening, rebuilt CLI showed `inbox work-next` reporting the admitted Windows embodiment envelope and sibling embodiment drop command.
- After archive/tightening, rebuilt CLI showed `inbox work-next` returning no primary work and no embodiment warnings, proving already-admitted sibling files are not treated as pending.
- Inbox export was refreshed for the archived source envelope.
- `narada task lint --chapter 1031 --format json` passed.
- `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json && pnpm verify` passed.

## Acceptance Criteria

- [x] inbox work-next reports pending file-drop candidates from configured non-current embodiments
- [x] inbox next reports the same embodiment file-drop warnings without mutation
- [x] Output includes exact ingest command for the sibling embodiment drop
- [x] Focused tests cover embodiment file-drop detection
- [x] Source inbox envelope is handled through governed pending or archive action
- [x] pnpm verify passes
