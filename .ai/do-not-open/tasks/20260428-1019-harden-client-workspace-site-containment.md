---
status: closed
closed_at: 2026-04-28T03:41:17.401Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

## Goal
Make client workspace Site placement explicitly prefer `<workspace>/.narada` and warn when Narada governance appears at the visible client workspace root.

## Required Work
1. Tighten client Site bootstrap/doctor output so `workspace_root` and `site_root` are explicit and `.narada` containment is validated.
2. Add doctor warnings for root-level Narada governance artifacts in client/business workspaces (`config.json`, `AGENTS.md`, `README.md`, `.ai`) when the Site root should be `.narada`.
3. Ensure bootstrap guidance files state that client artifacts remain outside Narada unless explicitly admitted.
4. Update Site bootstrap/factorization docs with the client workspace containment rule.
5. Add focused tests for the warning and guidance.

## Acceptance Criteria
- `narada sites doctor <id> --kind client --root <workspace>` warns when root-level Narada governance artifacts exist outside `.narada`.
- `narada sites bootstrap-client` generated AGENTS guidance names `workspace_root`, `site_root`, and the outside-unless-admitted rule.
- Docs state that client/business workspaces default to `.narada` Site roots.
- Focused tests and `pnpm verify` pass.

## Source Observation
Inbox envelope `env_9774e06d-964b-41f7-b100-6882ab17db47` reported that client workspaces should host Narada Sites under `.narada` by default.

## Execution Notes

<!-- Record what was done, decisions made, and files changed. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->
