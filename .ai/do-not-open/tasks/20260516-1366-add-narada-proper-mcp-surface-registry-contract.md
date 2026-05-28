---
status: closed
no_continuation_needed_rationale: Continuation is already admitted as follow-on MCP coverage tasks 1367-1371; no additional continuation is required for the registry contract slice.
closed_at: 2026-05-16T03:19:19.804Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add Narada proper MCP surface registry contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Introduce a target-local MCP surface registry contract for Narada proper packages without importing narada-andrey identities or runtime authority.

## Context

narada-andrey has .narada/capabilities/mcp-surfaces.json and validation/generation tooling. Narada proper needs an equivalent package-backed contract that can describe target-local surfaces and generated client snippets without making client config the authority.

## Required Work

1. Define a Narada proper registry schema or package contract for surface_id, surface_type, semantic purpose, runtime binding, authority boundary, tool contract, evidence refs, failure modes, and generated client config posture.
2. Implement validation tests proving read-only and mutating tool lists are subsets of exposed tools and that generated snippets are transport wiring only.
3. Populate registry records for existing Narada proper MCP packages and mark unimplemented surfaces as planned or refused rather than live.
4. Ensure source evidence from C:/Users/Andrey/Narada is recorded as provenance, not authority.

## Non-Goals

- Do not write private MCP client config outside Narada proper.
- Do not declare unavailable surfaces as live.

## Execution Notes

- Added `packages/narada-proper-mcp/src/surface-registry.ts` with a target-local MCP surface registry contract.
- Registry records include surface id/type, semantic purpose, runtime binding, authority boundary, tool contract, evidence refs, failure modes, generated client config posture, and provenance.
- Populated records for `@narada2/narada-proper-mcp`, `@narada2/mcp-shell-windows`, `@narada2/mcp-test-windows`, and `@narada2/mcp-surface-carrier-supervisor`.
- Marked descriptor/unimplemented surfaces as planned/refused rather than live.
- Recorded `C:/Users/Andrey/Narada` as provenance only, with `source_refs_are_authority: false`.
- Exported the registry and validator through `packages/narada-proper-mcp/src/index.ts`.
- Added tests proving read-only/mutating tool declarations are subsets of exposed tools, generated snippets are transport wiring only, and stale/provenance-authority declarations fail validation.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` - pass, 9 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` - pass.

## Acceptance Criteria

- [x] Narada proper has an inspectable MCP surface registry contract with tests.
- [x] Registry entries distinguish package contract, runtime binding, target Site authority, and transport projection.
- [x] Validation catches stale or mismatched tool declarations.
