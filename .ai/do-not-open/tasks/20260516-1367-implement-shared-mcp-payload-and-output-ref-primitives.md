---
status: closed
no_continuation_needed_rationale: Continuation is already admitted as follow-on MCP coverage tasks 1368-1371; no additional continuation is required for the payload/output ref primitive slice.
closed_at: 2026-05-16T03:19:56.447Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement shared MCP payload and output ref primitives

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Add target-local payload_ref and output_ref primitives for Narada proper MCP tools so large inputs and outputs remain bounded and reconstructable.

## Context

C:/Users/Andrey/Narada/tools/mcp-payload-file.mjs provides immutable mcp_payload refs and mcp_output refs. Narada proper should lift the pattern into packages, de-arbitrized and tested.

## Required Work

1. Implement or package shared mcp_payload and mcp_output helpers under Narada proper package conventions.
2. Support immutable payload revisions, payload validation, wrong-ref-family errors, size limits, stable hashes, and transient-not-authority markers.
3. Support bounded output locators and a readback tool/utility for large JSON results.
4. Add tests proving long inline payloads are refused where required and output truncation preserves a durable readback ref.

## Non-Goals

- Do not store secrets or raw provider transcripts in payload/output refs.
- Do not make transient payload refs authority records.

## Execution Notes

- Added `packages/narada-proper-mcp/src/payload-output.ts` with shared MCP payload/output ref helpers.
- Payload refs use stable sorted JSON hashes, immutable content-addressed revisions, size limits, wrong-ref-family validation, and transient transport-not-authority markers.
- Output helpers return inline results under a limit and durable `mcp_output:<hash>` refs for bounded readback when truncated.
- Exported helpers through `packages/narada-proper-mcp/src/index.ts`.
- Added tests for immutability, stable hashing, size refusal, wrong ref family, output truncation, durable readback, and transient-not-authority posture.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` - pass, 12 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` - pass.

## Acceptance Criteria

- [x] Payload and output ref helpers are available to Narada proper MCP packages.
- [x] Tests cover immutability, size limits, wrong ref family, hashing, and bounded output.
- [x] Tool results clearly mark payload refs as transient transport, not authority.
