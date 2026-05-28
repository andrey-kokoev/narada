---
status: closed
depends_on: [1432, 1440]
closed_at: 2026-05-17T00:07:52.546Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Implement site-operational-dashboard package core

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1448-1455-common-site-operational-dashboard-generator.md

## Goal

Create a reusable package that renders Site operational dashboard snapshots into bounded static HTML.

## Context

The reusable core should accept structured dashboard snapshots and render them. It should not know about Staccato, Cloudflare, BigCommerce, Klaviyo, mailbox internals, or local path conventions.

## Required Work

1. Create `packages/site-operational-dashboard` with TypeScript build/test setup matching repo package patterns.
2. Implement dashboard row, section summary, snapshot validation, HTML escaping, safe JSON embedding, and static HTML renderer.
3. Preserve a compact observation row shape with state, basis, evidence refs/paths, observed_at, next_action, detail, freshness, and authority limits.
4. Include default CSS/JS for filtering sections, state filters, attention rows, and embedded payload inspection without external assets.
5. Add tests for escaping, no `[object Object]`, no raw secret markers, section summaries, attention filtering, and JSON payload embedding.

## Non-Goals

- Do not read local Site files in the core package.
- Do not start a server in the core package.
- Do not add domain-specific row providers.
- Do not add mutation controls.

## Execution Notes

- Created `packages/site-operational-dashboard` as
  `@narada2/site-operational-dashboard` with repo-standard TypeScript,
  typecheck, build, and Vitest scripts.
- Implemented a pure static renderer API in
  `packages/site-operational-dashboard/src/index.ts`:
  `validateDashboardSnapshot`, `summarizeDashboardSections`,
  `renderDashboardHtml`, `escapeHtml`, and `safeJsonForHtml`.
- Preserved a compact observation row shape with `state`, `basis`,
  `evidence_refs`, `evidence_paths`, `observed_at`, `next_action`, `detail`,
  `freshness`, and `authority_limits`.
- Added bounded snapshot validation for required fields, row states, embedded
  JSON byte limits, and raw secret marker patterns before rendering.
- Added static HTML output with embedded
  `narada.site_operational_dashboard.snapshot.v0` JSON payload in an
  `application/json` script tag, default CSS, section/state filters,
  attention-only filtering, and payload inspection JavaScript with no external
  assets.
- Kept the core package domain-agnostic: it accepts caller-provided snapshot
  objects and does not read local Site files, start a server, add
  Staccato-specific rows, or expose mutation controls.
- Added README usage/posture notes for the package.

## Verification

- `pnpm --filter @narada2/site-operational-dashboard test` passed: 7 tests.
- `pnpm --filter @narada2/site-operational-dashboard typecheck` passed.
- `pnpm --filter @narada2/site-operational-dashboard build` passed.
- `rg -n "readFile|writeFile|createServer|listen\\(|staccato|bigcommerce|klaviyo|mutation|mutate|button.*assign|button.*approve" packages/site-operational-dashboard/src packages/site-operational-dashboard/test packages/site-operational-dashboard/README.md` found no file/server/domain-specific implementation; matches were only README non-goal text and authority-limit fixture strings.
- `git diff --check -- packages/site-operational-dashboard .ai/do-not-open/tasks/20260517-1449-implement-site-operational-dashboard-package-core.md` passed.
- `narada verify suggest --files ...` recommended `pnpm verify`.
- `pnpm verify` failed at the pre-existing unrelated CLI output admission guard
  in `sites-register.ts` lines 69, 85, and 141; task file guard passed.

## Acceptance Criteria

- [x] Package builds and tests pass.
- [x] Static renderer outputs a complete HTML dashboard with embedded bounded JSON payload.
- [x] Renderer tests prove no secret-token patterns and no raw object leakage.
- [x] Core package is Site/domain agnostic.
