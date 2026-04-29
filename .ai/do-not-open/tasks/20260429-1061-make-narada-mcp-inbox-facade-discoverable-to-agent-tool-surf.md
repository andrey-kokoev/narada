---
status: closed
amended_by: architect
amended_at: 2026-04-29T00:36:22.066Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-29T00:37:19.465Z
criteria_proof_verification:
  state: unbound
  rationale: MCP discovery docs added; MCP facade tests, typecheck, and pnpm verify passed.
closed_at: 2026-04-29T00:37:24.481Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1061 — Make Narada MCP inbox facade discoverable to agent tool surfaces

## Chapter

MCP Inbox Tool Surface Ergonomics

## Goal

Close the gap between the implemented narada-mcp inbox tools and fresh agent sessions that cannot discover or invoke them through tool_search/app MCP surfaces.

## Context

Narada proper already has `narada-mcp` and MCP inbox tools. The remaining friction is operational discovery: an agent sees only MCP servers configured in its client/tool surface. Repository existence is not tool availability.

## Required Work

1. Inspect existing MCP facade tools and tests.
2. Document how a fresh agent or Operator exposes `narada-mcp` to an MCP client.
3. Make the Site scoping, `ControlChannel` status, and authority limits explicit.
4. Verify the current MCP server still lists inbox tools and preserves inert inbox submission semantics.

## Non-Goals

- Do not mutate local Codex configuration in this task.
- Do not introduce cross-Site MCP mutation authority.
- Do not treat MCP tool discovery as proof of Site authority or capability grant.

## Execution Notes

1. Added an Agent Tool Discovery section to `docs/concepts/narada-mcp-facade.md`.
2. Documented MCP client configuration examples for Narada proper, contained Project Sites, and repo-local binary fallback.
3. Documented the read-only proof path: tool listing includes inbox tools and `narada_site_context` returns the intended Site with `authority_posture: "facade_only"`.
4. Reaffirmed that MCP configuration is a `ControlChannel`; mutating tools still delegate to canonical services and create inert envelopes plus mutation evidence.

## Verification

| Command | Result |
| --- | --- |
| `pnpm vitest run packages/layers/cli/test/commands/mcp-server.test.ts` | Passed: 1 file, 11 tests |
| `pnpm typecheck` | Passed |

## Acceptance Criteria

- [x] Docs explain how a fresh agent or Operator exposes narada-mcp to Codex/MCP clients
- [x] Configuration or install surface exists or a precise implementation path is specified
- [x] The path preserves Site authority and inert inbox submission semantics
- [x] Verification covers tool listing or a bounded documented manual proof
- [x] pnpm verify passes
