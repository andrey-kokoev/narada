---
status: closed
depends_on: [2222, 2225]
criteria_proved_by: operator
criteria_proved_at: 2026-07-21T00:53:51.188Z
criteria_proof_verification:
  state: unbound
  rationale: MCP surfaces unavailable; evidence was collected through the repository task CLI, PowerShell, local tests, deployment checks, and authenticated live carrier smoke.
closed_at: 2026-07-21T00:58:34.348Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Extract provider, tool-effect, and intelligence adapter modules

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260720-2223-2229-cloudflare-carrier-organization.md

## Goal

Make provider transport, canonical intelligence resolution, tool effects, and task storage explicit adapters rather than Worker-local implementation blocks.

## Context

Workers AI transport, diagnostic policy, canonical gateway invocation, tool-effect admission, and D1 task storage are currently constructed in the Worker module and depend directly on the raw environment.

## Required Work

1. Move the Workers AI adapter and transport envelope conversion into a provider adapter module.
2. Move canonical intelligence gateway composition and provider outcome normalization behind an adapter contract.
3. Move tool-effect and task-store adapter construction behind explicit capability-scoped factories.
4. Ensure diagnostic injection remains an explicitly gated synthetic lane and cannot claim provider transport submission.
5. Add adapter contract tests for real-provider posture, refusal, failure, timeout, uncertainty, retry, and tool-loop outcomes.

## Non-Goals

- Do not introduce a Cloudflare-specific intelligence ontology.
- Do not add model-selection environment authority.
- Do not change provider selection semantics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

- node --test src/cloudflare-provider-adapter.test.mjs src/cloudflare-tool-effect-adapter.test.mjs src/cloudflare-d1-task-store-adapter.test.mjs src/cloudflare-intelligence-resolution.test.mjs src/cloudflare-carrier.test.mjs: 115 tests passed
- pnpm test: 768 tests passed
- pnpm run deploy:check: status ok
- pnpm run intelligence:deploy:dry-run: ok; 31 catalog records and 3 materializations
- pnpm run deploy:dry-run: ok; Wrangler bundle 1813.05 KiB

## Acceptance Criteria

- [x] The Worker composes adapters but does not implement provider transport details.
- [x] Adapter contracts expose canonical invocation, outcome, evidence, and transport posture distinctly.
- [x] Diagnostic and ordinary provider paths remain observably distinct in unit and live smoke evidence.
- [x] The full carrier suite and authenticated live smoke pass.
