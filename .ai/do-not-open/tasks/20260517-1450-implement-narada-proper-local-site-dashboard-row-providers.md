---
status: closed
depends_on: [1432, 1440]
closed_at: 2026-05-17T00:18:03.579Z
closed_by: narada.builder2
closure_mode: peer_reviewed
reopened_at: 2026-05-17T00:19:14.410Z
reopened_by: narada.builder
---

# Implement Narada proper local Site dashboard row providers

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1448-1455-common-site-operational-dashboard-generator.md

## Goal

Add reusable local row providers for Narada proper Site posture using existing local authority surfaces.

## Context

Narada proper needs row providers for local Site identity, task lifecycle, roster/agents, inbox, publication/telemetry, capabilities, and operator attention. Providers produce observations only and must preserve target-locus and authority posture.

## Required Work

1. Implement row providers that read bounded local artifacts or command outputs for Narada proper without mutating state.
2. Cover Site identity/loci, task lifecycle snapshot, roster/agents, inbox/inbox-drop, publication/telemetry state, package/build posture, capability/secret posture, and residual/operator attention rows.
3. Expose provider functions that can be composed into a dashboard snapshot.
4. Include freshness and basis for every row.
5. Add tests with fixture directories/databases or JSON snapshots; do not depend on the live dirty worktree.

## Non-Goals

- Do not run lifecycle mutation commands.
- Do not make direct SQLite reads authoritative when sanctioned exports/providers exist.
- Do not expose raw inbox payloads or secrets.
- Do not add Site-specific Staccato rows.

## Execution Notes

- Added `packages/site-operational-dashboard/src/narada-proper.ts` as a
  separate Narada proper provider module exported at
  `@narada2/site-operational-dashboard/narada-proper`.
- Providers consume caller-supplied bounded artifacts or lazy read functions;
  they do not read the live dirty worktree directly, run commands, or mutate
  task/inbox/lifecycle/roster/publication/secret state.
- Implemented provider coverage for Site identity/loci, task lifecycle,
  roster/agents, inbox, inbox-drop, publication, telemetry/readiness,
  package/build posture, capability/secret posture, residuals, and work-next.
- Added `collectNaradaProperDashboardSections`,
  `buildNaradaProperDashboardSnapshot`, and `flattenDashboardRows` so callers
  can compose provider output into the static renderer from task 1449.
- Every row includes basis, observed time, freshness, evidence refs, bounded
  detail, next action, and explicit no-authority/no-mutation limits.
- Missing artifacts become `unknown` rows with `freshness.status = "missing"`
  and `missing:<row-id>` evidence refs instead of direct SQLite reads or
  invented readiness.
- Secret-like detail keys/values are redacted before provider output reaches
  snapshot validation/rendering.
- Fixed adjacent dashboard detail typing in `src/index.ts` by converting
  optional relation/publication detail fields to defined bounded strings,
  preserving strict `DashboardDetail` without allowing `undefined` values.

## Verification

- `pnpm --filter @narada2/site-operational-dashboard test` passed: 2 files, 15
  tests.
- `pnpm --filter @narada2/site-operational-dashboard typecheck` passed.
- `pnpm --filter @narada2/site-operational-dashboard build` passed.
- Scope search over the Narada proper provider found no file writes, shell
  spawning, lifecycle mutation commands, Staccato/BigCommerce/Klaviyo rows, or
  raw secret output path. Matches were limited to the redaction test fixture,
  redaction assertions, and redaction marker code.
- `git diff --check -- packages/site-operational-dashboard .ai/do-not-open/tasks/20260517-1450-implement-narada-proper-local-site-dashboard-row-providers.md` passed.
- `narada verify suggest --files ...` recommended `pnpm verify`.
- `pnpm verify` failed at the pre-existing unrelated CLI output admission guard
  in `sites-register.ts` lines 69, 85, and 141; task file guard passed.

## Acceptance Criteria

- [x] Narada proper row providers produce bounded observation rows.
- [x] Every row includes basis, freshness/observed_at, evidence reference, and no-authority posture.
- [x] Tests cover fixture input and missing-data posture.
- [x] No provider mutates task, inbox, lifecycle, roster, publication, or secrets.
