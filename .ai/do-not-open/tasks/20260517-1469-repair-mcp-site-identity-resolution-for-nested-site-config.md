---
status: closed
depends_on: [1464, 1465]
amended_by: narada.architect
amended_at: 2026-05-17T20:32:52.543Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T20:36:32.155Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779050158325_x4zrcf
closed_at: 2026-05-17T20:41:20.596Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Repair MCP Site identity resolution for nested Site config

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1469-1474-principled-narada-andrey-cross-site-inbox-route.md

## Goal

Make MCP traversal resolve target Site identity from both top-level Narada proper config and narada-andrey nested static_config shape.

## Context

The current MCP Site resolver reads top-level config fields only. C:\Users\Andrey\Narada\config.json stores identity under static_config.site_id, so the target root can incorrectly resolve as basename Narada instead of narada-andrey. Route/capability repair must not bind to the wrong Site identity. This task intentionally depends only on the completed route diagnostic/spec tasks; it is a prerequisite for the deferred route-mediated retry, not downstream of that retry.

## Required Work

1. Update both MCP facade resolvers, if still duplicated, to read `static_config.site_id`, `static_config.site_root`, `static_config.site_kind`, and `static_config.locus.authority_locus` as fallback sources after top-level config fields.
2. Preserve existing top-level config behavior for Narada proper.
3. Add focused regression coverage proving a nested static_config target root resolves as `site_id=narada-andrey`.
4. Verify the resolved target Site id is used for cross-Site capability lookup.

## Non-Goals

- Do not mutate narada-andrey config.
- Do not add a route or capability grant in this task.
- Do not rename public config fields.

## Continuation

Continuation Task: task 1471

## Execution Notes

- Amended by narada.architect at 2026-05-17T20:32:52.543Z: context, dependencies.
- Repaired duplicated MCP Site context resolution in `packages/narada-proper-mcp/src/server.ts` and `packages/layers/cli/src/mcp-server.ts`.
- The resolver now reads top-level config first, then nested `static_config` fallbacks for `site_id`, `site_root`, `site_kind`, `workspace_root`, and `locus.authority_locus`.
- Preserved existing top-level config behavior for Narada proper and other current callers.
- Added focused regression coverage in `packages/narada-proper-mcp/test/narada-proper-mcp.test.ts` and `packages/layers/cli/test/commands/mcp-server.test.ts`.
- Updated the narada-proper MCP cross-site capability test so target capability lookup binds to nested `static_config.site_id = narada-andrey`, not the target directory basename.

## Verification

- `narada verify suggest --files packages/narada-proper-mcp/src/server.ts packages/narada-proper-mcp/test/narada-proper-mcp.test.ts packages/layers/cli/src/mcp-server.ts packages/layers/cli/test/commands/mcp-server.test.ts --format json` returned broad `pnpm verify` with low confidence, so focused tests were selected manually from the touched files.
- `narada test-run run --task 1469 --cmd "pnpm --dir packages/narada-proper-mcp exec vitest run test/narada-proper-mcp.test.ts" --scope focused --requester narada.architect --format json` passed as run `run_1779050146524_o6po1r`.
- `narada test-run run --task 1469 --cmd "pnpm --dir packages/layers/cli exec vitest run test/commands/mcp-server.test.ts" --scope focused --requester narada.architect --format json` passed as run `run_1779050158325_x4zrcf`.

## Acceptance Criteria

- [x] Nested static_config identity resolves correctly in tests.
- [x] Existing top-level config resolution still passes.
- [x] Capability lookup uses the corrected target Site id.
