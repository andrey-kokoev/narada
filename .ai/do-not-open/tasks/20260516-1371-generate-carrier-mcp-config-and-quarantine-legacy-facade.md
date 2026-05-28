---
status: closed
no_continuation_needed_rationale: This closes the admitted MCP coverage chapter scope through carrier config generation and legacy facade quarantine; additional MCP expansion should be admitted as new scoped work, not as residual closure for this slice.
closed_at: 2026-05-16T03:21:58.292Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Generate carrier MCP config and quarantine legacy facade

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Provide tested carrier-facing MCP configuration generation for Narada proper and quarantine the old coupled CLI MCP facade after target-local coverage is available.

## Context

narada-andrey generates carrier configs for Codex/Kimi from the MCP surface registry. Narada proper needs equivalent generated config for current and future carriers, while decoupling agent-facing runtime from packages/layers/cli/dist.

## Required Work

1. Implement generated carrier MCP config from the Narada proper surface registry for at least Codex-style and generic stdio client shapes.
2. Ensure generated configs include only transport wiring plus required inherited Narada environment variables, not private client mutation.
3. Add tests proving registry/tool contract drift is detected and missing snippets are reported.
4. Quarantine or mark packages/layers/cli/src/mcp-server.ts as compatibility only after equivalent target-local package coverage exists, with migration guidance.

## Non-Goals

- Do not mutate private user MCP client config.
- Do not remove legacy facade before replacement coverage and tests exist.
- Do not hardcode narada-andrey paths or identities.

## Execution Notes

- Added `packages/narada-proper-mcp/src/carrier-config.ts`.
- Implemented registry-driven carrier MCP config generation for Codex-style and generic stdio client shapes.
- Generated configs include transport wiring and inherited Narada environment variables only, with `private_client_mutation_performed: false`.
- Added missing-snippet reporting for registry/config drift.
- Added `LEGACY_CLI_MCP_FACADE_POSTURE` marking `packages/layers/cli/src/mcp-server.ts` as compatibility-quarantined with migration guidance to `@narada2/narada-proper-mcp`.
- Added tests for config generation, drift detection, and legacy facade quarantine posture.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` - pass, 20 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` - pass.

## Acceptance Criteria

- [x] Carrier config generation is driven by Narada proper registry state and tested.
- [x] Legacy coupled CLI MCP facade has an explicit compatibility/quarantine posture.
- [x] Agent-facing MCP runtime no longer depends on the monolithic packages/layers/cli/dist path for the covered surfaces.
