# Task 297 — Operational Trial Setup Contract

status: closed

## Context

Narada has a coherent mailbox vertical and a private operational repo at `/home/andrey/src/narada.sonar`. Before running live behavior, the trial needs a concrete setup contract so agents do not improvise paths, evidence locations, credentials, or public/private boundaries.

## Goal

Define the exact setup contract for running the `help@global-maxima.com` mailbox operation from `narada.sonar` against the current local Narada source/package state.

## Required Work

1. Inventory `/home/andrey/src/narada.sonar` structure without copying private content into the public repo.
2. Identify the intended config file, operation id, mailbox id, data directory, and command entrypoints.
3. Confirm how `narada.sonar` consumes Narada: local workspace link, published `@narada2/*` packages, or direct script invocation.
4. Define the prerequisite checklist:
   - dependencies installed
   - config schema validates
   - Graph credentials resolvable
   - charter runtime credentials resolvable or explicitly mock/offline
   - daemon command known
   - CLI inspection commands known
   - evidence directory exists in private repo
5. Document the setup contract in the public repo without including secrets, raw mailbox content, or private Graph identifiers.
6. If private repo edits are needed, keep them in `narada.sonar` and reference only the path/shape from public task notes.

## Deliverables

- Public setup contract document or task notes describing how the trial is initialized.
- Private evidence directory convention for this trial, described by path shape only.
- Clear list of commands to run next, with config path and operation id.

## Non-Goals

- Do not run the live mailbox trial.
- Do not send mail.
- Do not create a second vertical.
- Do not move private operational config into the public repo.

## Acceptance Criteria

- [x] The setup contract names the exact operation, config path, and evidence path shape.
- [x] The public/private boundary is explicit.
- [x] The contract identifies whether Narada is consumed locally or from published packages.
- [x] The next task can run the trial without guessing paths or prerequisites.
- [x] No private message bodies, secrets, raw Graph IDs, or credentials are written to `narada`.

## Execution Notes

### Deliverables

1. **`docs/operational-trial-setup-contract.md`** (new, public repo) — Canonical document defining:
   - Exact operation identity (`help-global-maxima` scope, `help@global-maxima.com` mailbox)
   - Exact config path (`~/src/narada.sonar/config/config.json`)
   - Exact data root (`~/mailboxes/help-global-maxima`)
   - Repo layout diagrams for both public and private repos
   - Narada consumption model: local workspace file links via pnpm workspace, not published packages
   - Prerequisite checklist (build state, install state, credentials, config validation)
   - Command reference table (`pnpm run:once`, `pnpm sync`, `pnpm status`, `pnpm daemon`)
   - Evidence directory convention (`~/src/narada.sonar/evidence/<task-number>-<description>/`)
   - Public/private boundary table

2. **Private evidence directory** (`narada.sonar`) — Created:
   - `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/`
   - Subdirectories: `screenshots/`, `sql-dumps/`, `decisions/`
   - `README.md` referencing the public setup contract

### Key Findings

- **Narada consumption:** `narada.sonar` uses `file:../narada/packages/...` dependencies plus pnpm workspace entries. This means `pnpm install` in `narada.sonar` is required after `pnpm build` in `narada` to sync file-link artifacts.
- **Stale links observed:** At time of inventory, `narada.sonar/node_modules/@narada2/cli/dist/commands/` was missing ~45 files that exist in `narada/packages/layers/cli/dist/commands/`. This would cause `ERR_MODULE_NOT_FOUND` on CLI invocation. Documented in setup contract as a known issue with remediation.
- **Outbound posture:** Config has `require_human_approval: false`, but `allowed_actions` excludes `send_reply`, so the effective posture is draft-only. This is safe for trial.
- **Charter runtime:** Configured for `kimi-api` (Moonshot). Trial can run with mock/offline runner by omitting `NARADA_KIMI_API_KEY`.
- **Knowledge directory:** `narada.sonar/mailboxes/help@global-maxima.com/knowledge/` is empty. Trial may proceed with empty knowledge (non-authoritative), but populating it improves reply quality.

### Boundary Preservation

- No secrets, credentials, or `.env` values written to public repo
- No mailbox message bodies or Graph identifiers written to public repo
- No operational data copied from private repo
- Private evidence directory created only in `narada.sonar`
- Setup contract references paths by shape, not by content
