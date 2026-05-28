---
status: confirmed
depends_on: [1433, 1463, 1474]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:16:19.435Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779052496205_k9ff4x
closed_at: 2026-05-17T21:16:47.098Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Implement dry-run Site Registry relation publication planner

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1475-1481-separate-site-telemetry-from-site-registry.md

## Goal

Add the first non-live CLI/MCP slice for planning a Site Registry relation transition without network transport or secret resolution.

## Context

The immediate coherent implementation is a planner that builds and validates the relation transition payload from evidence refs. Live publish can remain blocked until credentials and registry-owner capability are admitted.

## Required Work

1. Add a CLI dry-run planner under the Site Registry command family specified in the previous task.
2. Expose an MCP-specific dry-run planner if the Narada proper MCP facade is the right agent-facing surface.
3. Reuse existing `SiteRegistryRelationTransitionInput` validation semantics where possible instead of inventing a parallel payload grammar.
4. Return bounded JSON with transition payload preview, capability ref, credential resolution posture, authority limits, and live_network_performed=false.
5. Add focused tests for valid plan, missing evidence, raw-secret marker refusal, and no network/secret resolution.

## Non-Goals

- Do not perform live fetch.
- Do not resolve raw tokens.
- Do not mutate Cloudflare D1/KV.
- Do not mutate target Site authority.

## Continuation

Continuation Task: task 1480 plans the live Site Registry relation publication capability as a separate admitted crossing.

## Execution Notes

- Added `narada site-registry relation plan-transition` as a dry-run CLI planner.
- Added `site_registry_relation_plan_transition` to the Narada proper MCP facade, delegating to the canonical CLI without marking the tool as a mutation.
- Exported the Cloudflare worker's relation-transition validator for reuse posture, while the CLI keeps a local mirror of the same validation semantics to avoid depending on stale built package output in workspace tests.
- Added focused CLI and MCP coverage for planned output, missing evidence refusal, raw-secret marker refusal, and no live network/mutation posture.

## Verification

- `pnpm --dir packages/layers/cli exec vitest run test/commands/site-registry.test.ts` - passed, 3 tests.
- `pnpm --dir packages/narada-proper-mcp exec vitest run test/narada-proper-mcp.test.ts` - passed, 26 tests.
- `pnpm --dir packages/site-registry-cloudflare exec vitest run test/worker-boundary.test.ts` - passed, 40 tests.
- `narada test-run run --task 1479 --cmd "pnpm --dir packages/layers/cli exec vitest run test/commands/site-registry.test.ts"` - passed, run `run_1779052496261_2ns9u5`.
- `narada test-run run --task 1479 --cmd "pnpm --dir packages/narada-proper-mcp exec vitest run test/narada-proper-mcp.test.ts"` - passed, run `run_1779052496260_z68g9i`.
- `narada test-run run --task 1479 --cmd "pnpm --dir packages/site-registry-cloudflare exec vitest run test/worker-boundary.test.ts"` - passed, run `run_1779052496205_k9ff4x`.
- `git diff --check -- packages/layers/cli/src/main.ts packages/layers/cli/src/commands/site-registry.ts packages/layers/cli/src/commands/site-registry-register.ts packages/layers/cli/test/commands/site-registry.test.ts packages/narada-proper-mcp/src/server.ts packages/narada-proper-mcp/test/narada-proper-mcp.test.ts packages/site-registry-cloudflare/src/index.ts` - passed; line-ending warnings only.

## Acceptance Criteria

- [x] Dry-run planner command exists.
- [x] Planner is exposed to agents through an MCP-specific command or an explicit residual explains why not.
- [x] Focused tests prove no network, no raw secrets, and correct payload/refusal shape.
