---
status: closed
depends_on: [2222, 2227]
criteria_proved_by: operator
criteria_proved_at: 2026-07-21T01:15:34.428Z
criteria_proof_verification:
  state: unbound
  rationale: MCP surfaces unavailable; evidence was collected through the repository task CLI, PowerShell, standalone console tests, Worker route tests, carrier suite, deploy check, Wrangler dry run, and the authenticated canonical smoke's console check.
closed_at: 2026-07-21T01:22:49.703Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Extract the Cloudflare operator console from the Worker module

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260720-2223-2229-cloudflare-carrier-organization.md

## Goal

Make the operator console a separately reviewable and testable frontend surface while keeping the Worker responsible only for asset delivery and API composition.

## Context

The Worker currently embeds thousands of lines of HTML, CSS, and browser JavaScript in a template literal alongside server routing and persistence code.

## Required Work

1. Move console markup, styles, and browser behavior into a dedicated console source surface.
2. Define a small asset delivery boundary for the Worker.
3. Preserve authenticated console behavior, operation focus, continuity, task, mailbox, and evidence workflows.
4. Add browser or fixture-level tests for the extracted UI modules without loading server persistence code.
5. Keep deployment output deterministic and verify the generated asset is served through the existing route.

## Non-Goals

- Do not redesign the console interaction model.
- Do not introduce a new frontend framework unless required by an existing package boundary.
- Do not change API contracts.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification


- node --test src/cloudflare-operator-console.test.mjs: 2/2 passed; standalone source has no server persistence imports and browser script parses
- node --test src/cloudflare-carrier.test.mjs --test-name-pattern "minimal authenticated web console shell": 94/94 focused carrier tests passed; console route test passed
- pnpm --filter @narada2/cloudflare-carrier test: 768/768 passed
- pnpm --filter @narada2/cloudflare-carrier deploy:check: ok; console surface and Worker route checked
- pnpm --filter @narada2/cloudflare-carrier deploy:dry-run: ok; deterministic Wrangler bundle produced
- authenticated canonical live smoke: ok; live bearer smoke checked the served console surface before exercising the canonical provider/task path
## Acceptance Criteria

- [x] The Worker no longer contains the full console source as an inline template literal.
- [x] Console source and server source have separate test boundaries.
- [x] Authenticated console smoke and build/deploy checks pass.
- [x] No operator workflow loses its existing readback or authority posture.
