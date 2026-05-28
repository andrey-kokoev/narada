---
status: confirmed
depends_on: [1440]
closed_at: 2026-05-17T00:32:52.645Z
closed_by: narada.builder2
governed_by: chapter_close:narada.builder2
closure_mode: peer_reviewed
---

# Add Site Registry message composer UI

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1457-1463-site-communication-surface.md

## Goal

Add a selected-Site message composer to the hosted registry UI using the shared inbox-message send API.

## Context

Site tiles should expose a clear way to send an inbox message to that Site. The UI must make scope visible and display delivery/receipt status without implying the message has been admitted or executed by the target Site.

## Required Work

1. Add per-Site message action and composer UI in the Site Registry page.
2. Show selected target Site identity and relation/posture warnings before send.
3. Use the guarded message-send API and existing token-entry pattern where applicable.
4. Display sent, delivery receipt, admission receipt, rejected, and pending states distinctly.
5. Add UI tests or Worker-render tests for scope labeling, no secret leakage, unauthorized state, and receipt state rendering.

## Non-Goals

- Do not add chat UI in this task.
- Do not add direct task/lifecycle action buttons.
- Do not claim successful delivery means target Site admission.

## Execution Notes

- Added a per-Site `Message` action to the hosted Site Registry tile UI.
- Added a scoped composer panel that labels the selected target Site, relation
  state/visibility, and the warning that delivery receipt is separate from
  target Site admission.
- The composer uses the shared `POST /api/site-communications/send` route with
  browser-local bearer token entry, HTTPS delivery endpoint input, capability
  ref input, message kind, subject, and bounded body.
- Composer responses render delivery receipt and admission receipt separately
  for pending, accepted/duplicate, refused/unauthorized, and request-error
  states.
- Kept the UI projection-only: no task/lifecycle controls, no registry relation
  mutation controls, no target Site mutation claims, and the token field is
  cleared after submit.
- Added a Worker-render test for composer scope labels, receipt labels, shared
  send route use, refusal/error rendering, and absence of raw bearer values in
  the page shell.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 4 files, 57
  tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `git diff --check -- packages/site-registry-cloudflare/src/index.ts
  packages/site-registry-cloudflare/test/worker-boundary.test.ts
  .ai/do-not-open/tasks/20260517-1459-add-site-registry-message-composer-ui.md`
  passed.
- `narada verify suggest --files ...` returned `pnpm verify` as the baseline
  suggestion.
- `pnpm verify` still fails on the pre-existing unrelated CLI output admission
  guard in `sites-register.ts:69`, `sites-register.ts:85`, and
  `sites-register.ts:141`; the task file guard passes.

## Acceptance Criteria

- [x] Each eligible Site can open a scoped message composer.
- [x] Composer sends through the shared API.
- [x] UI labels target Site and receipt/admission state accurately.
- [x] Unauthorized or ineligible state is visible and bounded.
- [x] Tests cover scope and receipt rendering.
