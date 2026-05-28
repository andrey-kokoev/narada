---
status: confirmed
depends_on: [1440]
closed_at: 2026-05-17T00:41:06.854Z
closed_by: narada.builder2
governed_by: chapter_close:narada.builder2
closure_mode: peer_reviewed
---

# Document Site communication and chat operations posture

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1457-1463-site-communication-surface.md

## Goal

Document how operators should understand Site messaging, receipts, and Site-scope projected chat.

## Context

Communication UI and chat can easily be mistaken for Site authority. Docs must preserve the boundary: messages are outbound envelopes, chat is projection-scoped intelligence, and target Site admission remains local authority.

## Required Work

1. Document direct message composer behavior, token/capability posture, and receipt states.
2. Document Site-scope projected chat, allowed context, forbidden context, and send-only-through-inbox invariant.
3. Document delivery receipt versus target Site admission receipt.
4. Document residuals for future registry-scope chat or delegated-send capability.
5. Add docs or package tests that enforce core no-authority labels if practical.

## Non-Goals

- Do not document chat as a task execution agent.
- Do not claim registry possession of target Site authority.
- Do not document secrets as browser-stored or D1-stored values.

## Execution Notes

- Added `Operator Communication Posture` to
  `packages/site-registry-cloudflare/README.md`.
- Documented direct message composer behavior: selected-Site scope,
  browser-entered send token, target endpoint, capability reference, message
  kind, subject/body, and shared `/api/site-communications/send` crossing.
- Documented that raw bearer tokens are transport-time inputs only and must not
  be stored or echoed in D1 rows, HTML, fixtures, logs, docs, chat context, or
  responses.
- Documented delivery receipt versus target Site admission receipt and the v0
  `recorded_not_delivered` posture.
- Documented Site-scope projected chat as projection-scoped intelligence with
  allowed and forbidden context, send-only-through-inbox invariant, and no
  direct task/config/relation/secret/capability authority.
- Added operator operations posture to
  `docs/product/site-communication-surface.v0.md`, including residuals for
  registry-wide chat, delegated send, and future live transport delivery.
- Added `packages/site-registry-cloudflare/test/communication-docs.test.ts` to
  enforce core docs labels for delivery/admission, no-authority, no-secret,
  Site-scope chat, shared send API, and residual posture.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 6 files, 64
  tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `git diff --check -- packages/site-registry-cloudflare/README.md
  docs/product/site-communication-surface.v0.md
  packages/site-registry-cloudflare/test/communication-docs.test.ts
  .ai/do-not-open/tasks/20260517-1462-document-site-communication-and-chat-operations-posture.md`
  passed.
- `narada verify suggest --files ...` returned `pnpm verify` as the baseline
  suggestion.
- `pnpm verify` still fails on the pre-existing unrelated CLI output admission
  guard in `sites-register.ts:69`, `sites-register.ts:85`, and
  `sites-register.ts:141`; the task file guard passes.

## Acceptance Criteria

- [x] Operator docs explain Site communication surface.
- [x] Docs distinguish delivery from admission.
- [x] Docs classify chat as projection-scoped intelligence without direct authority.
- [x] No-authority and no-secret posture is explicit.
- [x] Future residuals are named without overclaiming.
