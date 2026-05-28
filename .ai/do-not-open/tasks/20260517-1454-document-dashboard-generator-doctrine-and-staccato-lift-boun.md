---
status: closed
depends_on: [1432, 1440]
amended_by: narada.architect
amended_at: 2026-05-17T00:14:28.361Z
closed_at: 2026-05-17T00:21:48.843Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Document dashboard generator doctrine and Staccato lift boundary

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1448-1455-common-site-operational-dashboard-generator.md

## Goal

Document how the common dashboard generator should be used and what was intentionally not lifted from Staccato.

## Context

The dashboard generator is an observation surface. Its docs must prevent future drift where UI cards, local server endpoints, or route knowledge become authority.

## Required Work

1. Document the dashboard generator package/CLI/server usage.
2. Document the observation-not-evidence posture and no-authority invariants.
3. Document Staccato lift boundary: reusable mechanics versus site-specific row providers.
4. Document provider authoring rules, row state vocabulary, freshness, evidence refs, and secret redaction.
5. Document live-server access posture: 127.0.0.1 default bind, token-guarded sensitive data routes, Staccato-style browser token entry, localStorage bearer requests, clear-token flow, and the limits of localStorage as ergonomic cache rather than secure secret storage.
6. Add docs tests or package tests that enforce key contract labels if the repo has a pattern for this.

## Non-Goals

- Do not claim dashboards can close tasks, admit inbox, grant capabilities, or mutate Sites.
- Do not make Staccato paths part of Narada defaults.
- Do not create remote hosted dashboard deployment docs in this chapter.
- Do not claim browser localStorage is a secure secret store or a durable Narada capability registry.

## Execution Notes

- Amended by narada.architect at 2026-05-17T00:14:28.361Z: required work, non-goals, appended criteria
- Expanded `packages/site-operational-dashboard/README.md` with package usage,
  Narada proper provider usage, CLI-generation posture, local server posture,
  provider authoring rules, row state vocabulary, freshness/evidence
  requirements, secret redaction, and Staccato lift boundary.
- Documented the dashboard as an observation surface: rows display bounded
  posture and evidence coordinates, but do not admit evidence, close tasks,
  triage inbox, grant capabilities, rotate secrets, or mutate Site state.
- Documented current local server behavior as read-only `GET`/`HEAD` HTML and
  snapshot routes, with default local live-server binding posture of
  `127.0.0.1`.
- Documented the required token posture for any future sensitive local routes:
  bearer-token guarded routes, Staccato-style browser token entry,
  `Authorization: Bearer ...` requests, clear-token control, and `localStorage`
  as ergonomic cache only, not secure secret storage or a durable Narada
  capability registry.
- Documented reusable Staccato mechanics versus non-lifted Staccato-specific
  paths, campaign/report/domain rows, hosted coordinates, branding, and mutation
  controls.
- Added `packages/site-operational-dashboard/test/dashboard-docs.test.ts` to
  enforce key documentation labels and contract posture.

## Verification

- `pnpm --filter @narada2/site-operational-dashboard test` passed: 3 files, 19
  tests.
- `pnpm --filter @narada2/site-operational-dashboard typecheck` passed.
- `pnpm --filter @narada2/site-operational-dashboard build` passed.
- `git diff --check -- packages/site-operational-dashboard/README.md packages/site-operational-dashboard/test/dashboard-docs.test.ts .ai/do-not-open/tasks/20260517-1454-document-dashboard-generator-doctrine-and-staccato-lift-boun.md` passed.
- `narada verify suggest --files ...` recommended `pnpm verify`.
- `pnpm verify` failed at the pre-existing unrelated CLI output admission guard
  in `sites-register.ts` lines 69, 85, and 141; task file guard passed.

## Acceptance Criteria

- [x] Usage and provider authoring docs exist.
- [x] Docs explicitly classify dashboard output as observation surface.
- [x] Staccato lift boundary is documented.
- [x] No-authority/no-secret invariants are documented and tested where practical.
- [x] Docs cover token-guarded live server posture, Staccato-style localStorage bearer flow, clear-token behavior, and localStorage limitations.
