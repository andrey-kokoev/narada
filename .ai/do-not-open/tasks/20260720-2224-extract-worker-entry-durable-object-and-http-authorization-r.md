---
status: closed
depends_on: [2222, 2223]
criteria_proved_by: operator
criteria_proved_at: 2026-07-20T23:41:59.046Z
criteria_proof_verification:
  state: unbound
  rationale: MCP surfaces are unavailable for this run; evidence is local and independently reproducible from direct boundary tests, the full 767-test package suite, deployment contract checks, and Wrangler dry-run.
closed_at: 2026-07-20T23:44:12.374Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Extract Worker entry, Durable Object, and HTTP authorization routing

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260720-2223-2229-cloudflare-carrier-organization.md

## Goal

Separate the Worker fetch entrypoint, Durable Object session lifecycle, and authenticated HTTP routing into independently testable modules.

## Context

The current entry module combines request authentication, site admission, Durable Object serialization, alarms, snapshots, and response shaping.

## Required Work

1. Move Worker fetch/export wiring into an entry module with minimal composition responsibility.
2. Move Durable Object loading, lane serialization, snapshot persistence, and alarm handling into a Durable Object module.
3. Move authentication, site binding admission, authority checks, and HTTP response adaptation into routing modules.
4. Preserve the existing request and response contracts, status codes, principal evidence, and error codes.
5. Add boundary tests proving the extracted modules can be exercised without importing the entire product console and read-model surface.

## Non-Goals

- Do not redesign authentication or site authority policy.
- Do not change Durable Object storage semantics.
- Do not extract product operation handlers yet.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification


- node --test boundary tests: passed 9/9
- node --test src/cloudflare-carrier.test.mjs src/cloudflare-intelligence-resolution.test.mjs: passed 109/109
- pnpm --filter @narada2/cloudflare-carrier test: passed 767/767
- pnpm --filter @narada2/cloudflare-carrier deploy:check: passed; all carrier deployment boundary checks returned status ok
- pnpm --filter @narada2/cloudflare-carrier deploy:dry-run: passed; Wrangler recognized worker-entry.mjs, Durable Object, D1, and AI bindings
- git diff --check -- scoped task 2224 files: passed
## Acceptance Criteria

- [x] The Worker entry module contains only composition and fetch/alarm registration.
- [x] Durable Object lifecycle tests pass without loading unrelated product handlers or console code.
- [x] Authenticated session and site-product HTTP behavior remains contract-compatible.
- [x] The full Cloudflare carrier suite passes.
