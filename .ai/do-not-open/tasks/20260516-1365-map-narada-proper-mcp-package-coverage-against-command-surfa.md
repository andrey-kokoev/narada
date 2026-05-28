---
status: closed
no_continuation_needed_rationale: Continuation is already admitted as follow-on tasks 1366-1371 in the same MCP coverage chapter; no additional continuation is required for the scoped matrix task.
closed_at: 2026-05-16T03:18:40.321Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Map Narada proper MCP package coverage against command surfaces

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Create a coverage matrix for existing Narada proper MCP packages against canonical CLI and service families.

## Context

Narada proper already has packages/narada-proper-mcp, packages/mcp-shell-windows, packages/mcp-test-windows, packages/mcp-surface-carrier-supervisor, and legacy packages/layers/cli/src/mcp-server.ts. The task is to describe real coverage and gaps before expanding implementation.

## Required Work

1. Inventory tools exposed by packages/narada-proper-mcp/src/server.ts and compare to packages/layers/cli/src/mcp-server.ts.
2. Map coverage for Site context, inbox, task lifecycle, work-next, agent context, capability/consent, command execution, filesystem, tests, shell/Git, operator surface, Site probe/connectivity/identity/lift, outbox, and publication surfaces.
3. For every missing or intentionally refused surface, record the canonical service or command that should own behavior before MCP exposure.
4. Identify legacy coupled CLI facade behavior that should be quarantined, retained for compatibility, or deleted after replacement.

## Non-Goals

- Do not implement new tools before the matrix names the canonical owner.
- Do not claim full surface coverage from package presence alone.

## Execution Notes

- Inventoried `packages/narada-proper-mcp/src/server.ts` and `packages/layers/cli/src/mcp-server.ts`.
- Added coverage matrix artifact at `kb/operations/narada-proper-mcp-coverage-matrix-20260516.md`.
- Matrix records implemented, partial, missing, refused, and legacy-coupled surfaces across Site context, inbox, task lifecycle, work-next, agent context, capability/consent, command execution, filesystem, tests, shell/Git, operator surface, Site probe/connectivity/identity/lift, outbox, and publication.
- Matrix identifies canonical owners or refusal rationale for missing mutating surfaces and marks the legacy CLI MCP facade as compatibility substrate rather than canonical authority.

## Verification

- `rg -n "server\\.tool|tool\\(|name:" packages\narada-proper-mcp\src\server.ts`
- `rg -n "server\\.tool|tool\\(|name:" packages\layers\cli\src\mcp-server.ts`
- `rg -n "case '|if \\(name|toolName|request.params.name|method === '" packages\narada-proper-mcp\src\server.ts`
- `rg -n "case '|if \\(name|toolName|request.params.name|method === '" packages\layers\cli\src\mcp-server.ts`
- `rg -n "site_task_lifecycle\\.materialize_task|narada_ee_run|Coverage Matrix|Missing Mutating" kb\operations\narada-proper-mcp-coverage-matrix-20260516.md`

## Acceptance Criteria

- [x] Coverage matrix names implemented, partial, missing, refused, and legacy-coupled surfaces.
- [x] Each missing mutating tool has a canonical owner or a refusal rationale.
- [x] Legacy CLI MCP facade quarantine posture is explicit.
