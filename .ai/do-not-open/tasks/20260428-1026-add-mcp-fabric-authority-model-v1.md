---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T14:00:40.217Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented and verified MCP fabric v1: fabric context tool, target Site resolution, traversal metadata, cross-Site mutation refusal, focused MCP tests 11/11, CLI typecheck pass, CLI build pass.
amended_by: architect
amended_at: 2026-04-28T14:01:34.465Z
closed_at: 2026-04-28T14:01:47.284Z
closed_by: architect
governed_by: task_close:architect
closure_mode: peer_reviewed
---

# Task 1026: Add MCP fabric authority model v1

## Goal

Implement the smallest governed MCP fabric proof: read-only target Site traversal with traversal evidence and refusal of cross-Site mutation until capability-governed mutation exists.

## Context

<!-- Context placeholder -->

## Required Work

1. Add an MCP fabric context tool that explains the current traversal posture.
2. Add optional target Site addressing to MCP tool calls.
3. Resolve target Sites through explicit `site_root` or the source Site routing-addressing registry.
4. Attach traversal metadata to MCP tool responses.
5. Refuse cross-Site MCP mutation until a capability-governed mutation path exists.
6. Document the v1 boundary in the MCP facade concept doc.
7. Add focused tests and run bounded verification.

## Non-Goals

- Do not build a long-lived gateway, daemon pool, or auto-discovery swarm.
- Do not allow cross-Site mutation through MCP fabric v1.
- Do not bypass canonical CLI/application services.
- Do not create derivative task-status files.

## Execution Notes

1. Added `narada_mcp_fabric_context` to expose governed traversal posture without mutation.
2. Added optional `target` arguments to MCP tools, supporting explicit `site_root` and routing-registry `site` references.
3. Implemented traversal resolution in `mcp-server.ts`, including source Site, target Site, route, resolution mode, cross-Site posture, mutation posture, and capability posture.
4. Wired read-only MCP tools to run against the resolved target Site root while preserving `facade_only` authority posture.
5. Refused cross-Site MCP mutation in v1 with structured error output and traversal metadata instead of attempting consequence.
6. Attached traversal metadata to command-backed MCP responses so callers can inspect routing and authority posture.
7. Documented Fabric v1 in `docs/concepts/narada-mcp-facade.md` as read-only governed traversal, not cross-Site mutation.
8. Added focused MCP tests for fabric context, explicit target resolution, routing-registry target resolution, traversal metadata, and mutation refusal.

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @narada2/cli exec vitest run test/commands/mcp-server.test.ts` | Pass: 11/11 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |

## Acceptance Criteria

- [x] MCP exposes fabric context.
- [x] Read-only MCP tools can resolve explicit or routed target Sites.
- [x] Responses include traversal metadata.
- [x] Cross-Site MCP mutation is refused with structured posture.
- [x] Focused MCP tests pass.
- [x] CLI typecheck passes.
- [x] CLI build passes.
