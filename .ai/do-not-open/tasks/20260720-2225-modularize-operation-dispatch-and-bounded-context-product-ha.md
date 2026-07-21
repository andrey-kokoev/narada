---
status: closed
depends_on: [2222, 2224]
criteria_proved_by: operator
criteria_proved_at: 2026-07-20T23:50:29.085Z
criteria_proof_verification:
  state: unbound
  rationale: MCP surfaces are unavailable for this run; local registry contract tests, full Cloudflare carrier tests, deployment checks, and Wrangler dry-run provide reproducible evidence.
closed_at: 2026-07-20T23:56:15.807Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Modularize operation dispatch and bounded-context product handlers

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260720-2223-2229-cloudflare-carrier-organization.md

## Goal

Replace the monolithic operation chain with explicit handler registries grouped by bounded context.

## Context

Site, operation, continuity, task lifecycle, mailbox, local ingress, repository publication, resident dispatch, webhook delay, and file-materialization operations are currently selected by scattered string lists and a large conditional chain.

## Required Work

1. Create one operation metadata/handler registry for supported operations, mutation class, authority requirements, and response shaping.
2. Extract handlers into bounded-context modules for site and operation control, continuity, task lifecycle, mailbox, local ingress, repository publication, resident dispatch, webhook delay, and file materialization.
3. Make unsupported-operation behavior and authority denial behavior come from the registry boundary.
4. Add contract tests that each registered operation has one handler and that no handler is reachable through an unregistered operation.
5. Preserve operation names, payloads, error codes, and read-model projections.

## Non-Goals

- Do not change the canonical operation ontology.
- Do not merge distinct bounded contexts merely to reduce file count.
- Do not change external authority ownership.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification


- node --test src/cloudflare-operation-registry.test.mjs src/cloudflare-product-operation-registry.test.mjs: passed 4/4; 91 unique operations across nine bounded contexts and unknown-operation refusal
- node --test carrier compatibility and extracted boundary tests: passed 114/114
- pnpm --filter @narada2/cloudflare-carrier test: passed 767/767
- pnpm --filter @narada2/cloudflare-carrier deploy:check: passed; status ok
- pnpm --filter @narada2/cloudflare-carrier deploy:dry-run: passed; 1803.20 KiB bundle with Worker entry, Durable Object, D1, and AI bindings
- git diff --check -- scoped task 2225 files: passed
## Acceptance Criteria

- [x] Operation support, dispatch, and handler ownership have one discoverable source of truth.
- [x] Each bounded context has an independently testable module boundary.
- [x] Existing operation and live workflow tests pass without operation-specific logic remaining in the Worker entry module.
- [x] Unknown operations still fail closed with the existing structured refusal.
