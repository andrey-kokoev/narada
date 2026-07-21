---
status: closed
depends_on: [2222]
criteria_proved_by: operator
criteria_proved_at: 2026-07-20T23:11:06.532Z
criteria_proof_verification:
  state: unbound
  rationale: Direct verification in this execution turn: module map/config/registry artifacts are present; focused tests 117/117, full carrier suite 767/767, deploy dry-run passed; no external verification-run record is available while MCP surfaces are down.
closed_at: 2026-07-20T23:15:08.817Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Define the Cloudflare carrier module map and configuration boundary

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260720-2223-2229-cloudflare-carrier-organization.md

## Goal

Establish an executable ownership map for the Cloudflare carrier and one normalized configuration boundary before moving implementation code.

## Context

The current Worker module owns multiple bounded contexts and reads environment bindings directly throughout the file. This task defines seams that later extraction tasks can follow without changing runtime semantics.

## Required Work

1. Inventory the current Worker, carrier, adapter, product, persistence, console, and command responsibilities.
2. Document the target module map and import-direction rules in the Cloudflare carrier package.
3. Define a normalized Cloudflare carrier configuration object covering bindings, capabilities, authorities, and secret references without making model environment values authoritative.
4. Define the operation-handler registration contract that later routing extraction can implement.
5. Add focused tests for configuration defaults, required bindings, and prohibited model-selection fallback.

## Non-Goals

- Do not move the Worker implementation in this task.
- Do not change public API operation semantics or deployed bindings beyond the normalized read boundary.
- Do not refactor unrelated local runtime packages.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification


- node --test src/cloudflare-carrier-config.test.mjs src/cloudflare-operation-registry.test.mjs src/cloudflare-carrier.test.mjs src/cloudflare-intelligence-resolution.test.mjs scripts/cloudflare-carrier-live-smoke.test.mjs: passed 117/117
- pnpm --filter @narada2/cloudflare-carrier test: passed 767/767
- pnpm --filter @narada2/cloudflare-carrier deploy:dry-run: passed; 1788.93 KiB bundle with canonical D1, Durable Object, AI bindings and diagnostics default 0
- git diff --check -- scoped task 2223 files: passed
## Acceptance Criteria

- [x] The package contains a reviewed module map naming one owner for each current Worker responsibility.
- [x] Worker code can obtain normalized carrier configuration through one explicit boundary.
- [x] Configuration tests prove diagnostics remain default-off and model environment values have no authority.
- [x] The package test suite and type/build checks pass.
