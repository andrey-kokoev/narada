# Implement doctrine grounding MCP lift package for telemetry inquiries

## Chapter

Site Telemetry Publication / Inquiry Doctrine Feedback

## Goal

Implement or specify the MCP doctrine-grounding surface needed for telemetry design questions.

## Context

Implements the doctrine-grounding MCP lift request path needed for telemetry inquiries. Task 1415 intake remains unfinished, so this slice exposes public doctrine references and explicitly blocks private Inquiry Space data import.

## Required Work

1. Inspect existing MCP facade/tool exposure and the Inquiry Doctrine Feedback intake contract from task 1415.
2. Package the requested doctrine grounding command capability as liftable machinery without copying private Inquiry Space data.
3. Add tests or fixtures proving tool discovery/request shape and blocked/unavailable behavior.
4. Update docs so agents know the correct command surface for doctrine grounding once available.
5. Run focused MCP/package tests and record any dependency on narada-andrey response.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Inspected the Narada proper MCP facade, surface registry, and tests.
- Read task 1415 posture; it remains claimed and incomplete, so private Inquiry Space replay is not available to import.
- Added read-only MCP tool `narada_doctrine_grounding_refs`.
- The tool returns public doctrine refs for bounded design questions and includes a telemetry ownership proof case.
- The tool returns `blocked` when `require_inquiry_space_data` is true and instructs routing through Canonical Inbox / Inquiry Space authority instead of copying private records.
- Registered the tool as read-only in the Narada proper MCP surface registry.
- Added `docs/product/site-telemetry-doctrine-grounding-mcp.v0.md` and linked it from the telemetry outcome-shapes doc.
- Added tests for tool discovery, read-only telemetry ownership grounding refs, and blocked private Inquiry Space data behavior.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` passed: 24 tests.
- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
- `git diff --check -- packages/narada-proper-mcp/src/server.ts packages/narada-proper-mcp/src/surface-registry.ts packages/narada-proper-mcp/test/narada-proper-mcp.test.ts docs/product/site-telemetry-doctrine-grounding-mcp.v0.md docs/product/site-telemetry-publication-outcome-shapes.md` passed, with line-ending warnings only for pre-existing LF/CRLF normalization posture.

## Acceptance Criteria

- [x] Doctrine-grounding MCP command or clear lift spec exists.
- [x] Tests prove read-only doctrine ref output.
- [x] Telemetry ownership question is covered as proof case.
