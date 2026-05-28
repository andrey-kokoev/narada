---
status: confirmed
depends_on: [1440]
closed_at: 2026-05-17T00:36:31.242Z
closed_by: narada.builder2
governed_by: chapter_close:narada.builder2
closure_mode: peer_reviewed
---

# Specify and stub Site-scope projected chat runtime

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1457-1463-site-communication-surface.md

## Goal

Create the non-provider-specific chat runtime boundary for a selected Site projection and a compose/send-message-only tool surface.

## Context

Chat should answer from the selected Site's published projection and may only compose or send inbox messages through the shared communication API. The first implementation should prove the boundary and fixtures before choosing a production LLM provider.

## Required Work

1. Define chat request/response schema with mandatory selected `site_id` and projection snapshot reference.
2. Implement a stub or deterministic fixture-backed chat responder that can answer from bounded Site projection context.
3. Implement tool schema for proposed inbox envelope composition and explicit send through the shared API only.
4. Refuse requests that ask for private data, cross-Site data, secret access, or direct mutation.
5. Add tests for scope isolation, projection-only answers, compose-only output, send-through-API behavior, and refusal cases.

## Non-Goals

- Do not wire a live commercial LLM provider in this task.
- Do not give chat direct D1 mutation tools except the shared guarded message-send route.
- Do not expose registry-wide chat as the default.
- Do not read local Site files.

## Execution Notes

- Added `packages/site-registry-cloudflare/src/site-scope-chat.ts` as a
  provider-free Site-scope projected chat runtime boundary.
- Defined chat request/response and tool schema types requiring
  `chat_scope: site_projection`, selected `site_id`, and `projection_ref`.
- Implemented deterministic projection-only answers from an explicit bounded
  projection context: health/freshness, relation posture, dashboard rows, and
  public receipt summaries.
- Implemented compose and submit tool plans only for
  `compose_site_inbox_message` and `submit_site_inbox_message`. Submit plans
  point at `POST /api/site-communications/send` and do not carry bearer token
  values.
- Added refusal handling for missing scope, projection mismatch, private task
  DBs, raw inbox payloads, raw logs/traces, secrets/tokens, unexported
  filesystem state, cross-Site/registry-wide requests, and direct mutation
  requests.
- Exported the runtime from the root package and added the
  `./site-scope-chat` package export.
- Added focused tests for required scope, projection-only answers, cross-Site
  and private-data refusals, compose-only output, shared-API send plans, and
  absence of direct mutation capability.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 5 files, 63
  tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `git diff --check -- packages/site-registry-cloudflare/src/site-scope-chat.ts
  packages/site-registry-cloudflare/test/site-scope-chat.test.ts
  packages/site-registry-cloudflare/src/index.ts
  packages/site-registry-cloudflare/package.json
  .ai/do-not-open/tasks/20260517-1460-specify-and-stub-site-scope-projected-chat-runtime.md`
  passed.
- `narada verify suggest --files ...` returned `pnpm verify` as the baseline
  suggestion.
- `pnpm verify` still fails on the pre-existing unrelated CLI output admission
  guard in `sites-register.ts:69`, `sites-register.ts:85`, and
  `sites-register.ts:141`; the task file guard passes.

## Acceptance Criteria

- [x] Chat runtime schema requires selected Site scope.
- [x] Stub responder uses projection-only context.
- [x] Chat can propose/submit inbox envelopes only through the shared send path.
- [x] Tests prove cross-Site and private-data refusals.
- [x] No direct mutation capability is exposed to chat.
