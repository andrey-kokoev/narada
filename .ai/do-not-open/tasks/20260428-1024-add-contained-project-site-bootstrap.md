---
status: closed
closed_at: 2026-04-28T04:05:25.562Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

## Goal
Add first-class contained Project Site bootstrap for existing Git-backed project repositories.

## Required Work
1. Add `narada sites bootstrap-project --workspace <project-repo> --site-id <id> --sync git_backed_project_repo` with dry-run default and explicit `--execute` mutation.
2. Generate project-locus config, README, AGENTS guidance, inbox-drop, inbox-envelopes, and contained `.narada` governance layout.
3. Extend `narada sites doctor <id> --kind project --root <workspace>` to validate project Site shape with specific check failures.
4. Document project-contained Site posture in Site bootstrap and Site factorization docs.
5. Add focused tests for dry-run, execute plus project doctor, and unsupported sync posture refusal.
6. Archive the source inbox observation after completion.

## Acceptance Criteria
- Project bootstrap dry-run returns `project_site_bootstrap`, `site_kind: project`, and `git_backed_project_repo` posture without writing files.
- Project bootstrap execute writes contained `.narada` guidance and config.
- Project doctor validates a project Site and reports specific checks.
- Unsupported project sync posture is refused.
- Focused tests and `pnpm verify` pass.

## Source Observation
Inbox envelope `env_c9e7c7a4-e358-400f-a36f-c54024071a80` requested first-class contained Project Site bootstrap.

## Execution Notes

<!-- Record what was done, decisions made, and files changed. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
