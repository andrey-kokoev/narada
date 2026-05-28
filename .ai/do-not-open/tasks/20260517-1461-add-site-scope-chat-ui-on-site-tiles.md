---
status: confirmed
depends_on: [1440]
closed_at: 2026-05-17T00:39:08.004Z
closed_by: narada.builder2
governed_by: chapter_close:narada.builder2
closure_mode: peer_reviewed
---

# Add Site-scope chat UI on Site tiles

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1457-1463-site-communication-surface.md

## Goal

Add hosted UI for chatting about one selected Site's published projection, with message sending mediated by the same composer/send crossing.

## Context

Once the chat runtime boundary exists, the registry UI can expose a per-Site chat panel. The panel must visibly scope the conversation to the selected Site and separate answer, proposed message, and send confirmation states.

## Required Work

1. Add per-Site chat action and panel in the registry UI.
2. Render scope banner such as `Chatting about <site_id>` and show projection freshness.
3. Display answers with source/projection basis where available.
4. Render proposed inbox messages as drafts requiring explicit send confirmation unless a governed delegated-send capability is later added.
5. Use the same guarded send API for submitted messages.
6. Add tests for selected-Site scope, no registry-wide default, draft/send distinction, and no direct mutation controls.

## Non-Goals

- Do not add autonomous chat sends.
- Do not add cross-Site comparison chat.
- Do not render private or raw Site data.

## Execution Notes

- Added a per-Site `Chat` action next to the existing `Message` action on
  eligible active/public Site tiles.
- Added a scoped chat panel that renders `Chatting about <site_id>`, projection
  freshness, and the selected Site projection reference.
- Implemented deterministic browser-side projection answers from the tile's
  bounded projection snapshot: health, freshness, relation posture, open-task
  count, and inbox posture.
- Added draft message generation from chat prompts. Drafts are visibly distinct
  from sends and require explicit token, delivery endpoint, capability ref, and
  send confirmation.
- Chat draft submission uses the same
  `POST /api/site-communications/send` API and preserves chat provenance in the
  outbound envelope payload.
- Kept the UI projection-only: no registry-wide chat default, no direct task,
  Site config, registry relation, secret, or local admission controls.
- Extended Worker-render tests for selected-Site chat scope, projection basis,
  draft/send distinction, shared API use, no registry-wide default, and no raw
  bearer values.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 5 files, 63
  tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `git diff --check -- packages/site-registry-cloudflare/src/index.ts
  packages/site-registry-cloudflare/test/worker-boundary.test.ts
  .ai/do-not-open/tasks/20260517-1461-add-site-scope-chat-ui-on-site-tiles.md`
  passed.
- `narada verify suggest --files ...` returned `pnpm verify` as the baseline
  suggestion.
- `pnpm verify` still fails on the pre-existing unrelated CLI output admission
  guard in `sites-register.ts:69`, `sites-register.ts:85`, and
  `sites-register.ts:141`; the task file guard passes.

## Acceptance Criteria

- [x] Chat UI is available per selected Site.
- [x] Scope and projection freshness are visible.
- [x] Message drafts and sends are distinguished.
- [x] Send uses the shared message API.
- [x] Tests prove no direct mutation or cross-Site leakage.
