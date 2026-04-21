# Task 301 — Operational Gap Capture and Public/Private Split

Status: completed

Depends on: 300

## Context

The live trial will expose real gaps. The system needs disciplined conversion from private evidence into public product work without leaking operational data or turning every observation into architecture churn.

## Goal

Convert the operational trial results into a clean public backlog and a private evidence archive.

## Required Work

1. Review private evidence from Tasks 299 and 300.
2. Classify every observed issue:
   - blocker
   - operational papercut
   - documentation/runbook gap
   - product hardening
   - future work
   - no-action observation
3. Create public task files only for issues that require public repo work.
4. Keep private operational evidence in `narada.sonar`.
5. Ensure public tasks include redacted symptoms, affected surfaces, expected behavior, acceptance criteria, and focused verification guidance.
6. Explicitly mark deferred observations that should not become immediate tasks.

## Deliverables

- Public gap inventory or decision artifact.
- Public corrective tasks, if needed.
- Private evidence archive remains in the ops repo.

## Non-Goals

- Do not fix all gaps in this task.
- Do not create decorative architecture tasks.
- Do not copy private evidence into public tasks.

## Acceptance Criteria

- [x] Every trial issue is classified.
- [x] Public tasks exist for actionable public repo work.
- [x] Private evidence remains private.
- [x] Deferred items are named with rationale.
- [x] No duplicate or overlapping tasks are created.

## Execution Notes

### Private Evidence Reviewed

- `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/commands.log` — daemon sync output
- `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/TRIAL-RUNBOOK.md` — operator runbook
- `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/evidence-template.md` — evidence template (unfilled, no trial stages executed)

### Findings Classification

| # | Finding | Classification | Action |
|---|---------|---------------|--------|
| 1 | Graph API inbox empty; no messages to sync | Blocker (operational) | Task 303 already created |
| 2 | CLI/daemon do not auto-load `.env` | Operator UX issue | **Task 304 created** — public product task |
| 3 | pnpm file links stale after Narada source rebuild | Docs/setup issue | Deferred — already documented in `docs/operational-trial-setup-contract.md` |
| 4 | No `sqlite3` binary on host | Operational papercut | Deferred — environment-specific, not a Narada gap |
| 5 | Cursor reset works correctly | No-action observation | Positive finding, no task needed |
| 6 | Coordinator schema auto-initializes | No-action observation | Positive finding, no task needed |
| 7 | Dry-run sync works correctly | No-action observation | Positive finding, no task needed |
| 8 | Old `exchange-fs-sync` messages not auto-migrated | Future work / no action | Deferred — migration from old system is out of trial scope |

### Public Tasks Created

- **Task 304:** `.ai/tasks/20260420-304-cli-daemon-dotenv-auto-load.md` — CLI and daemon should auto-load `.env` to remove operator friction.

### Deferred Rationale

- **pnpm file link staleness:** Documented in `docs/operational-trial-setup-contract.md` with explicit remediation (`pnpm install` in ops repo after source rebuild). No code change needed.
- **Missing `sqlite3` binary:** The host environment lacks the SQLite CLI tool. Queries were performed via Node.js `better-sqlite3` instead. This is an environment gap, not a product gap.
- **Old message migration:** The 8 messages synced by the previous `exchange-fs-sync` system are not automatically ingested into the new Narada fact store. This is expected; the new system uses a different pipeline. A formal migration tool is future work, not a trial blocker.

### Boundary Preservation

- No private evidence copied into public repo
- No message bodies, Graph IDs, or credentials exposed
- Duplicate Task 301 file removed

### Note on Task 304

Task 304 (`.env` auto-loading) touches the secret resolution precedence documented in `AGENTS.md`. It does not introduce a new precedence level; `.env` values are loaded into `process.env` only when the variable is not already set, preserving env vars as the highest-precedence source. This is a UX convenience, not a secret-model change. Task 301's classification of "no duplicate tasks" was reviewed against this: no existing task covers `.env` auto-loading, though the precedence rules it must respect are already documented.
